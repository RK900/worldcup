import { describe, expect, it } from 'vitest';
import { mapThirdPlaceAdvancers } from './thirdPlaceMap';
import { BEST3_SLOT_MATCH_IDS, MATCHES_BY_ID } from '@/data/bracket';
import type { GroupLetter } from './types';

const ALL_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  function rec(start: number) {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      pick.push(arr[i]);
      rec(i + 1);
      pick.pop();
    }
  }
  rec(0);
  return out;
}

describe('mapThirdPlaceAdvancers', () => {
  it('returns 8 null slots when no groups picked', () => {
    const r = mapThirdPlaceAdvancers([]);
    expect(r.slots).toHaveLength(8);
    r.slots.forEach((s, i) => {
      expect(s.matchId).toBe(BEST3_SLOT_MATCH_IDS[i]);
      expect(s.group).toBeNull();
    });
    expect(r.unmatched).toEqual([]);
  });

  it('finds a perfect matching for every C(12,8) = 495 combination', () => {
    const allCombinations = combinations(ALL_GROUPS, 8);
    expect(allCombinations).toHaveLength(495);

    const failures: GroupLetter[][] = [];
    for (const combo of allCombinations) {
      const r = mapThirdPlaceAdvancers(combo);
      const filled = r.slots.filter((s) => s.group !== null).length;
      if (filled !== 8 || r.unmatched.length !== 0) {
        failures.push(combo);
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Failed to find perfect matching for ${failures.length} combinations. Examples: ${JSON.stringify(failures.slice(0, 3))}`,
      );
    }
  });

  it('uses FIFA Annex C assignments (every slot respects eligibleGroups for all 495 combos)', () => {
    const allCombinations = combinations(ALL_GROUPS, 8);
    for (const combo of allCombinations) {
      const r = mapThirdPlaceAdvancers(combo);
      r.slots.forEach((slot) => {
        const m = MATCHES_BY_ID[slot.matchId];
        if (m.away.kind === 'best3' && slot.group) {
          if (!m.away.eligibleGroups.includes(slot.group)) {
            throw new Error(
              `Combo ${combo.join('')}: slot ${slot.matchId} assigned group ${slot.group}, ` +
                `which is not in eligibleGroups [${m.away.eligibleGroups.join(',')}]`,
            );
          }
        }
      });
    }
  });

  it('respects eligibility constraints for any 8 groups', () => {
    const r = mapThirdPlaceAdvancers(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    r.slots.forEach((slot) => {
      if (!slot.group) return;
      const m = MATCHES_BY_ID[slot.matchId];
      expect(m.away.kind).toBe('best3');
      if (m.away.kind === 'best3') {
        expect(m.away.eligibleGroups).toContain(slot.group);
      }
    });
  });

  it('partial pick (4 groups): no group placed twice, all placed groups are eligible', () => {
    const input: GroupLetter[] = ['A', 'B', 'C', 'D'];
    const r = mapThirdPlaceAdvancers(input);
    const filled = r.slots.filter((s) => s.group !== null);
    expect(filled.length).toBeLessThanOrEqual(input.length);
    expect(filled.length + r.unmatched.length).toBe(input.length);

    const used = new Set(filled.map((s) => s.group));
    expect(used.size).toBe(filled.length);

    filled.forEach((slot) => {
      const m = MATCHES_BY_ID[slot.matchId];
      if (m.away.kind === 'best3') {
        expect(m.away.eligibleGroups).toContain(slot.group);
      }
    });
  });

  it('is deterministic regardless of input order', () => {
    const input: GroupLetter[] = ['B', 'D', 'F', 'H', 'J', 'L', 'A', 'C'];
    const r1 = mapThirdPlaceAdvancers(input);
    const r2 = mapThirdPlaceAdvancers([...input].reverse());
    const r3 = mapThirdPlaceAdvancers([...input].sort());
    expect(r1.slots).toEqual(r2.slots);
    expect(r1.slots).toEqual(r3.slots);
  });

  it('deduplicates duplicate group entries', () => {
    const r = mapThirdPlaceAdvancers(['A', 'A', 'B', 'B', 'C', 'D', 'E', 'F']);
    const filled = r.slots.filter((s) => s.group !== null);
    const used = new Set(filled.map((s) => s.group));
    expect(used.size).toBe(filled.length);
  });
});
