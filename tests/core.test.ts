import { describe, expect, it } from 'vitest';
import { applyMove, cloneBlocks, isWin, slideTarget, solve, swipeDir } from '../src/core';
import { LEVELS } from '../src/levels';

describe('slide engine', () => {
  const lvl = LEVELS[1];

  it('slides until it hits an obstacle', () => {
    // red at (1,3) moving left is stopped immediately by the obstacle at (1,2)
    expect(slideTarget(lvl, lvl.blocks, 1, 'LEFT')).toBeNull();
    expect(slideTarget(lvl, lvl.blocks, 1, 'DOWN')).toEqual({ row: 4, col: 3 });
  });

  it('a locked block cannot move', () => {
    const b = applyMove(lvl, cloneBlocks(lvl.blocks), { blockId: 2, dir: 'RIGHT' })!;
    expect(b.find(x => x.id === 2)).toMatchObject({ row: 1, col: 1 });
    expect(slideTarget(lvl, b, 2, 'DOWN')).toBeNull();
  });

  it('maps swipes to directions', () => {
    expect(swipeDir(40, 5, 10)).toBe('RIGHT');
    expect(swipeDir(-3, -50, 10)).toBe('UP');
    expect(swipeDir(2, 2, 10)).toBeNull();
  });
});

describe('levels', () => {
  for (const lvl of LEVELS) {
    it(`level ${lvl.id} is solvable within its move limit`, () => {
      const plan = solve(lvl, cloneBlocks(lvl.blocks));
      expect(plan).not.toBeNull();
      expect(plan!.length).toBeLessThanOrEqual(lvl.moveLimit);
      let blocks = cloneBlocks(lvl.blocks);
      for (const m of plan!) blocks = applyMove(lvl, blocks, m)!;
      expect(isWin(lvl, blocks)).toBe(true);
    });
  }

  it('level 2-02 needs 4 moves and red is stuck until blue moves', () => {
    const lvl = LEVELS[1];
    const plan = solve(lvl, cloneBlocks(lvl.blocks))!;
    expect(plan.length).toBe(4);
    let b = applyMove(lvl, cloneBlocks(lvl.blocks), { blockId: 1, dir: 'UP' })!;
    b = applyMove(lvl, b, { blockId: 1, dir: 'LEFT' })!;
    // blue still sits at (1,0), so red cannot come down to its goal at (4,0)
    expect(slideTarget(lvl, b, 1, 'DOWN')).toBeNull();
  });
});
