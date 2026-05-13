import { MATCHES, MATCHES_BY_ROUND } from '@/data/bracket';
import { GROUP_LETTERS } from '@/data/groups';
import { TEAM_CODES } from '@/data/teams';
import { resolveSlot } from '@/lib/resolveBracket';
import { mapThirdPlaceAdvancers } from '@/lib/thirdPlaceMap';
import type { BracketPicks, GroupLetter, Round, TeamCode } from '@/lib/types';

// Round point weights — doubling per knockout round; 3rd-place sits at SF
// value (consolation match, meaningful but not the Final). Each weight is
// 2× the original to push more of the total toward the knockouts.
export const ROUND_POINTS: Record<Round, number> = {
  R32: 2,
  R16: 4,
  QF: 8,
  SF: 16,
  '3rd': 16,
  F: 32,
};

// Tiered group placement scoring (Option C):
//   - Exact match (predicted team is in its actual finishing slot): 2 pts
//   - Off by one slot:                                                1 pt
//   - Off by two or more slots:                                       0 pts
// Max per group = 4 slots × 2 = 8. Max across 12 groups = 96.
export const GROUP_POSITION_EXACT_POINTS = 2;
export const GROUP_POSITION_NEAR_POINTS = 1;

// 1 point per correctly identified advancing third-place group. 8 max.
export const THIRD_PLACE_GROUP_POINTS = 1;

export interface BracketScore {
  total: number;
  groupPoints: number;
  thirdPlacePoints: number;
  knockoutPointsByRound: Record<Round, number>;
  knockoutTotal: number;
}

export function scoreBracket(picks: BracketPicks, results: BracketPicks): BracketScore {
  let groupPoints = 0;
  for (const letter of GROUP_LETTERS) {
    groupPoints += scoreGroup(letter, picks, results);
  }

  const thirdPlacePoints = scoreThirdPlace(picks, results);

  const knockoutPointsByRound: Record<Round, number> = {
    R32: 0,
    R16: 0,
    QF: 0,
    SF: 0,
    '3rd': 0,
    F: 0,
  };

  for (const round of Object.keys(ROUND_POINTS) as Round[]) {
    const matches = MATCHES_BY_ROUND[round] ?? [];
    let roundPts = 0;
    for (const m of matches) {
      const picked = picks.knockout[m.id]?.winner ?? null;
      const actual = results.knockout[m.id]?.winner ?? null;
      if (picked !== null && actual !== null && picked === actual) {
        roundPts += ROUND_POINTS[round];
      }
    }
    knockoutPointsByRound[round] = roundPts;
  }

  const knockoutTotal = Object.values(knockoutPointsByRound).reduce(
    (a, b) => a + b,
    0,
  );

  return {
    total: groupPoints + thirdPlacePoints + knockoutTotal,
    groupPoints,
    thirdPlacePoints,
    knockoutPointsByRound,
    knockoutTotal,
  };
}

function scoreGroup(
  letter: GroupLetter,
  picks: BracketPicks,
  results: BracketPicks,
): number {
  const p = picks.groups[letter]?.order;
  const r = results.groups[letter]?.order;
  if (!p || !r) return 0;
  let pts = 0;
  for (let i = 0; i < 4; i++) {
    const predicted = p[i];
    if (!predicted) continue;
    // Find where the predicted team actually finished. indexOf returns -1
    // if the team isn't in this group's actual order (e.g., results not
    // yet entered for this group).
    const actualPos = r.indexOf(predicted);
    if (actualPos === -1) continue;
    const distance = Math.abs(i - actualPos);
    if (distance === 0) pts += GROUP_POSITION_EXACT_POINTS;
    else if (distance === 1) pts += GROUP_POSITION_NEAR_POINTS;
  }
  return pts;
}

function scoreThirdPlace(picks: BracketPicks, results: BracketPicks): number {
  const picked = new Set(picks.thirdPlace.advancingGroups);
  const actual = new Set(results.thirdPlace.advancingGroups);
  let pts = 0;
  for (const g of picked) {
    if (actual.has(g)) pts += THIRD_PLACE_GROUP_POINTS;
  }
  return pts;
}

// Theoretical maximum score (used to show "X / max" in the leaderboard).
export const MAX_SCORE: number = (() => {
  let knockout = 0;
  for (const round of Object.keys(ROUND_POINTS) as Round[]) {
    knockout += (MATCHES_BY_ROUND[round]?.length ?? 0) * ROUND_POINTS[round];
  }
  const groups = GROUP_LETTERS.length * 4 * GROUP_POSITION_EXACT_POINTS;
  const thirds = 8 * THIRD_PLACE_GROUP_POINTS;
  return knockout + groups + thirds;
})();

// Compute the set of teams still alive in the tournament given the
// current results. A team is alive unless:
//   - Their group is fully scored AND they finished 4th, OR
//   - Their group is fully scored AND best-3 advancers is set AND they
//     finished 3rd in a non-advancing group, OR
//   - They were a competitor in a scored knockout match and lost.
export function computeAliveTeams(results: BracketPicks): Set<TeamCode> {
  const alive = new Set<TeamCode>(TEAM_CODES);

  // Group stage eliminations.
  for (const letter of GROUP_LETTERS) {
    const order = results.groups[letter]?.order ?? [null, null, null, null];
    if (order[3]) alive.delete(order[3]); // 4th out
  }
  if (results.thirdPlace.advancingGroups.length > 0) {
    const advancing = new Set(results.thirdPlace.advancingGroups);
    for (const letter of GROUP_LETTERS) {
      if (advancing.has(letter)) continue;
      const order = results.groups[letter]?.order ?? [null, null, null, null];
      if (order[2]) alive.delete(order[2]); // 3rd in non-advancing group out
    }
  }

  // Knockout eliminations.
  const mapping = mapThirdPlaceAdvancers(results.thirdPlace.advancingGroups);
  for (const m of MATCHES) {
    const winner = results.knockout[m.id]?.winner;
    if (!winner) continue;
    const home = resolveSlot(m.home, results, mapping);
    const away = resolveSlot(m.away, results, mapping);
    if (home && home !== winner) alive.delete(home);
    if (away && away !== winner) alive.delete(away);
  }

  return alive;
}

// Maximum score this bracket can still attain — current locked-in score
// plus all remaining points that are still possible given the user's
// picks and the current results state. Decreases as the tournament
// progresses and locked-in points exceed what's still up for grabs.
//
// Rules for remaining points:
//   - Group placement: a position contributes 1 pt if results haven't
//     filled that slot yet AND the user has a pick for that slot.
//   - Best-3 advancers: contributes (up to 8) pts equal to the number
//     of groups the user picked, while advancingGroups in results is
//     still empty.
//   - Knockout match: contributes ROUND_POINTS[round] if results has no
//     winner yet AND the user's predicted winner is still alive in the
//     tournament.
export function maxAttainable(picks: BracketPicks, results: BracketPicks): number {
  const current = scoreBracket(picks, results).total;
  let remaining = 0;

  // Group placements — each unscored slot the user picked could earn the
  // exact-match max.
  for (const letter of GROUP_LETTERS) {
    const resultOrder = results.groups[letter]?.order ?? [null, null, null, null];
    const myOrder = picks.groups[letter]?.order ?? [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      if (resultOrder[i] === null && myOrder[i] !== null) {
        remaining += GROUP_POSITION_EXACT_POINTS;
      }
    }
  }

  // Best-3 advancers (only counts while results haven't been set).
  if (results.thirdPlace.advancingGroups.length === 0) {
    remaining += Math.min(8, picks.thirdPlace.advancingGroups.length) * THIRD_PLACE_GROUP_POINTS;
  }

  // Knockout matches.
  const alive = computeAliveTeams(results);
  for (const m of MATCHES) {
    if (results.knockout[m.id]?.winner) continue;
    const myPick = picks.knockout[m.id]?.winner;
    if (!myPick) continue;
    if (alive.has(myPick)) {
      remaining += ROUND_POINTS[m.round];
    }
  }

  return current + remaining;
}
