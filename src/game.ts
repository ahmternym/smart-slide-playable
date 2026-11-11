import Phaser from 'phaser';
import { applyMove, isLocked, isWin, slideTarget, solve, swipeDir, cloneBlocks } from './core';
import type { Block, Color, Dir, Level } from './core';
import { LEVELS } from './levels';
import { APP_NAME, T } from './i18n';
import { openStore, track } from './cta';

// Smart Slide light palette (src/ui/theme.ts in the game)
const BG = 0xf2f4f8;
const BOARD_BG = 0xe3e7f0;
const CELL_BG = 0xffffff;
const OBSTACLE = 0x39404f;
const TEXT = '#242b3e';
const TEXT_SOFT = '#5c6579';
const SUCCESS = 0x2a9d8f;
const ACCENT = 0xf4a261;
const SELECTION = 0x22293d;
const COLOR_HEX: Record<Color, number> = {
  red: 0xe63946,
  blue: 0x457b9d,
  green: 0x2a9d8f,
  yellow: 0xf4a261
};
const FONT = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';

/** After this many ms the end card is shown even if the player is still playing. */
const AUTO_END_MS = 40000;
/** Idle time before the tutorial hand reappears. */
const HINT_IDLE_MS = 3500;

type Phase = 'play' | 'busy' | 'end';

interface Metrics {
  w: number;
  h: number;
  cell: number;
  gap: number;
  boardX: number;
  boardY: number;
  boardSize: number;
  unit: number;
}

export class PlayScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: Level;
  private blocks: Block[] = [];
  private moves = 0;
  private selectedId: number | null = null;
  private phase: Phase = 'play';
  private m!: Metrics;

  private root!: Phaser.GameObjects.Container;
  private blockViews = new Map<number, Phaser.GameObjects.Container>();
  private movesText!: Phaser.GameObjects.Text;
  private hand: Phaser.GameObjects.Container | null = null;
  private hintTimer: Phaser.Time.TimerEvent | null = null;
  private downAt: { x: number; y: number; blockId: number | null } | null = null;

  constructor() {
    super('play');
  }

  create(): void {
    (window as unknown as { __playable?: PlayScene }).__playable = this; // QA hook for automated tests
    this.cameras.main.setBackgroundColor(BG);
    this.scale.on('resize', () => this.layout());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.time.addEvent({
      delay: AUTO_END_MS,
      callback: () => { if (this.phase !== 'end') this.showEndCard('timeout'); }
    });
    track('start');
    this.loadLevel(0);
  }

  // ---------- level flow ----------

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.blocks = cloneBlocks(this.level.blocks);
    this.moves = 0;
    this.selectedId = null;
    this.phase = 'play';
    track('level_start', { level: this.level.id });
    this.layout();
    this.scheduleHint(700);
  }

  private computeMetrics(): Metrics {
    const w = this.scale.width;
    const h = this.scale.height;
    const unit = Math.min(w, h) / 100;
    const landscape = w > h * 1.1;
    const maxBoard = landscape ? h * 0.66 : Math.min(w * 0.86, h * 0.52);
    const size = this.level.size;
    const gap = Math.max(4, Math.round(maxBoard * 0.018));
    const cell = Math.floor((maxBoard - gap * (size + 1)) / size);
    const boardSize = cell * size + gap * (size + 1);
    const boardX = Math.round((w - boardSize) / 2);
    const boardY = Math.round(landscape ? (h - boardSize) / 2 + h * 0.04 : h * 0.5 - boardSize / 2 + h * 0.03);
    return { w, h, cell, gap, boardX, boardY, boardSize, unit };
  }

  private cellCenter(row: number, col: number): { x: number; y: number } {
    const { boardX, boardY, cell, gap } = this.m;
    return {
      x: boardX + gap + col * (cell + gap) + cell / 2,
      y: boardY + gap + row * (cell + gap) + cell / 2
    };
  }

  private cellAt(x: number, y: number): { row: number; col: number } | null {
    const { boardX, boardY, cell, gap, boardSize } = this.m;
    if (x < boardX || y < boardY || x > boardX + boardSize || y > boardY + boardSize) return null;
    const col = Math.floor((x - boardX - gap / 2) / (cell + gap));
    const row = Math.floor((y - boardY - gap / 2) / (cell + gap));
    if (row < 0 || col < 0 || row >= this.level.size || col >= this.level.size) return null;
    return { row, col };
  }

  // ---------- drawing ----------

  /** Rebuilds the whole frame from state — called on level start and on every resize. */
  private layout(): void {
    this.root?.destroy(true);
    this.hideHand();
    this.blockViews.clear();
    this.m = this.computeMetrics();
    const { w, h, unit, boardX, boardY, boardSize, cell, gap } = this.m;
    this.root = this.add.container(0, 0);

    // Header: logo dots + app name, level hint, move counter
    const headerY = Math.max(boardY - unit * 22, unit * 8);
    const dots = this.add.graphics();
    const dotR = unit * 1.1;
    const brandText = this.add.text(0, 0, APP_NAME, { fontFamily: FONT, fontSize: `${Math.round(unit * 4.2)}px`, fontStyle: 'bold', color: TEXT }).setOrigin(0, 0.5);
    const brandW = dotR * 6 + unit * 1.5 + brandText.width;
    const bx = (w - brandW) / 2;
    ['red', 'blue', 'green'].forEach((c, i) => dots.fillStyle(COLOR_HEX[c as Color]).fillCircle(bx + dotR + i * dotR * 2.2, headerY, dotR));
    brandText.setPosition(bx + dotR * 6.6 + unit * 1.2, headerY);

    const hint = this.add.text(w / 2, headerY + unit * 8, this.levelIndex === 0 ? T.swipe : T.order, {
      fontFamily: FONT, fontSize: `${Math.round(unit * 5)}px`, fontStyle: 'bold', color: TEXT, align: 'center',
      wordWrap: { width: w * 0.9 }
    }).setOrigin(0.5, 0.5);

    this.movesText = this.add.text(w / 2, boardY + boardSize + unit * 6, '', {
      fontFamily: FONT, fontSize: `${Math.round(unit * 4)}px`, color: TEXT_SOFT
    }).setOrigin(0.5, 0.5);
    this.updateMoves();

    // Board, cells, obstacles, goals
    const g = this.add.graphics();
    g.fillStyle(BOARD_BG).fillRoundedRect(boardX, boardY, boardSize, boardSize, gap * 2);
    for (let r = 0; r < this.level.size; r++) {
      for (let c = 0; c < this.level.size; c++) {
        const x = boardX + gap + c * (cell + gap);
        const y = boardY + gap + r * (cell + gap);
        const isObstacle = this.level.obstacles.some(o => o.row === r && o.col === c);
        g.fillStyle(isObstacle ? OBSTACLE : CELL_BG).fillRoundedRect(x, y, cell, cell, cell * 0.12);
      }
    }
    for (const goal of this.level.goals) {
      const { x, y } = this.cellCenter(goal.row, goal.col);
      g.fillStyle(COLOR_HEX[goal.color], 0.28).fillCircle(x, y, cell * 0.36);
      g.lineStyle(Math.max(2, cell * 0.05), COLOR_HEX[goal.color], 1).strokeCircle(x, y, cell * 0.36);
    }

    // Small persistent CTA (top-right)
    const cta = this.makeButton(w - unit * 3, unit * 3, T.install, unit * 3.2, 0.95);
    cta.setPosition(w - unit * 3 - cta.getData('w') / 2, unit * 3 + cta.getData('h') / 2);

    this.root.add([dots, brandText, hint, this.movesText, g, cta]);

    for (const b of this.blocks) this.root.add(this.makeBlock(b));

    if (this.phase === 'end') this.drawEndCard();
  }

  private makeBlock(b: Block): Phaser.GameObjects.Container {
    const { cell } = this.m;
    const { x, y } = this.cellCenter(b.row, b.col);
    const s = cell * 0.84;
    const c = this.add.container(x, y);
    const body = this.add.graphics();
    body.fillStyle(0x000000, 0.12).fillRoundedRect(-s / 2, -s / 2 + cell * 0.04, s, s, s * 0.16);
    body.fillStyle(COLOR_HEX[b.color]).fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.16);
    body.fillStyle(0xffffff, 0.16).fillRoundedRect(-s / 2 + s * 0.08, -s / 2 + s * 0.08, s * 0.84, s * 0.22, s * 0.1);
    c.add(body);
    const ring = this.add.graphics();
    ring.lineStyle(Math.max(3, cell * 0.06), SELECTION, 1).strokeRoundedRect(-s * 0.54, -s * 0.54, s * 1.08, s * 1.08, s * 0.18);
    ring.setVisible(this.selectedId === b.id).setName('ring');
    c.add(ring);
    if (isLocked(this.level, b)) c.add(this.makeCheck(s));
    this.blockViews.set(b.id, c);
    return c;
  }

  private makeCheck(s: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    g.lineStyle(Math.max(3, s * 0.1), 0xffffff, 1);
    g.beginPath();
    g.moveTo(-s * 0.22, 0);
    g.lineTo(-s * 0.05, s * 0.17);
    g.lineTo(s * 0.25, -s * 0.18);
    g.strokePath();
    return g;
  }

  private makeButton(x: number, y: number, label: string, fontPx: number, scale = 1): Phaser.GameObjects.Container {
    const t = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: `${Math.round(fontPx)}px`, fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
    const bw = t.width + fontPx * 2.2;
    const bh = t.height + fontPx * 1.1;
    const bg = this.add.graphics();
    bg.fillStyle(0x1d7d70, 1).fillRoundedRect(-bw / 2, -bh / 2 + fontPx * 0.18, bw, bh, bh / 2);
    bg.fillStyle(SUCCESS, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    const c = this.add.container(x, y, [bg, t]).setScale(scale);
    c.setData('w', bw * scale).setData('h', bh * scale);
    c.setSize(bw, bh).setInteractive({ useHandCursor: true });
    c.on('pointerup', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      openStore(this.phase === 'end' ? 'endcard' : 'button');
    });
    return c;
  }

  private updateMoves(): void {
    this.movesText?.setText(`${T.moves}: ${this.moves} / ${this.level.moveLimit}`);
  }

  // ---------- input ----------

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.phase === 'end') return;
    this.hideHand();
    const cell = this.cellAt(p.x, p.y);
    const hit = cell ? this.blocks.find(b => b.row === cell.row && b.col === cell.col) : undefined;
    this.downAt = { x: p.x, y: p.y, blockId: hit ? hit.id : null };
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      track('first_interaction');
    }
  }

  private hasInteracted = false;

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.phase === 'end') {
      openStore('endcard');
      return;
    }
    const down = this.downAt;
    this.downAt = null;
    if (!down || this.phase !== 'play') return;
    const dir = swipeDir(p.x - down.x, p.y - down.y, this.m.cell * 0.3);
    if (dir) {
      const id = down.blockId ?? this.selectedId;
      if (id !== null) this.tryMove(id, dir);
      else this.scheduleHint(HINT_IDLE_MS);
      return;
    }
    // Tap: select / deselect a block
    if (down.blockId !== null) this.select(down.blockId === this.selectedId ? null : down.blockId);
    this.scheduleHint(HINT_IDLE_MS);
  }

  private select(id: number | null): void {
    this.selectedId = id;
    for (const [bid, view] of this.blockViews) {
      (view.getByName('ring') as Phaser.GameObjects.Graphics)?.setVisible(bid === id);
    }
  }

  private tryMove(blockId: number, dir: Dir): void {
    const to = slideTarget(this.level, this.blocks, blockId, dir);
    const view = this.blockViews.get(blockId);
    if (!to || !view) {
      // Blocked: small shake so the swipe still gives feedback
      if (view) this.tweens.add({ targets: view, x: view.x + (dir === 'LEFT' ? -1 : dir === 'RIGHT' ? 1 : 0) * this.m.cell * 0.07, y: view.y + (dir === 'UP' ? -1 : dir === 'DOWN' ? 1 : 0) * this.m.cell * 0.07, duration: 60, yoyo: true });
      this.scheduleHint(HINT_IDLE_MS);
      return;
    }
    const from = this.blocks.find(b => b.id === blockId)!;
    const dist = Math.abs(to.row - from.row) + Math.abs(to.col - from.col);
    this.blocks = applyMove(this.level, this.blocks, { blockId, dir })!;
    this.moves++;
    this.updateMoves();
    this.select(null);
    this.phase = 'busy';
    track('move', { level: this.level.id, blockId, dir, moves: this.moves });
    const target = this.cellCenter(to.row, to.col);
    this.tweens.add({
      targets: view,
      x: target.x,
      y: target.y,
      duration: Math.max(140, dist * 75),
      ease: 'Cubic.easeOut',
      onComplete: () => this.afterMove(blockId)
    });
  }

  private afterMove(blockId: number): void {
    const b = this.blocks.find(x => x.id === blockId)!;
    const view = this.blockViews.get(blockId)!;
    this.tweens.add({ targets: view, scale: 1.08, duration: 80, yoyo: true });
    if (isLocked(this.level, b)) {
      view.add(this.makeCheck(this.m.cell * 0.84));
      this.burst(view.x, view.y, COLOR_HEX[b.color]);
    }
    if (isWin(this.level, this.blocks)) return this.onWin();
    if (this.moves >= this.level.moveLimit) return this.onFail();
    this.phase = 'play';
    this.scheduleHint(HINT_IDLE_MS);
  }

  private onWin(): void {
    track('level_complete', { level: this.level.id, moves: this.moves });
    const optimal = solve(this.level, cloneBlocks(this.level.blocks))?.length ?? this.moves;
    const label = this.moves <= optimal ? T.perfect : T.great;
    this.banner(label, '#c97e2d');
    this.time.delayedCall(1100, () => {
      if (this.phase === 'end') return;
      if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
      else this.showEndCard('complete');
    });
  }

  private onFail(): void {
    track('level_fail', { level: this.level.id });
    this.banner(T.outOfMoves, '#c62836');
    this.time.delayedCall(900, () => this.showEndCard('fail'));
  }

  /** Result message on a card centred over the board, so it never collides with the header texts. */
  private banner(label: string, color: string): void {
    const { boardX, boardY, boardSize, unit } = this.m;
    const t = this.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: `${Math.round(unit * 8)}px`, fontStyle: 'bold', color
    }).setOrigin(0.5);
    const bw = Math.min(boardSize * 0.9, t.width + unit * 12);
    const bh = t.height + unit * 6;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.12).fillRoundedRect(-bw / 2, -bh / 2 + unit, bw, bh, bh * 0.3);
    bg.fillStyle(0xffffff, 0.97).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, bh * 0.3);
    const c = this.add.container(boardX + boardSize / 2, boardY + boardSize / 2, [bg, t]).setScale(0.3).setAlpha(0);
    this.root.add(c);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  private burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI * 2 * i) / 10;
      const dot = this.add.circle(x, y, this.m.cell * 0.06, i % 2 ? color : ACCENT);
      this.root.add(dot);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * this.m.cell * 0.9,
        y: y + Math.sin(a) * this.m.cell * 0.9,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy()
      });
    }
  }

  // ---------- tutorial hand ----------

  private scheduleHint(delay: number): void {
    this.hintTimer?.remove(false);
    this.hintTimer = this.time.delayedCall(delay, () => this.showHand());
  }

  private showHand(): void {
    if (this.phase !== 'play') return;
    const plan = solve(this.level, this.blocks);
    if (!plan || !plan.length) return;
    const next = plan[0];
    const b = this.blocks.find(x => x.id === next.blockId)!;
    const from = this.cellCenter(b.row, b.col);
    const { cell } = this.m;
    const step = cell * 1.1;
    const dx = next.dir === 'LEFT' ? -step : next.dir === 'RIGHT' ? step : 0;
    const dy = next.dir === 'UP' ? -step : next.dir === 'DOWN' ? step : 0;

    this.hideHand();
    const group = this.add.container(0, 0);

    // Direction trail: a soft arrow from the block towards where it will slide
    const to = slideTarget(this.level, this.blocks, next.blockId, next.dir)!;
    const end = this.cellCenter(to.row, to.col);
    const trail = this.add.graphics();
    const ux = Math.sign(end.x - from.x);
    const uy = Math.sign(end.y - from.y);
    const tipX = end.x - ux * cell * 0.25;
    const tipY = end.y - uy * cell * 0.25;
    trail.lineStyle(Math.max(4, cell * 0.09), 0x242b3e, 0.22);
    trail.lineBetween(from.x + ux * cell * 0.5, from.y + uy * cell * 0.5, tipX, tipY);
    const ah = cell * 0.2;
    trail.fillStyle(0x242b3e, 0.22).fillTriangle(
      tipX + ux * ah, tipY + uy * ah,
      tipX - uy * ah - ux * ah * 0.2, tipY + ux * ah - uy * ah * 0.2,
      tipX + uy * ah - ux * ah * 0.2, tipY - ux * ah - uy * ah * 0.2
    );
    group.add(trail);

    // Pointing hand drawn with vector shapes (no image asset). Fingertip is at (0, 0).
    const r = cell * 0.17;
    const line = Math.max(2, r * 0.18);
    const g = this.add.graphics();
    const shapes: [number, number, number, number, number][] = [
      [-r * 0.45, -r * 0.1, r * 0.9, r * 3.0, r * 0.45], // index finger
      [r * 0.42, r * 1.55, r * 0.8, r * 1.9, r * 0.4], // middle
      [r * 1.15, r * 1.85, r * 0.75, r * 1.7, r * 0.38], // ring
      [-r * 0.9, r * 2.3, r * 2.9, r * 2.3, r * 0.8] // palm
    ];
    g.fillStyle(0x000000, 0.15);
    for (const [x, y, w, h, rad] of shapes) g.fillRoundedRect(x + r * 0.25, y + r * 0.35, w, h, rad);
    for (const [x, y, w, h, rad] of shapes) {
      g.fillStyle(0xffffff, 1).fillRoundedRect(x, y, w, h, rad);
      g.lineStyle(line, 0x242b3e, 1).strokeRoundedRect(x, y, w, h, rad);
    }
    g.fillStyle(0xffffff, 1).fillRoundedRect(-r * 0.75, r * 2.45, r * 2.55, r * 1.95, r * 0.7); // hide inner seams
    // thumb
    g.fillStyle(0xffffff, 1).fillRoundedRect(-r * 1.55, r * 2.0, r * 0.85, r * 1.7, r * 0.42);
    g.lineStyle(line, 0x242b3e, 1).strokeRoundedRect(-r * 1.55, r * 2.0, r * 0.85, r * 1.7, r * 0.42);
    g.setRotation(-0.25);
    const ripple = this.add.circle(0, 0, r * 0.9).setStrokeStyle(line, 0x242b3e, 0.7);
    const hand = this.add.container(from.x, from.y, [ripple, g]);
    group.add(hand);
    this.hand = group;
    this.handInner = hand;

    hand.setAlpha(0);
    this.tweens.add({ targets: ripple, scale: 1.8, alpha: 0, duration: 600, repeat: -1, repeatDelay: 900 });
    this.handChain = this.tweens.chain({
      targets: hand,
      loop: -1,
      tweens: [
        { alpha: 1, scale: 1, duration: 180 },
        { scale: 0.88, duration: 180, delay: 150 },
        { x: from.x + dx, y: from.y + dy, duration: 560, ease: 'Sine.easeInOut' },
        { alpha: 0, duration: 200, delay: 150 },
        { x: from.x, y: from.y, scale: 1, duration: 10, delay: 200 }
      ]
    });
  }

  private handInner: Phaser.GameObjects.Container | null = null;
  private handChain: Phaser.Tweens.TweenChain | null = null;

  private hideHand(): void {
    this.hintTimer?.remove(false);
    this.hintTimer = null;
    this.handChain?.stop();
    this.handChain = null;
    if (this.hand) {
      if (this.handInner) {
        this.tweens.killTweensOf(this.handInner);
        this.handInner.each((child: Phaser.GameObjects.GameObject) => this.tweens.killTweensOf(child));
      }
      this.hand.destroy(true);
      this.hand = null;
      this.handInner = null;
    }
  }

  // ---------- end card ----------

  private showEndCard(reason: 'complete' | 'fail' | 'timeout'): void {
    track('endcard', { reason });
    this.phase = 'end';
    this.hideHand();
    this.endReason = reason;
    this.layout();
  }

  private endReason: 'complete' | 'fail' | 'timeout' = 'complete';

  /** The Smart Slide app icon, redrawn with vector shapes so no image needs to be embedded. */
  private drawAppIcon(x: number, y: number, size: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x: x - size / 2, y: y - size / 2 });
    g.fillStyle(0xf2f4f8, 1).fillRoundedRect(0, 0, size, size, size * 0.22);
    const pad = size * 0.15;
    const gap = size * 0.025;
    const c = (size - pad * 2 - gap * 2) / 3;
    const at = (i: number) => pad + i * (c + gap);
    for (let r = 0; r < 3; r++) {
      for (let col = 0; col < 3; col++) g.fillStyle(0xffffff, 1).fillRoundedRect(at(col), at(r), c, c, c * 0.14);
    }
    const block = (r: number, col: number, color: number, alpha = 1) =>
      g.fillStyle(color, alpha).fillRoundedRect(at(col) + c * 0.14, at(r) + c * 0.14, c * 0.72, c * 0.72, c * 0.12);
    const ring = (r: number, col: number, color: number) =>
      g.lineStyle(Math.max(1.5, c * 0.07), color, 1).strokeCircle(at(col) + c / 2, at(r) + c / 2, c * 0.3);
    block(0, 0, 0x2f6fb0);
    block(1, 0, 0x1f9187);
    g.fillStyle(0xe63946, 0.18).fillRoundedRect(at(1) + c * 0.05, at(1) + c * 0.26, c * 0.5, c * 0.48, c * 0.1);
    g.fillStyle(0xe63946, 1).fillRoundedRect(at(1) + c * 0.42, at(1) + c * 0.26, c * 0.48, c * 0.48, c * 0.1);
    ring(0, 2, 0x8a4fd8);
    ring(1, 2, 0xe63946);
    return g;
  }

  private drawEndCard(): void {
    const { w, h, unit } = this.m;
    const dim = this.add.rectangle(0, 0, w, h, 0x0f1424, 0.82).setOrigin(0);
    const cardW = Math.min(w * 0.86, unit * 90);
    const cardH = Math.min(h * 0.78, cardW * 1.25);
    const cx = w / 2;
    const cy = h / 2;
    const card = this.add.graphics();
    card.fillStyle(0xffffff, 1).fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, unit * 4);

    const iconSize = cardH * 0.26;
    const icon = this.drawAppIcon(cx, cy - cardH * 0.27, iconSize);
    const name = this.add.text(cx, cy - cardH * 0.08, APP_NAME, {
      fontFamily: FONT, fontSize: `${Math.round(cardH * 0.07)}px`, fontStyle: 'bold', color: TEXT
    }).setOrigin(0.5);
    const lead = this.endReason === 'fail' ? T.tryAgain : T.tagline1;
    const tag1 = this.add.text(cx, cy + cardH * 0.03, lead, {
      fontFamily: FONT, fontSize: `${Math.round(cardH * 0.06)}px`, fontStyle: 'bold', color: TEXT
    }).setOrigin(0.5);
    const tag2 = this.add.text(cx, cy + cardH * 0.11, this.endReason === 'fail' ? `${T.tagline1} ${T.tagline2}` : T.tagline2, {
      fontFamily: FONT, fontSize: `${Math.round(cardH * 0.06)}px`, fontStyle: 'bold', color: '#2a9d8f'
    }).setOrigin(0.5);
    const feat = this.add.text(cx, cy + cardH * 0.2, T.features, {
      fontFamily: FONT, fontSize: `${Math.round(cardH * 0.036)}px`, color: TEXT_SOFT
    }).setOrigin(0.5);
    const btn = this.makeButton(cx, cy + cardH * 0.34, T.install, cardH * 0.05);
    this.tweens.add({ targets: btn, scale: 1.07, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.root.add([dim, card, icon, name, tag1, tag2, feat, btn]);
  }
}
