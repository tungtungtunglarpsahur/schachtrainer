// Geräte-Erkennung für die Home-Bildschirm-Anleitung (iPhone & iPad).
const ua = navigator.userAgent || '';

export const isIPhone = /iPhone|iPod/.test(ua);
// iPads melden sich seit iPadOS 13 wie ein Mac – erkennbar am Touchscreen.
export const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isIOS = isIPhone || isIPad;

/** Läuft schon als App vom Home-Bildschirm? */
export const isStandalone = () =>
  navigator.standalone === true ||
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches;

/** Link in Instagram, TikTok & Co. geöffnet – dort gibt es kein „Zum Home-Bildschirm“. */
export const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|LinkedInApp|Pinterest|GSA\//.test(ua);

export const iosBrowser = /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'Safari';

// Safari-Version (= iOS-Version): seit iOS 26 steht sie nur noch im „Version/…“-Teil.
const safari = (() => {
  const m = ua.match(/Version\/(\d+)/);
  return m ? +m[1] : 0;
})();

/** Welche Anleitung passt: 27 (Seiten-Menü links), 26 (••• rechts) oder 18 (Teilen-Knopf unten). */
export const iosStyle = () => (safari >= 27 ? '27' : safari >= 26 ? '26' : safari > 0 ? '18' : '26');
