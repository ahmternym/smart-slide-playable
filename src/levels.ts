import type { Level } from './core';

/**
 * Two real levels from Smart Slide (chapter1.json "1-01" and chapter2.json "2-02").
 * Level 1 teaches the swipe in a single move; level 2 is the "aha" moment:
 * the red block can only reach its goal after blue has moved out of the way.
 */
export const LEVELS: Level[] = [
  {
    id: '1-01',
    size: 4,
    blocks: [{ id: 1, color: 'red', row: 3, col: 1 }],
    goals: [{ color: 'red', row: 0, col: 1 }],
    obstacles: [],
    moveLimit: 2
  },
  {
    id: '2-02',
    size: 5,
    blocks: [
      { id: 1, color: 'red', row: 1, col: 3 },
      { id: 2, color: 'blue', row: 1, col: 0 }
    ],
    goals: [
      { color: 'red', row: 4, col: 0 },
      { color: 'blue', row: 1, col: 1 }
    ],
    obstacles: [
      { row: 4, col: 1 },
      { row: 1, col: 2 }
    ],
    moveLimit: 6
  }
];
