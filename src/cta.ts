/**
 * Store redirect for every major ad network, with a plain-browser fallback.
 *
 * - MRAID 2/3 (AppLovin, Unity Ads, Mintegral, Vungle, ironSource):  mraid.open(url)
 * - Google Ads HTML5:                                                ExitApi.exit()
 * - Meta (Facebook) Playables:                                       FbPlayableAd.onCTAClick()
 * - Anything else (GitHub Pages demo):                               window.open(url)
 */

export const STORE = {
  ios: 'https://apps.apple.com/app/id6792535365',
  android: 'https://play.google.com/store/apps/details?id=com.yaman.adimakilli'
};

interface Mraid {
  getState(): string;
  addEventListener(ev: string, fn: (...args: unknown[]) => void): void;
  isViewable?(): boolean;
  open(url: string): void;
}

declare global {
  interface Window {
    mraid?: Mraid;
    ExitApi?: { exit(): void };
    FbPlayableAd?: { onCTAClick(): void };
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function storeUrl(): string {
  return isIOS() ? STORE.ios : STORE.android;
}

export type CtaSource = 'endcard' | 'button' | 'fail';

export function openStore(source: CtaSource): void {
  track('cta_click', { source });
  const url = storeUrl();
  try {
    if (window.FbPlayableAd) return window.FbPlayableAd.onCTAClick();
    if (window.ExitApi) return window.ExitApi.exit();
    if (window.mraid) return window.mraid.open(url);
  } catch {
    // fall through to the browser fallback
  }
  window.open(url, '_blank');
}

/** Resolves when the ad container is ready (immediately when there is no MRAID). */
export function whenAdReady(): Promise<void> {
  const m = window.mraid;
  if (!m) return Promise.resolve();
  return new Promise(resolve => {
    const start = () => {
      if (!m.isViewable || m.isViewable()) return resolve();
      m.addEventListener('viewableChange', (v: unknown) => { if (v) resolve(); });
    };
    if (m.getState() === 'loading') m.addEventListener('ready', start);
    else start();
  });
}

/** Lightweight event log; ad networks / QA can read window.__playableEvents. */
export function track(name: string, data: Record<string, unknown> = {}): void {
  const w = window as unknown as { __playableEvents?: unknown[] };
  (w.__playableEvents ??= []).push({ name, t: Math.round(performance.now()), ...data });
}
