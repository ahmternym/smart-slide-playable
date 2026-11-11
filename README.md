# Smart Slide — HTML5 Playable Ad

A single-file playable ad for **Smart Slide: Block Puzzle**, my logic puzzle game on the [App Store](https://apps.apple.com/app/id6792535365) and [Google Play](https://play.google.com/store/apps/details?id=com.yaman.adimakilli).

**▶ Live demo:** https://ahmternym.github.io/smart-slide-playable/ (best viewed on a phone, or in DevTools mobile mode)

## What it does

1. **Tutorial level** (1 move). An animated hand shows the swipe.
2. **"Aha" level** (4 moves). The red block can only reach its goal after the blue block has moved out of the way, so the player has to plan the order. Both levels come from the real game's level files.
3. **End card** with the app icon and a pulsing install button. It appears when the player finishes, runs out of moves, or after 40 seconds.

The hand isn't scripted. It runs a **BFS solver** on the current board, so it always points at the next optimal move, even after the player has made mistakes.

## Ad-network ready

| Requirement | How it's handled |
| --- | --- |
| Single HTML file | Vite + `vite-plugin-singlefile`; everything is inlined, and even the app icon is drawn with vectors (≈1.5 MB, ≈345 KB gzipped) |
| MRAID 2/3 (AppLovin, Unity, Mintegral, ironSource, Vungle) | Waits for `ready` and `viewable` before starting; CTA calls `mraid.open()` |
| Google Ads HTML5 | CTA calls `ExitApi.exit()` |
| Meta Playables | CTA calls `FbPlayableAd.onCTAClick()` |
| Store routing | iOS → App Store, everything else → Google Play |
| Any screen size | Layout scales with the screen in portrait and landscape; the canvas renders at device resolution (up to 3×), so text stays sharp on retina phones |
| Language | English and Turkish, picked from the device language |
| Analytics hooks | Events (`start`, `first_interaction`, `move`, `level_complete`, `level_fail`, `endcard`, `cta_click`) are pushed to `window.__playableEvents` |

## Tech

- **TypeScript + Phaser 3**. All shapes are drawn with vector graphics, so there are no sprite sheets to load.
- **`src/core.ts`** is a pure, Phaser-free puzzle engine (slide rules, lock rule, BFS solver), covered by unit tests.
- **Vitest** unit tests check that both levels are solvable within their move limits.
- **Playwright** end-to-end test (`tests/e2e.mjs`) plays both levels, the fail path and the end card. It also checks the CTA in a browser and inside a mocked MRAID container.
- The end-to-end test caught a real bug: with Phaser's frame-delta smoothing turned on, timers ran about 4× slower than the wall clock on a slow WebView, so the level never advanced. This is fixed with `fps.smoothStep = false`.

## Run it

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # → dist/index.html (upload this file to the ad network)
node tests/e2e.mjs shots   # end-to-end run with screenshots (needs Playwright)
```

---

© Ahmet Eren Yaman. Smart Slide and its assets are not licensed for reuse; the code is published as a portfolio sample.
