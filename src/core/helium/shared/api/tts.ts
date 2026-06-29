import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

/**
 * `chrome.tts.*` — text-to-speech wrapped around the browser's
 * native Web Speech API (`speechSynthesis`).
 *
 * Limitations vs real Chrome:
 *   - No engine selection by extension ID (chrome.ttsEngine is a
 *     separate stub).
 *   - `onEvent` fires `start` / `end` / `error` events but not the
 *     more granular `word` / `sentence` / `marker` boundaries unless
 *     the SpeechSynthesisUtterance fires them (some platforms do).
 */
export class ChromeTts {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    // Bridge voiceschanged event from the platform → chrome.tts.onVoicesChanged.
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          try { (this.onVoicesChanged as { dispatch?: () => void }).dispatch?.(); } catch { /* noop */ }
        });
      }
    } catch { /* noop */ }
  }

  public readonly onVoicesChanged: ChromeEvent = new ChromeEvent();
  public readonly onEvent: ChromeEvent = new ChromeEvent();

  getVoices(...args: any[]): any {
    let voices: SpeechSynthesisVoice[] = [];
    try { voices = window.speechSynthesis?.getVoices() ?? []; } catch { /* noop */ }
    const chromeVoices = voices.map((v) => ({
      voiceName: v.name,
      lang: v.lang,
      remote: !v.localService,
      eventTypes: ['start', 'end', 'error'],
    }));
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(chromeVoices); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(chromeVoices);
  }

  isSpeaking(...args: any[]): any {
    let speaking = false;
    try { speaking = window.speechSynthesis?.speaking ?? false; } catch { /* noop */ }
    const cb = typeof args[0] === 'function' ? args[0] : null;
    if (cb) { try { cb(speaking); } catch { /* swallow */ } return undefined; }
    return Promise.resolve(speaking);
  }

  pause(..._args: any[]): undefined {
    try { window.speechSynthesis?.pause(); } catch { /* noop */ }
    return undefined;
  }

  resume(..._args: any[]): undefined {
    try { window.speechSynthesis?.resume(); } catch { /* noop */ }
    return undefined;
  }

  speak(...args: any[]): any {
    const text = typeof args[0] === 'string' ? args[0] : '';
    const opts = (args[1] ?? {}) as {
      voiceName?: string;
      lang?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
      onEvent?: (ev: { type: string; charIndex?: number }) => void;
    };
    const cb = typeof args[args.length - 1] === 'function' && args[args.length - 1] !== opts.onEvent
      ? args[args.length - 1] : null;
    try {
      if (!window.speechSynthesis) throw new Error('speechSynthesis unavailable');
      const utter = new SpeechSynthesisUtterance(text);
      if (opts.lang) utter.lang = opts.lang;
      if (typeof opts.rate === 'number') utter.rate = opts.rate;
      if (typeof opts.pitch === 'number') utter.pitch = opts.pitch;
      if (typeof opts.volume === 'number') utter.volume = opts.volume;
      if (opts.voiceName) {
        const voices = window.speechSynthesis.getVoices();
        const match = voices.find((v) => v.name === opts.voiceName);
        if (match) utter.voice = match;
      }
      const fire = (type: string, extra?: Record<string, unknown>) => {
        const event = { type, charIndex: 0, ...extra };
        try { (this.onEvent as { dispatch?: (...a: unknown[]) => void }).dispatch?.(event); } catch { /* noop */ }
      };
      utter.onstart = () => fire('start');
      utter.onend = () => fire('end');
      utter.onerror = (e) => fire('error', { errorMessage: (e as SpeechSynthesisErrorEvent).error });
      window.speechSynthesis.speak(utter);
      if (cb) cb();
    } catch (err) {
      console.warn('[helium/tts] speak failed:', err);
      if (cb) cb();
    }
    return undefined;
  }

  stop(..._args: any[]): undefined {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    return undefined;
  }

  static readonly EventType = {
    CANCELLED: "cancelled",
    END: "end",
    ERROR: "error",
    INTERRUPTED: "interrupted",
    MARKER: "marker",
    PAUSE: "pause",
    RESUME: "resume",
    SENTENCE: "sentence",
    START: "start",
    WORD: "word",
  } as const;

  static readonly VoiceGender = {
    FEMALE: "female",
    MALE: "male",
  } as const;
}
