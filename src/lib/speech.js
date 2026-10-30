// Sprachausgabe (TTS) über die Web Speech API – Deutsch, ohne Server.
//
// API (alles fehlertolerant, macht nichts, wenn der Browser es nicht kann):
//   speak(text, { interrupt = true, force = false })
//       Liest einen Coach-Text vor – nur wenn settings.tts an ist (force: true ignoriert das,
//       z. B. für den Test-Knopf). Markdown, Emojis und Zug-Symbole werden entfernt,
//       Schachnotation wird ausgesprochen („Lxe6+“ → „Läufer schlägt e6, Schach“).
//       interrupt: true bricht die laufende Ansage ab, false hängt sie hinten an.
//   speakMove(san, { color, interrupt = false, force = false })
//       Sagt einen Zug an – nur wenn settings.ttsMoves an ist. color: 'w' | 'b' → „Weiß: Springer f3“.
//   unlockSpeech()   im Klick-Handler aufrufen (iOS erlaubt Sprache erst nach einer Berührung).
//   stopSpeaking()   bricht alles ab.
//   ttsSupported()   true, wenn der Browser Sprachausgabe kann.
//   germanVoices()   [{ uri, name, lang }] – deutsche Stimmen, beste zuerst.
//   onVoices(cb)     meldet, wenn die Stimmen geladen sind (gibt eine Abmelde-Funktion zurück).
//   spokenText(text) / spokenMove(san)  reine Umwandlung in Sprechtext (ohne Ausgabe).
//
// Einstellungen (state.settings): tts, ttsMoves, ttsVoice (voiceURI), ttsRate (0.8–1.3).
import { state } from './store.js';

const PIECE = { K: 'König', D: 'Dame', Q: 'Dame', T: 'Turm', R: 'Turm', L: 'Läufer', B: 'Läufer', S: 'Springer', N: 'Springer' };
const PREFERRED = ['anna', 'helena', 'google deutsch', 'petra', 'markus', 'yannick', 'katja', 'conrad', 'hedda', 'stefan', 'marlene', 'vicki'];

const suffix = (s) => (s === '#' ? ', Schachmatt' : s === '+' ? ', Schach' : '');

/** Einen einzelnen Zug (deutsche oder englische Notation) als Sprechtext. */
export function spokenMove(san) {
  const t = String(san || '').trim().replace(/[!?★]+$/u, '');
  let m = t.match(/^(?:O-O-O|0-0-0)([+#])?$/);
  if (m) return `lange Rochade${suffix(m[1])}`;
  m = t.match(/^(?:O-O|0-0)([+#])?$/);
  if (m) return `kurze Rochade${suffix(m[1])}`;
  m = t.match(/^([KDTLSQRBN])([a-h]?[1-8]?)(x?)([a-h][1-8])(?:=?([DTLSQRBN]))?([+#])?$/);
  if (m) return `${PIECE[m[1]]} ${m[3] ? 'schlägt ' : ''}${m[4]}${m[5] ? `, wird ${PIECE[m[5]]}` : ''}${suffix(m[6])}`;
  m = t.match(/^([a-h])x([a-h][1-8])(?:=?([DTLSQRBN]))?([+#])?$/);
  if (m) return `${m[1]}-Bauer schlägt ${m[2]}${m[3] ? `, wird ${PIECE[m[3]]}` : ''}${suffix(m[4])}`;
  m = t.match(/^([a-h][1-8])(?:=?([DTLSQRBN]))?([+#])?$/);
  if (m) return `${m[1]}${m[2] ? ` wird ${PIECE[m[2]]}` : ''}${suffix(m[3])}`;
  return t;
}

/** Coach-Text in natürlichen Sprechtext umwandeln. */
export function spokenText(text) {
  let s = String(text || '');
  s = s.replace(/\*\*|__|`/g, '').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, '$1$2');
  try {
    s = s.replace(/[\p{Extended_Pictographic}️‍]/gu, '');
  } catch {
    /* ältere Browser ohne Unicode-Properties */
  }
  // „schlägt mit Txh7“ → „schlägt mit dem Turm auf h7“ (klingt natürlicher als „schlägt mit Turm schlägt h7“)
  const DAT = { K: 'dem König', D: 'der Dame', Q: 'der Dame', T: 'dem Turm', R: 'dem Turm', L: 'dem Läufer', B: 'dem Läufer', S: 'dem Springer', N: 'dem Springer' };
  s = s.replace(/(schlägt|nimmt) mit ([KDTLSQRBN])[a-h]?[1-8]?x([a-h][1-8])([+#])?/g, (_, verb, p, sq, sfx) => `${verb} mit ${DAT[p]} auf ${sq}${suffix(sfx)}`);
  // Rochaden und Züge (Figurenzüge, Bauernschläge, Umwandlungen, Schach/Matt)
  s = s.replace(/(^|[\s(„"'])(O-O-O|0-0-0|O-O|0-0)([+#])?(?=[\s.,;:!?)“"']|$)/g, (_, pre, c, sfx) => pre + spokenMove(c + (sfx || '')));
  s = s.replace(/(^|[\s(„"'])([KDTLSQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=?[DTLSQRBN])?[+#]?)(?=[\s.,;:!?)“"'–-]|$)/g, (_, pre, mv) => pre + spokenMove(mv));
  s = s.replace(/(^|[\s(„"'])([a-h]x[a-h][1-8](?:=?[DTLSQRBN])?[+#]?)(?=[\s.,;:!?)“"'–-]|$)/g, (_, pre, mv) => pre + spokenMove(mv));
  s = s.replace(/(^|[\s(„"'])([a-h][1-8](?:=?[DTLSQRBN])?[+#])(?=[\s.,;:!?)“"'–-]|$)/g, (_, pre, mv) => pre + spokenMove(mv));
  s = s.replace(/(^|[\s(„"'])([a-h][1-8]=[DTLSQRBN])(?=[\s.,;:!?)“"'–-]|$)/g, (_, pre, mv) => pre + spokenMove(mv));
  // Bewertungssymbole entfernen (das Wort „Patzer“ o. ä. steht ohnehin im Text)
  s = s.replace(/(\S)(\?\?|\?!|!\?|!!)(?=\s|$|[.,])/g, '$1').replace(/(^|\s)(\?\?|\?!|!\?|!!|\?|!|★|✓)(?=\s|$)/g, '$1');
  s = s.replace(/★|✓/g, '');
  s = s.replace(/\s[–—-]\s/g, ', ').replace(/[„“"]/g, '').replace(/·/g, ',').replace(/→/g, ' zu ');
  s = s.replace(/\bElo\b/g, 'Elo').replace(/\bXP\b/g, 'X P');
  s = s.replace(/\s+([.,!?;:])/g, '$1').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
  return s;
}

// ---------- Ausgabe ----------

export const ttsSupported = () => {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  } catch {
    return false;
  }
};

let voiceCache = [];
const listeners = new Set();
function refreshVoices() {
  try {
    voiceCache = window.speechSynthesis.getVoices() || [];
  } catch {
    voiceCache = [];
  }
  listeners.forEach((cb) => {
    try {
      cb(voiceCache);
    } catch {
      /* egal */
    }
  });
}
if (ttsSupported()) {
  refreshVoices();
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    if (!window.speechSynthesis.addEventListener) window.speechSynthesis.onvoiceschanged = refreshVoices;
  } catch {
    /* egal */
  }
}

const rank = (v) => {
  const n = v.name.toLowerCase();
  const i = PREFERRED.findIndex((p) => n.includes(p));
  return (i < 0 ? 50 : i) + (v.lang.toLowerCase().startsWith('de-de') ? 0 : 20) + (v.localService ? 0 : 5);
};

export function germanVoices() {
  if (!ttsSupported()) return [];
  if (!voiceCache.length) refreshVoices();
  return voiceCache
    .filter((v) => String(v.lang || '').toLowerCase().startsWith('de'))
    .sort((a, b) => rank(a) - rank(b))
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

export function onVoices(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function pickVoice() {
  const want = state.settings.ttsVoice;
  const all = voiceCache.length ? voiceCache : (refreshVoices(), voiceCache);
  if (want) {
    const v = all.find((x) => x.voiceURI === want);
    if (v) return v;
  }
  const de = all.filter((v) => String(v.lang || '').toLowerCase().startsWith('de')).sort((a, b) => rank(a) - rank(b));
  return de[0] || null;
}

function say(text, interrupt) {
  if (!ttsSupported() || !text) return;
  try {
    const synth = window.speechSynthesis;
    const u = new window.SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || 'de-DE';
    const rate = Number(state.settings.ttsRate) || 1;
    u.rate = Math.max(0.6, Math.min(1.6, rate));
    u.pitch = 1;
    u.volume = 1;
    if (interrupt && (synth.speaking || synth.pending)) {
      synth.cancel();
      // Chrome verschluckt manchmal ein speak() direkt nach cancel()
      setTimeout(() => {
        try {
          synth.speak(u);
        } catch {
          /* egal */
        }
      }, 60);
    } else synth.speak(u);
  } catch {
    /* Sprachausgabe ist optional */
  }
}

export function speak(text, { interrupt = true, force = false } = {}) {
  if (!force && !state.settings.tts) return;
  say(spokenText(text), interrupt);
}

export function speakMove(san, { color, interrupt = false, force = false } = {}) {
  if (!force && !state.settings.ttsMoves) return;
  const who = color === 'w' ? 'Weiß: ' : color === 'b' ? 'Schwarz: ' : '';
  say(who + spokenMove(san), interrupt);
}

export function stopSpeaking() {
  try {
    if (ttsSupported()) window.speechSynthesis.cancel();
  } catch {
    /* egal */
  }
}

/** Muss in einem Klick/Tipp-Handler laufen: schaltet Sprache auf iOS frei. */
export function unlockSpeech() {
  if (!ttsSupported()) return;
  try {
    const u = new window.SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* egal */
  }
}
