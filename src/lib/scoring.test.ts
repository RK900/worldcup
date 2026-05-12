import { describe, expect, it } from 'vitest';
import { MATCHES, MATCHES_BY_ROUND } from '@/data/bracket';
import { GROUP_LETTERS, GROUPS } from '@/data/groups';
import { emptyResultsPicks } from '@/lib/resultsApi';
import { MAX_SCORE, ROUND_POINTS, maxAttainable, scoreBracket } from '@/lib/scoring';
import type { BracketPicks, GroupLetter, Round } from '@/lib/types';

function blankPicks(): BracketPicks {
  return emptyResultsPicks();
}

describe('scoreBracket', () => {
  it('returns 0 for empty picks vs empty results', () => {
    expect(scoreBracket(blankPicks(), blankPicks()).total).toBe(0);
  });

  it('awards 4 group points for a perfectly-predicted group', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.groups.A.order = ['MEX', 'RSA', 'KOR', 'CZE'];
    results.groups.A.order = ['MEX', 'RSA', 'KOR', 'CZE'];
    const score = scoreBracket(picks, results);
    expect(score.groupPoints).toBe(4);
    expect(score.total).toBe(4);
  });

  it('awards only matching positions when group order partially right', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.groups.A.order = ['MEX', 'KOR', 'RSA', 'CZE'];
    results.groups.A.order = ['MEX', 'RSA', 'KOR', 'CZE'];
    expect(scoreBracket(picks, results).groupPoints).toBe(2); // 1st + 4th
  });

  it('awards points for each correctly identified third-place advancer', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.thirdPlace.advancingGroups = ['A', 'B', 'C', 'D'];
    results.thirdPlace.advancingGroups = ['A', 'B', 'E', 'F'] as GroupLetter[];
    expect(scoreBracket(picks, results).thirdPlacePoints).toBe(2);
  });

  it('awards round-weighted points for correct knockout winners', () => {
    const picks = blankPicks();
    const results = blankPicks();
    // R32 (1pt): match 73
    picks.knockout[73] = { winner: 'MEX' };
    results.knockout[73] = { winner: 'MEX' };
    // Final (16pt): match 104
    picks.knockout[104] = { winner: 'BRA' };
    results.knockout[104] = { winner: 'BRA' };
    const score = scoreBracket(picks, results);
    expect(score.knockoutPointsByRound.R32).toBe(1);
    expect(score.knockoutPointsByRound.F).toBe(16);
    expect(score.knockoutTotal).toBe(17);
    expect(score.total).toBe(17);
  });

  it('gives 0 for a knockout pick when results have no winner yet', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.knockout[104] = { winner: 'BRA' };
    expect(scoreBracket(picks, results).knockoutTotal).toBe(0);
  });

  it('gives 0 for a wrong knockout pick', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.knockout[104] = { winner: 'BRA' };
    results.knockout[104] = { winner: 'ARG' };
    expect(scoreBracket(picks, results).knockoutTotal).toBe(0);
  });

  it('a perfect bracket scores MAX_SCORE', () => {
    const results = blankPicks();
    for (const g of GROUPS) {
      results.groups[g.letter].order = [g.teams[0], g.teams[1], g.teams[2], g.teams[3]];
    }
    results.thirdPlace.advancingGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const m of MATCHES) {
      results.knockout[m.id] = { winner: 'WINNER_' + m.id };
    }
    const score = scoreBracket(results, results);
    expect(score.total).toBe(MAX_SCORE);
  });

  it('MAX_SCORE matches manual calculation', () => {
    let expected = 0;
    for (const round of Object.keys(ROUND_POINTS) as Round[]) {
      expected += (MATCHES_BY_ROUND[round]?.length ?? 0) * ROUND_POINTS[round];
    }
    expected += GROUP_LETTERS.length * 4; // group points
    expected += 8; // third-place points
    expect(MAX_SCORE).toBe(expected);
  });
});

describe('maxAttainable', () => {
  function fullPicks(): BracketPicks {
    // A user who picked everything: every group filled, 8 best-3, every KO winner picked.
    const picks = emptyResultsPicks();
    for (const g of GROUPS) {
      picks.groups[g.letter].order = [g.teams[0], g.teams[1], g.teams[2], g.teams[3]];
    }
    picks.thirdPlace.advancingGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const m of MATCHES) {
      // Pick a team that's actually in the group (use 1st-place of home's group).
      picks.knockout[m.id] = { winner: 'MEX' }; // doesn't matter for max if alive
    }
    return picks;
  }

  it('returns MAX_SCORE when results are empty and picks are full', () => {
    expect(maxAttainable(fullPicks(), blankPicks())).toBe(MAX_SCORE);
  });

  it('returns the current score when everything is scored', () => {
    const picks = fullPicks();
    const results = blankPicks();
    // Lock in everything exactly as picked.
    for (const g of GROUPS) {
      results.groups[g.letter].order = [g.teams[0], g.teams[1], g.teams[2], g.teams[3]];
    }
    results.thirdPlace.advancingGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (const m of MATCHES) {
      results.knockout[m.id] = { winner: 'MEX' };
    }
    // Set all picks identical so current = MAX_SCORE and remaining = 0.
    expect(maxAttainable(picks, results)).toBe(scoreBracket(picks, results).total);
  });

  it('drops a Final pick from max once that team is eliminated', () => {
    const picks = blankPicks();
    const results = blankPicks();
    // I picked BRA to win the Final (16 pts on the table).
    picks.knockout[104] = { winner: 'BRA' };
    // But BRA loses in R32 — say match 76 (1C v 2F).
    // Make BRA the home (1C from group C).
    results.groups.C.order = ['BRA', 'MAR', 'HAI', 'SCO'];
    results.groups.F.order = ['NED', 'JPN', 'SWE', 'TUN'];
    results.knockout[76] = { winner: 'JPN' }; // BRA loses
    // Without BRA alive, my Final pick contributes 0 to remaining.
    expect(maxAttainable(picks, results)).toBe(scoreBracket(picks, results).total);
  });

  it('keeps a KO pick in max if their team is still alive', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.knockout[104] = { winner: 'BRA' }; // Final, 16 pts
    // No matches scored yet — BRA is alive trivially.
    expect(maxAttainable(picks, results)).toBe(16);
  });

  it('locks group points into current and removes them from remaining', () => {
    const picks = blankPicks();
    const results = blankPicks();
    picks.groups.A.order = ['MEX', 'RSA', 'KOR', 'CZE'];
    results.groups.A.order = ['MEX', 'RSA', 'KOR', 'CZE'];
    // Group A is fully scored → contributes 4 to current, 0 to remaining.
    expect(maxAttainable(picks, results)).toBe(4);
  });
});
