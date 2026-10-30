// Anleitung „Zum Home-Bildschirm“ für iPhone & iPad – mit Video, das zur iOS-Version passt.
// Neue Nutzer auf dem iPhone sehen sie ganz am Anfang (vor der Umfrage), alle anderen über die Einstellungen.
import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { update } from '../lib/store.js';
import { Crown, Icon, Logo, toast } from '../ui/kit.js';
import { inAppBrowser, iosBrowser, iosStyle, isIOS, isIPad } from '../lib/device.js';

// Startzeiten der vier Schritte im jeweiligen Video (Sekunden).
const VIDEOS = {
  26: { src: 'assets/video/install-ios26.mp4', poster: 'assets/video/install-ios26.jpg', steps: [0, 2.85, 5.8, 7.7] },
  27: { src: 'assets/video/install-ios27.mp4', poster: 'assets/video/install-ios27.jpg', steps: [0, 2.85, 5.8, 7.7] },
  18: { src: 'assets/video/install-ios18.mp4', poster: 'assets/video/install-ios18.jpg', steps: [0, 1.55, 4.5, 6.4] },
};

const ShareGlyph = () => html`<span class="ig-glyph" aria-label="Teilen-Symbol"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" /></svg></span>`;

function firstStep(style) {
  if (iosBrowser !== 'Safari') return html`Tippe in der Adressleiste auf <b>Teilen</b> <${ShareGlyph} /> (bei ${iosBrowser} oben rechts).`;
  if (isIPad) return html`Tippe oben rechts auf <b>Teilen</b> <${ShareGlyph} /> – oder auf <b>•••</b> und dann auf <b>Teilen</b>.`;
  if (style === '27') return html`Tippe links in der Adressleiste auf das <b>Seiten-Symbol</b> (oder halte die Adressleiste gedrückt) und dann auf <b>Teilen</b>.`;
  if (style === '26') return html`Tippe unten rechts auf <b>•••</b> und dann auf <b>Teilen</b> <${ShareGlyph} />.`;
  return html`Tippe unten in der Leiste auf <b>Teilen</b> <${ShareGlyph} />.`;
}

const stepsFor = (style) => [
  firstStep(style),
  html`Scrolle ein Stück nach unten und tippe auf <b>Zum Home-Bildschirm</b>.`,
  style === '18' ? html`Tippe oben rechts auf <b>Hinzufügen</b>.` : html`Lass <b>Als Web-App öffnen</b> an und tippe oben rechts auf <b>Hinzufügen</b>.`,
  html`Fertig! Öffne Learning King über das <b>neue Symbol</b> auf deinem Home-Bildschirm.`,
];

function AppIcon({ size = 96 }) {
  return html`<span class="ig-appicon" style=${{ width: size + 'px', height: size + 'px' }}><${Crown} /></span>`;
}

/** first = automatisch beim ersten Start; sonst über #/install geöffnet. */
export function InstallGuide({ first = false }) {
  const style = iosStyle();
  const vid = VIDEOS[style];
  const steps = stepsFor(style);
  const ref = useRef(null);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);

  const skip = () => update((s) => (s.profile.installSkipped = true));
  const leave = () => (first ? skip() : history.length > 1 ? history.back() : (location.hash = '#/settings'));

  useEffect(() => {
    const v = ref.current;
    if (!v || done) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setInterval(() => {
      const t = v.currentTime;
      let k = 0;
      vid.steps.forEach((s0, i) => {
        if (t >= s0 - 0.05) k = i;
      });
      setStep(k);
    }, 120);
    const onPause = () => setPaused(true);
    const onPlay = () => setPaused(false);
    v.addEventListener('pause', onPause);
    v.addEventListener('play', onPlay);
    if (calm) setPaused(true);
    else v.play()?.catch(() => setPaused(true)); // z. B. im Stromsparmodus: dann mit Start-Knopf
    return () => {
      clearInterval(timer);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('play', onPlay);
    };
  }, [done]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play()?.catch(() => {});
    else v.pause();
  };
  const jump = (i) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = vid.steps[i] + 0.02;
    setStep(i);
    v.play()?.catch(() => {});
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      toast('Link kopiert – jetzt in Safari einfügen.', { icon: 'check', kind: 'good' });
    } catch {
      toast('Kopieren ging nicht – halte die Adresse oben gedrückt.');
    }
  };

  const top = html`<div class="ig-top">
    <${Logo} small />
    ${first ? html`<span class="ig-rec"><${Icon} name="check" size=${13} /> Empfohlen</span>` : html`<button type="button" class="ig-close" onClick=${leave} aria-label="Schließen"><${Icon} name="x" size=${18} /></button>`}
  </div>`;

  // Instagram, TikTok & Co.: erst in Safari öffnen.
  if (isIOS && inAppBrowser) {
    return html`<div class="ig">
      <div class="ig-bg"></div>
      ${top}
      <main class="ig-main ig-center">
        <span class="ig-badge"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg></span>
        <h1 class="ig-title">Öffne den Link in Safari</h1>
        <p class="ig-sub">Du bist gerade im Browser einer anderen App. Von dort kann man Learning King nicht auf den Home-Bildschirm legen.</p>
        <ol class="ig-list">
          <li><span>1</span><p>Tippe oben oder unten auf <b>•••</b> bzw. <b>⋯</b>.</p></li>
          <li><span>2</span><p>Wähle <b>In Safari öffnen</b> oder <b>Im Browser öffnen</b>.</p></li>
          <li><span>3</span><p>Dort zeigen wir dir den Rest – dauert 20 Sekunden.</p></li>
        </ol>
        <div class="ig-actions">
          <button type="button" class="btn primary xl" onClick=${copyLink}><${Icon} name="copy" /> Link kopieren</button>
          <button type="button" class="btn ghost" onClick=${leave}>${first ? 'Trotzdem hier weitermachen' : 'Zurück'}</button>
        </div>
      </main>
    </div>`;
  }

  if (done) {
    return html`<div class="ig">
      <div class="ig-bg"></div>
      ${top}
      <main class="ig-main ig-center ig-done">
        <div class="ig-home">
          <span class="ig-glow"></span>
          <${AppIcon} size=${104} />
          <small>Learning King</small>
        </div>
        <h1 class="ig-title">Super! Jetzt die App öffnen</h1>
        <p class="ig-sub">Geh auf deinen Home-Bildschirm und tippe auf <b>Learning King</b>. Dort startet dein Training im Vollbild – diesen Tab hier kannst du schließen.</p>
        <div class="ig-actions">
          <button type="button" class="btn ghost" onClick=${() => setDone(false)}><${Icon} name="repeat" /> Anleitung nochmal ansehen</button>
          <button type="button" class="ig-later" onClick=${leave}>${first ? 'Doch lieber hier im Browser weitermachen' : 'Zurück zur App'}</button>
        </div>
      </main>
    </div>`;
  }

  return html`<div class="ig">
    <div class="ig-bg"></div>
    ${top}
    <main class="ig-main">
      <h1 class="ig-title">Learning King als App</h1>
      <p class="ig-sub ig-intro">Leg es auf deinen Home-Bildschirm – dann startet es wie eine echte App, im Vollbild und auch ohne Internet. Dauert 20 Sekunden.</p>
      <div class=${`ig-video ${paused ? 'paused' : ''}`} onClick=${toggle}>
        <video ref=${ref} src=${vid.src} poster=${vid.poster} muted loop playsinline autoplay preload="auto" disablepictureinpicture disableremoteplayback aria-label="Video: So kommt Learning King auf den Home-Bildschirm"></video>
        <span class="ig-play" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" /></svg></span>
      </div>
      <div class="ig-steps" role="tablist" aria-label="Schritte">
        ${steps.map((_, i) => html`<button type="button" role="tab" aria-selected=${i === step} class=${`ig-dot ${i === step ? 'on' : i < step ? 'past' : ''}`} onClick=${() => jump(i)}>${i === 3 ? html`<${Icon} name="check" size=${14} />` : i + 1}</button>`)}
      </div>
      <p class="ig-step" key=${step}>${steps[step]}</p>
      <div class="ig-actions">
        <button type="button" class="btn primary xl" onClick=${() => setDone(true)}><${Icon} name="check" /> Geschafft – sie ist drauf</button>
        <button type="button" class="ig-later" onClick=${leave}>${first ? 'Später – erst mal im Browser weitermachen' : 'Zurück'}</button>
      </div>
      ${!isIOS ? html`<p class="ig-other"><b>Android:</b> Im Chrome-Menü <b>⋮</b> auf <b>App installieren</b> bzw. <b>Zum Startbildschirm hinzufügen</b> tippen.</p>` : null}
    </main>
  </div>`;
}
