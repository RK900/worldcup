import { describe, expect, it } from 'vitest';
import { applyCascade } from './cascade';
import { GROUPS } from '@/data/groups';
import type {
  BracketPicks,
  GroupLetter,
  GroupOrder,
  GroupPick,
  TeamCode,
} from './types';

function makeInitialPicks(): BracketPicks {
  const groups = {} as Record<GroupLetter, GroupPick>;
  for (const g of GROUPS) {
    groups[g.letter] = {
      order: [...g.teams] as GroupOrder,
      committed: false,
    };
  }
  return {
    groups,
    thirdPlace: { advancingGroups: [] },
    knockout: {},
    finalizedAt: null,
  };
}

function commitGroup(picks: BracketPicks, g: GroupLetter, order?: TeamCode[]): void {
  picks.groups[g].committed = true;
  if (order) {
    picks.groups[g].order = [...order, null, null, null, null].slice(0, 4) as GroupOrder;
  }
}

describe('applyCascade', () => {
  it('is idempotent', () => {
    const p1 = makeInitialPicks();
    const p2 = applyCascade(p1);
    const p3 = applyCascade(p2);
    expect(p2).toEqual(p3);
  });

  it('clears a winner that no longer matches home or away', () => {
    const picks = makeInitialPicks();
    commitGroup(picks, 'A');
    commitGroup(picks, 'B');
    // M73: 2A vs 2B → home=RSA (default 2nd of A), away=BIH (default 2nd of B).
    picks.knockout[73] = { winner: 'BIH' };

    // Reorder Group B so BIH moves to 1st (no longer 2nd).
    picks.groups.B.order = ['BIH', 'CAN', 'QAT', 'SUI'];

    const next = applyCascade(picks);
    // M73 home=RSA (unchanged), away=CAN (new 2B). Winner BIH matches neither → cleared.
    expect(next.knockout[73]?.winner).toBeNull();
  });

  it('preserves a winner that still matches', () => {
    const picks = makeInitialPicks();
    commitGroup(picks, 'A');
    commitGroup(picks, 'B');
    picks.knockout[73] = { winner: 'RSA' };

    const next = applyCascade(picks);
    expect(next.knockout[73]?.winner).toBe('RSA');
  });

  it('cascades downstream when an upstream slot becomes null', () => {
    const picks = makeInitialPicks();
    commitGroup(picks, 'A');
    commitGroup(picks, 'B');
    commitGroup(picks, 'C');
    commitGroup(picks, 'F');

    // M73: 2A v 2B → RSA wins
    picks.knockout[73] = { winner: 'RSA' };
    // M75: 1F v 2C → NED wins
    picks.knockout[75] = { winner: 'NED' };
    // M90: W73 v W75 → RSA v NED. User picks NED.
    picks.knockout[90] = { winner: 'NED' };

    let p = applyCascade(picks);
    expect(p.knockout[73]?.winner).toBe('RSA');
    expect(p.knockout[90]?.winner).toBe('NED');

    // Uncommit Group A. M73's home (2A) becomes null.
    p.groups.A.committed = false;
    p = applyCascade(p);

    // M73: home=null, away=BIH. RSA ≠ null, RSA ≠ BIH → cleared.
    expect(p.knockout[73]?.winner).toBeNull();
    // M90: home=null (W73 cleared), away=NED (W75=NED). NED matches away → kept.
    expect(p.knockout[90]?.winner).toBe('NED');
  });

  it('clears finalizedAt when picks are not complete', () => {
    const picks = makeInitialPicks();
    picks.finalizedAt = Date.now();
    const next = applyCascade(picks);
    expect(next.finalizedAt).toBeNull();
  });

  it('does not touch finalizedAt when it was already null', () => {
    const picks = makeInitialPicks();
    expect(picks.finalizedAt).toBeNull();
    const next = applyCascade(picks);
    expect(next.finalizedAt).toBeNull();
  });

  it('clears downstream chain when winner is no longer eligible', () => {
    const picks = makeInitialPicks();
    commitGroup(picks, 'A');
    commitGroup(picks, 'B');
    commitGroup(picks, 'C');
    commitGroup(picks, 'F');

    // Set up a chain: RSA wins M73, then RSA wins M90, then RSA wins M97.
    picks.knockout[73] = { winner: 'RSA' };
    picks.knockout[75] = { winner: 'NED' };
    picks.knockout[90] = { winner: 'RSA' };
    // M97 = W89/W90. We don't have W89, so M97's home is unresolved. Skip the M97 chain.

    let p = applyCascade(picks);
    expect(p.knockout[90]?.winner).toBe('RSA');

    // Reorder Group A so RSA is no longer 2A.
    p.groups.A.order = ['RSA', 'MEX', 'KOR', 'CZE'];
    p = applyCascade(p);

    // M73: home=MEX (new 2A), away=BIH. RSA matches neither → cleared.
    expect(p.knockout[73]?.winner).toBeNull();
    // M90: home=null (W73 cleared), away=NED. RSA matches neither → cleared.
    expect(p.knockout[90]?.winner).toBeNull();
  });
});
