/**
 * Pure puzzle engine for the playable — no Phaser imports, so it is unit-tested.
 *
 * Rules mirror Smart Slide's core mechanic:
 * - A block slides in one direction until it hits a wall, an obstacle or another block.
 * - A block that rests on a goal of its own color is LOCKED: it can no longer move,
 *   but it still blocks other blocks.
 * - The level is won when every block is locked.
 */

export type Color = 'red' | 'blue' | 'green' | 'yellow';
export type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Cell { row: number; col: number }
export interface Block extends Cell { id: number; color: Color }
export interface Goal extends Cell { color: Color }

export interface Level {
  id: string;
  size: number;
  blocks: Block[];
  goals: Goal[];
  obstacles: Cell[];
  moveLimit: number;
}

export interface Move { blockId: number; dir: Dir }

export const DIRS: Record<Dir, { dr: number; dc: number }> = {
  UP: { dr: -1, dc: 0 },
  DOWN: { dr: 1, dc: 0 },
  LEFT: { dr: 0, dc: -1 },
  RIGHT: { dr: 0, dc: 1 }
};

const ALL_DIRS: Dir[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export function cloneBlocks(blocks: Block[]): Block[] {
  return blocks.map(b => ({ ...b }));
}

export function isLocked(level: Level, b: Block): boolean {
  return level.goals.some(g => g.color === b.color && g.row === b.row && g.col === b.col);
}

export function isWin(level: Level, blocks: Block[]): boolean {
  return blocks.every(b => isLocked(level, b));
}

function occupied(level: Level, blocks: Block[], row: number, col: number, selfId: number): boolean {
  if (row < 0 || col < 0 || row >= level.size || col >= level.size) return true;
  if (level.obstacles.some(o => o.row === row && o.col === col)) return true;
  return blocks.some(b => b.id !== selfId && b.row === row && b.col === col);
}

/** Where the block would stop. Returns null when it cannot move (locked or blocked). */
export function slideTarget(level: Level, blocks: Block[], blockId: number, dir: Dir): Cell | null {
  const b = blocks.find(x => x.id === blockId);
  if (!b || isLocked(level, b)) return null;
  const { dr, dc } = DIRS[dir];
  let row = b.row;
  let col = b.col;
  while (!occupied(level, blocks, row + dr, col + dc, b.id)) {
    row += dr;
    col += dc;
  }
  if (row === b.row && col === b.col) return null;
  return { row, col };
}

/** Applies a move and returns the new block list (or null if the move is not possible). */
export function applyMove(level: Level, blocks: Block[], move: Move): Block[] | null {
  const to = slideTarget(level, blocks, move.blockId, move.dir);
  if (!to) return null;
  return blocks.map(b => (b.id === move.blockId ? { ...b, row: to.row, col: to.col } : { ...b }));
}

function key(blocks: Block[]): string {
  return blocks
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(b => `${b.row},${b.col}`)
    .join('|');
}

/**
 * Breadth-first search for the shortest solution from the current state.
 * Used for the tutorial hand (always points at the next optimal move) and
 * to verify both levels are solvable within their move limit.
 */
export function solve(level: Level, start: Block[], maxDepth = 20): Move[] | null {
  if (isWin(level, start)) return [];
  const seen = new Set<string>([key(start)]);
  let frontier: { blocks: Block[]; path: Move[] }[] = [{ blocks: start, path: [] }];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const b of node.blocks) {
        for (const dir of ALL_DIRS) {
          const moved = applyMove(level, node.blocks, { blockId: b.id, dir });
          if (!moved) continue;
          const k = key(moved);
          if (seen.has(k)) continue;
          seen.add(k);
          const path = [...node.path, { blockId: b.id, dir }];
          if (isWin(level, moved)) return path;
          next.push({ blocks: moved, path });
        }
      }
    }
    frontier = next;
  }
  return null;
}

/** Turns a swipe vector into a direction (null when the swipe is too short). */
export function swipeDir(dx: number, dy: number, minDist: number): Dir | null {
  if (Math.hypot(dx, dy) < minDist) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
  return dy > 0 ? 'DOWN' : 'UP';
}
