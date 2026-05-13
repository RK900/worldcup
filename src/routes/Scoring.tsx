import { Link } from 'react-router-dom';
import { MATCHES_BY_ROUND } from '@/data/bracket';
import {
  GROUP_POSITION_EXACT_POINTS,
  GROUP_POSITION_NEAR_POINTS,
  MAX_SCORE,
  ROUND_POINTS,
  THIRD_PLACE_GROUP_POINTS,
} from '@/lib/scoring';
import type { Round } from '@/lib/types';

const ROUND_LABELS: Record<Round, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  '3rd': '3rd-place playoff',
  F: 'Final',
};

const ROUND_ORDER: Round[] = ['R32', 'R16', 'QF', 'SF', '3rd', 'F'];

const koTotalsByRound = ROUND_ORDER.map((r) => {
  const matches = MATCHES_BY_ROUND[r]?.length ?? 0;
  return { round: r, perMatch: ROUND_POINTS[r], matches, total: matches * ROUND_POINTS[r] };
});

const KO_TOTAL = koTotalsByRound.reduce((s, r) => s + r.total, 0);
const GROUP_PLACEMENT_TOTAL = 12 * 4 * GROUP_POSITION_EXACT_POINTS;
const THIRD_PLACE_TOTAL = 8 * THIRD_PLACE_GROUP_POINTS;
const GROUP_TOTAL = GROUP_PLACEMENT_TOTAL + THIRD_PLACE_TOTAL;

export function Scoring() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="rounded-lg border border-border bg-surface p-6">
        <p className="text-xs uppercase tracking-widest text-muted">How scoring works</p>
        <h1 className="mt-1 text-2xl font-semibold">{MAX_SCORE} points up for grabs</h1>
        <p className="mt-3 text-sm text-muted">
          Group stage <span className="text-text">{GROUP_TOTAL}</span> ·{' '}
          Knockout <span className="text-text">{KO_TOTAL}</span> · Live scoring via ESPN
        </p>
      </header>

      <Section title="Group stage placement" right={`${GROUP_PLACEMENT_TOTAL} pts`}>
        <p>
          For each of the 12 groups, predict 1st through 4th. Points awarded per team based on
          how close your prediction is to the actual finishing position.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li className="flex items-baseline justify-between">
            <span>Exact position</span>
            <span className="font-mono text-text">{GROUP_POSITION_EXACT_POINTS} pts</span>
          </li>
          <li className="flex items-baseline justify-between">
            <span>Off by one slot</span>
            <span className="font-mono text-text">{GROUP_POSITION_NEAR_POINTS} pt</span>
          </li>
          <li className="flex items-baseline justify-between">
            <span>Off by two or more slots</span>
            <span className="font-mono text-text">0 pts</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          Max per group: {4 * GROUP_POSITION_EXACT_POINTS} (4 teams × {GROUP_POSITION_EXACT_POINTS} exact). Across 12 groups: {GROUP_PLACEMENT_TOTAL}.
        </p>

        <h3 className="mt-5 mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
          Examples (one group)
        </h3>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Outcome</th>
                <th className="px-3 py-2 text-left font-semibold">Per team</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { label: 'Perfect (1-2-3-4)', perTeam: '2 + 2 + 2 + 2', total: 8 },
                { label: 'Top two swapped (2-1-3-4)', perTeam: '1 + 1 + 2 + 2', total: 6 },
                { label: 'Both pairs swapped (2-1-4-3)', perTeam: '1 + 1 + 1 + 1', total: 4 },
                { label: 'Full reverse (4-3-2-1)', perTeam: '0 + 1 + 1 + 0', total: 2 },
                { label: 'Halves swapped (3-4-1-2)', perTeam: '0 + 0 + 0 + 0', total: 0 },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="px-3 py-2 text-text">{row.label}</td>
                  <td className="px-3 py-2 font-mono text-muted">{row.perTeam}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-text">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Best 3rd-place advancers" right={`${THIRD_PLACE_TOTAL} pts`}>
        <p>
          Pick which 8 of the 12 third-place groups will advance to the Round of 32.
        </p>
        <p className="mt-2">
          <span className="font-mono text-text">{THIRD_PLACE_GROUP_POINTS} pt</span> per correctly
          identified group. Max <span className="font-mono text-text">{THIRD_PLACE_TOTAL}</span>.
        </p>
        <p className="mt-2 text-xs text-muted">
          This is decoupled from your group placements: you get the point if the group's
          actual 3rd-place team advances, even if you predicted a different team in 3rd.
        </p>
      </Section>

      <Section title="Knockout rounds" right={`${KO_TOTAL} pts`}>
        <p>
          Pick the winner of each match. Round weights roughly double through the tournament.
        </p>
        <div className="mt-3 overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Round</th>
                <th className="px-3 py-2 text-right font-semibold">Per match</th>
                <th className="px-3 py-2 text-right font-semibold">Matches</th>
                <th className="px-3 py-2 text-right font-semibold">Round total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {koTotalsByRound.map((r) => (
                <tr key={r.round}>
                  <td className="px-3 py-2 text-text">{ROUND_LABELS[r.round]}</td>
                  <td className="px-3 py-2 text-right font-mono">{r.perMatch}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{r.matches}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-text">
                    {r.total}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr>
                <td className="px-3 py-2 font-semibold">Total</td>
                <td colSpan={2} />
                <td className="px-3 py-2 text-right font-mono font-semibold text-accent">
                  {KO_TOTAL}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <Section title="Max attainable">
        <p>
          Next to your score, you'll see your maximum attainable total. It's your locked-in
          points plus everything that's still possible — and it drops in two ways:
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            A game gets scored. Whatever you picked is locked in (right or wrong) and the
            round's points come off the "still possible" pile.
          </li>
          <li>
            A team you picked to win a later round loses earlier. That pick's points drop off
            your max immediately.
          </li>
        </ol>
        <p className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          Example: you pick Brazil to win the Final. Brazil loses in R32. Your max drops by{' '}
          <span className="font-mono text-text">{ROUND_POINTS.F}</span> pts immediately — the
          Final isn't reachable for you anymore, even before it's played.
        </p>
      </Section>

      <Section title="Tiebreaker">
        <p>
          Ties on the leaderboard sort alphabetically by nickname.
        </p>
      </Section>

      <Section title="Live updates">
        <p>
          Scores update automatically. A GitHub Action polls ESPN every 30 minutes during the
          tournament window (Jun 11 → Jul 20, 2026) and writes results to the database.
        </p>
        <p className="mt-2 text-xs text-muted">
          The admin can manually correct any result, and manual entries take precedence over
          the auto-poller.
        </p>
      </Section>

      <div className="text-center">
        <Link to="/" className="text-sm text-muted hover:text-text">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right && <span className="text-sm font-mono text-accent">{right}</span>}
      </div>
      <div className="text-sm text-muted">{children}</div>
    </section>
  );
}
