// End-to-end check of the built playable in headless Chromium.
// Usage: node tests/e2e.mjs <outDir>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
import fs from 'node:fs';

const out = process.argv[2] || 'shots';
fs.mkdirSync(out, { recursive: true });
const file = 'file://' + path.resolve('dist/index.html');
const browser = await chromium.launch();
const errors = [];

async function open(viewport, extra = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: true, ...extra });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { window.open = (u) => { window.__opened = u; return null; }; });
  await page.goto(file);
  await page.waitForFunction(() => window.__playable && window.__playable.m);
  await page.waitForTimeout(300);
  return page;
}

// cellCenter is in canvas (device) pixels; the mouse works in CSS pixels
async function center(page, row, col) {
  return page.evaluate(([r, c]) => {
    const p = window.__playable.cellCenter(r, c);
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    return { x: p.x / dpr, y: p.y / dpr };
  }, [row, col]);
}

async function swipe(page, row, col, dir) {
  const a = await center(page, row, col);
  const d = { UP: [0, -80], DOWN: [0, 80], LEFT: [-80, 0], RIGHT: [80, 0] }[dir];
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + d[0] / 2, a.y + d[1] / 2);
  await page.mouse.move(a.x + d[0], a.y + d[1]);
  await page.mouse.up();
  await page.waitForTimeout(650);
}

// 1) Portrait phone: tutorial hand, play both levels, reach end card, CTA
const p = await open({ width: 390, height: 844 });
await page_wait(p, 1500);
await p.screenshot({ path: `${out}/1-level1-hand.png` });
await swipe(p, 3, 1, 'UP');
await p.screenshot({ path: `${out}/2-level1-win.png` });
await page_wait(p, 1200);
await page_wait(p, 4500); // let the idle hint appear on level 2
await p.screenshot({ path: `${out}/3-level2-hint.png` });
await swipe(p, 1, 0, 'RIGHT');
await swipe(p, 1, 3, 'UP');
await swipe(p, 0, 3, 'LEFT');
await swipe(p, 0, 0, 'DOWN');
await p.screenshot({ path: `${out}/4-level2-win.png` });
await page_wait(p, 1400);
await p.screenshot({ path: `${out}/5-endcard.png` });
await p.mouse.click(195, 300);
const opened = await p.evaluate(() => window.__opened);
const events = await p.evaluate(() => window.__playableEvents.map(e => e.name));
await p.close();

// 2) Landscape tablet + fail path
const l = await open({ width: 1024, height: 700 });
await page_wait(l, 400);
await swipe(l, 3, 1, 'UP');
await page_wait(l, 1300);
await swipe(l, 1, 3, 'DOWN');
for (let i = 0; i < 3; i++) { await swipe(l, 4, 3, 'UP'); if (i < 2) await swipe(l, 0, 3, 'DOWN'); }
await swipe(l, 0, 3, 'DOWN');
await page_wait(l, 1200);
await l.screenshot({ path: `${out}/6-landscape-fail-endcard.png` });
const lEvents = await l.evaluate(() => window.__playableEvents.map(e => e.name));
await l.close();

// 3) Small phone, Turkish locale
const s = await open({ width: 320, height: 568 }, { locale: 'tr-TR' });
await page_wait(s, 1500);
await s.screenshot({ path: `${out}/7-small-tr.png` });
await s.close();

// 4) MRAID container: game must wait for "ready" and CTA must call mraid.open
const mp = await browser.newPage({ viewport: { width: 375, height: 667 } });
await mp.addInitScript(() => {
  const handlers = {};
  window.mraid = {
    state: 'loading',
    getState() { return this.state; },
    addEventListener(ev, fn) { (handlers[ev] ??= []).push(fn); },
    isViewable() { return true; },
    open(u) { window.__mraidOpened = u; }
  };
  setTimeout(() => { window.mraid.state = 'default'; (handlers.ready || []).forEach(f => f()); }, 3000);
});
await mp.goto(file);
const startedEarly = await mp.evaluate(() => !!window.__playable);
await mp.waitForFunction(() => window.__playable && window.__playable.m);
await mp.evaluate(() => window.__playable.showEndCard('timeout'));
await mp.mouse.click(187, 200);
const mraidOpened = await mp.evaluate(() => window.__mraidOpened);
await mp.close();

// 5) Retina phone (DPR 3): sharpness + win banner over the board
const rp = await open({ width: 390, height: 844 }, { deviceScaleFactor: 3 });
const canvasSize = await rp.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height, c.clientWidth, c.clientHeight]; });
await swipe(rp, 3, 1, 'UP');
await rp.screenshot({ path: `${out}/8-retina-win-banner.png` });
await page_wait(rp, 1500);
await swipe(rp, 1, 0, 'RIGHT');
await swipe(rp, 1, 3, 'UP');
await swipe(rp, 0, 3, 'LEFT');
await swipe(rp, 0, 0, 'DOWN');
await rp.screenshot({ path: `${out}/9-retina-level2-win.png` });
const rEvents = await rp.evaluate(() => window.__playableEvents.map(e => e.name));

console.log(JSON.stringify({ opened, events, lEvents, startedEarly, mraidOpened, canvasSize, rEvents, errors }, null, 2));
await browser.close();

async function page_wait(page, ms) { await page.waitForTimeout(ms); }
