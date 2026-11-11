import Phaser from 'phaser';
import { PlayScene } from './game';
import { whenAdReady } from './cta';

/**
 * Crisp rendering on high-DPI phones: the canvas is created at device pixels
 * (CSS size x devicePixelRatio) and shown at CSS size through `zoom`.
 * The scene lays everything out relative to the screen, so it works in device pixels directly.
 */
const DPR = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
const deviceSize = () => ({
  w: Math.round(window.innerWidth * DPR),
  h: Math.round(window.innerHeight * DPR)
});

whenAdReady().then(() => {
  const { w, h } = deviceSize();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f2f4f8',
    width: w,
    height: h,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / DPR },
    render: { antialias: true, roundPixels: false },
    audio: { noAudio: true },
    // Real frame deltas: timers stay in sync with the wall clock even on slow ad webviews
    fps: { smoothStep: false },
    banner: false,
    scene: [PlayScene]
  });
  window.addEventListener('resize', () => {
    const s = deviceSize();
    game.scale.resize(s.w, s.h);
    game.scale.setZoom(1 / DPR);
  });
});
