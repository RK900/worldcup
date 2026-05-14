import { BEST3_SLOT_MATCH_IDS, MATCHES_BY_ID } from '@/data/bracket';
import { THIRD_PLACE_TABLE } from '@/data/thirdPlaceTable';
import type { ThirdPlaceMapping } from '@/lib/resolveBracket';
import type { GroupLetter } from '@/lib/types';

// Map the user's chosen advancing third-place groups (up to 8) to the 8 Best3 slots
// in the R32 bracket.
//
// For full 8-group selections we use FIFA's official Annex C lookup table
// (mirrored at src/data/thirdPlaceTable.ts from the Wikipedia template).
// For partial selections (< 8 groups, while the user is still filling in)
// we fall back to deterministic backtracking matching so the UI shows
// reasonable preview slots as the user picks.

interface SlotInfo {
  slotIndex: number;
  matchId: number;
  eligibleGroups: GroupLetter[];
}

const SLOT_INFOS: SlotInfo[] = BEST3_SLOT_MATCH_IDS.map((matchId, idx) => {
  const m = MATCHES_BY_ID[matchId];
  if (!m || m.away.kind !== 'best3') {
    throw new Error(`Best3 match ${matchId} mis-specified`);
  }
  return { slotIndex: idx, matchId, eligibleGroups: m.away.eligibleGroups };
});

function tableKey(groups: GroupLetter[]): string {
  return [...new Set(groups)].sort().join('');
}

export function mapThirdPlaceAdvancers(advancingGroups: GroupLetter[]): ThirdPlaceMapping {
  const groups = [...new Set(advancingGroups)].sort();

  if (groups.length === 0) {
    return {
      slots: SLOT_INFOS.map((s) => ({ matchId: s.matchId, group: null })),
      unmatched: [],
    };
  }

  // Exactly 8 → official FIFA Annex C table.
  if (groups.length === 8) {
    const assignment = THIRD_PLACE_TABLE[tableKey(groups)];
    if (assignment) {
      return {
        slots: SLOT_INFOS.map((s, i) => ({
          matchId: s.matchId,
          group: assignment[i] ?? null,
        })),
        unmatched: [],
      };
    }
    // Fall through to matching if the lookup somehow misses (shouldn't
    // happen for valid 8-of-12 selections, but defensive).
  }

  // Partial selection (or unexpected miss): deterministic best-effort
  // matching so the UI can preview slots while the user is picking.
  return matchByBacktracking(groups as GroupLetter[]);
}

function matchByBacktracking(groups: GroupLetter[]): ThirdPlaceMapping {
  const N = SLOT_INFOS.length;
  const M = groups.length;
  const work: (GroupLetter | null)[] = new Array(N).fill(null);
  const used: boolean[] = new Array(M).fill(false);
  let best: (GroupLetter | null)[] = [...work];
  let bestFilled = 0;
  const target = Math.min(N, M);

  const recur = (slotIdx: number, filled: number): boolean => {
    if (filled > bestFilled) {
      bestFilled = filled;
      best = [...work];
      if (bestFilled === target) return true;
    }
    if (slotIdx === N) return false;

    const slot = SLOT_INFOS[slotIdx];
    for (let gi = 0; gi < M; gi++) {
      if (used[gi]) continue;
      const g = groups[gi];
      if (!slot.eligibleGroups.includes(g)) continue;
      work[slotIdx] = g;
      used[gi] = true;
      if (recur(slotIdx + 1, filled + 1)) return true;
      work[slotIdx] = null;
      used[gi] = false;
    }
    return recur(slotIdx + 1, filled);
  };

  recur(0, 0);

  const slots = SLOT_INFOS.map((s, i) => ({ matchId: s.matchId, group: best[i] }));
  const usedGroups = new Set(best.filter((g): g is GroupLetter => g !== null));
  const unmatched = groups.filter((g) => !usedGroups.has(g));
  return { slots, unmatched };
}
