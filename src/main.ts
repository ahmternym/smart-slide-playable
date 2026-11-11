import Phaser from 'phaser';
import { PlayScene } from './game';
import { whenAdReady } from './cta';

whenAdReady().then(() => {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#f2f4f8',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    render: { antialias: true, roundPixels: false },
    audio: { noAudio: true },
    // Real frame deltas: timers stay in sync with the wall clock even on slow ad webviews
    fps: { smoothStep: false },
    banner: false,
    scene: [PlayScene]
  } as Phaser.Types.Core.GameConfig);
});
