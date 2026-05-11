// ESPN scoreboard → Firestore /results/wc2026 poller.
//
// Runs on a GitHub Actions cron every 30 min during the tournament window.
// For each of our 32 knockout matches, the script:
//   1. Reads the current /results/wc2026 doc (admin's manual entries).
//   2. Computes the expected home/away teams for each KO match by walking
//      the bracket graph with whatever's been resolved so far.
//   3. Looks for a completed ESPN event whose two competitors match the
//      expected pair (regardless of home/away orientation).
//   4. If the ESPN event has a winner flagged, writes that winner into
//      the picks blob.
// Never overwrites an existing winner — admin's manual entries are sticky.
//
// Group stage standings + best-3 advancers are NOT pulled by this script.
// ESPN's tiebreakers don't always line up with FIFA's, and getting it
// wrong would invalidate every bracket. Admin enters those by hand once
// the group stage ends; the poller takes over for the 32 KO matches.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { MATCHES } from '../src/data/bracket';
import { mapThirdPlaceAdvancers } from '../src/lib/thirdPlaceMap';
import { resolveSlot } from '../src/lib/resolveBracket';
import type { BracketPicks, Round, TeamCode } from '../src/lib/types';

const ESPN_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Window we poll across — wide enough to cover the whole tournament.
// Outside this window, the script exits early.
const TOURNAMENT_START = Date.parse('2026-06-11T00:00:00Z');
const TOURNAMENT_END = Date.parse('2026-07-20T23:59:59Z');

const DRY_RUN = process.argv.includes('--dry-run');

// ESPN abbreviations that differ from our team codes. Add entries as
// they're discovered. Anything not listed is assumed to match (most do).
const ESPN_ABBR_OVERRIDES: Record<string, TeamCode> = {
  // Confirmed during a 2026-05-10 spike — ESPN uses standard FIFA codes
  // for the WC 2026 squads (MEX, RSA, BRA, USA, etc.). Add overrides
  // here when the poller logs an "unknown ESPN abbreviation" warning.
};

interface EspnCompetitor {
  team: { abbreviation: string; displayName: string };
  homeAway: 'home' | 'away';
  winner: boolean;
}

interface EspnEvent {
  id: string;
  date: string;
  name: string;
  season?: { slug?: string };
  status?: { type?: { completed?: boolean } };
  competitions?: { competitors?: EspnCompetitor[] }[];
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

function slugToRound(slug: string | undefined): Round | null {
  if (!slug) return null;
  const s = slug.toLowerCase();
  if (s.includes('round-of-32') || s === 'r32') return 'R32';
  if (s.includes('round-of-16') || s === 'r16') return 'R16';
  if (s.includes('quarter')) return 'QF';
  if (s.includes('semi')) return 'SF';
  if (s.includes('third') || s.includes('3rd')) return '3rd';
  if (s === 'final' || s.endsWith('-final')) return 'F';
  return null;
}

function espnToOurCode(abbr: string): TeamCode {
  return ESPN_ABBR_OVERRIDES[abbr] ?? abbr;
}

async function fetchScoreboard(dateRange: string): Promise<EspnEvent[]> {
  const url = `${ESPN_BASE}?dates=${dateRange}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN responded ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as EspnScoreboard;
  return data.events ?? [];
}

function initFirestore(): Firestore {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
  }
  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${(e as Error).message}`,
    );
  }
  initializeApp({ credential: cert(creds as Parameters<typeof cert>[0]) });
  return getFirestore();
}

interface PollResult {
  considered: number;
  updates: { matchId: number; round: Round; winner: TeamCode }[];
  skipped: { matchId: number; reason: string }[];
}

function pollKnockoutWinners(
  picks: BracketPicks,
  events: EspnEvent[],
): { nextPicks: BracketPicks; result: PollResult } {
  const next = structuredClone(picks);
  const considered: number[] = [];
  const updates: PollResult['updates'] = [];
  const skipped: PollResult['skipped'] = [];

  for (const m of MATCHES) {
    if (m.round === undefined) continue;
    // Skip if a winner is already recorded (admin manual override stays).
    if (next.knockout[m.id]?.winner) continue;

    considered.push(m.id);
    // Cascade-aware home/away — re-derived on each iteration so winners
    // we just set propagate downstream in this same pass.
    const mapping = mapThirdPlaceAdvancers(next.thirdPlace.advancingGroups);
    const expectedHome = resolveSlot(m.home, next, mapping);
    const expectedAway = resolveSlot(m.away, next, mapping);
    if (!expectedHome || !expectedAway) {
      skipped.push({
        matchId: m.id,
        reason: 'home/away not yet resolvable (need group results or prior round)',
      });
      continue;
    }

    const pair = new Set([expectedHome, expectedAway]);
    const event = events.find((e) => {
      if (!e.status?.type?.completed) return false;
      const round = slugToRound(e.season?.slug);
      if (round !== m.round) return false;
      const competitors = e.competitions?.[0]?.competitors ?? [];
      if (competitors.length !== 2) return false;
      const codes = new Set(competitors.map((c) => espnToOurCode(c.team.abbreviation)));
      return codes.size === 2 && pair.size === 2 &&
        [...pair].every((p) => codes.has(p));
    });

    if (!event) {
      skipped.push({
        matchId: m.id,
        reason: `no completed ESPN event matches ${expectedHome} vs ${expectedAway}`,
      });
      continue;
    }

    const winnerComp = event.competitions?.[0]?.competitors?.find((c) => c.winner);
    if (!winnerComp) {
      skipped.push({
        matchId: m.id,
        reason: `ESPN event ${event.id} marked completed but no winner flag set`,
      });
      continue;
    }

    const winner = espnToOurCode(winnerComp.team.abbreviation);
    next.knockout[m.id] = { winner };
    updates.push({ matchId: m.id, round: m.round, winner });
  }

  return {
    nextPicks: next,
    result: { considered: considered.length, updates, skipped },
  };
}

async function main() {
  const now = Date.now();
  if (now < TOURNAMENT_START || now > TOURNAMENT_END) {
    console.log(
      `Outside tournament window (${new Date(TOURNAMENT_START).toISOString()} → ${new Date(TOURNAMENT_END).toISOString()}); exiting.`,
    );
    return;
  }

  // Pull a wide date range — ESPN's scoreboard returns full event objects
  // either way, and a single request is cheap.
  const dateRange = '20260611-20260720';
  let events: EspnEvent[];
  try {
    events = await fetchScoreboard(dateRange);
    console.log(`Fetched ${events.length} ESPN events for ${dateRange}.`);
  } catch (e) {
    console.error(`ESPN fetch failed: ${(e as Error).message}`);
    // Soft-fail on ESPN outage — don't alarm the workflow over a transient.
    return;
  }

  const db = initFirestore();
  const ref = db.collection('results').doc('wc2026');
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(
      'No /results/wc2026 doc yet. Admin must seed group standings via /admin before the poller can map KO matches.',
    );
    return;
  }

  const current = snap.data() as { picks: BracketPicks } | undefined;
  if (!current?.picks) {
    console.log('/results/wc2026 exists but has no picks blob; skipping.');
    return;
  }

  const { nextPicks, result } = pollKnockoutWinners(current.picks, events);

  console.log(
    `Considered ${result.considered} unresolved matches; ${result.updates.length} new winners.`,
  );
  for (const u of result.updates) {
    console.log(`  + M${u.matchId} (${u.round}) winner: ${u.winner}`);
  }
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length}:`);
    for (const s of result.skipped.slice(0, 5)) {
      console.log(`  - M${s.matchId}: ${s.reason}`);
    }
    if (result.skipped.length > 5) {
      console.log(`  … and ${result.skipped.length - 5} more`);
    }
  }

  if (result.updates.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN — not writing.');
    return;
  }

  await ref.set({
    picks: nextPicks,
    lastUpdated: Date.now(),
    lastUpdatedBy: 'espn-cron',
  });
  console.log(`Wrote ${result.updates.length} winners to /results/wc2026.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
