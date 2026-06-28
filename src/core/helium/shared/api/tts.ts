import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeTts {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onVoicesChanged: ChromeEvent = new ChromeEvent();
  public readonly onEvent: ChromeEvent = new ChromeEvent();

  getVoices(..._args: any[]): any {
    throw new Error('chrome.tts.getVoices is not implemented');
  }

  isSpeaking(..._args: any[]): any {
    throw new Error('chrome.tts.isSpeaking is not implemented');
  }

  pause(..._args: any[]): any {
    throw new Error('chrome.tts.pause is not implemented');
  }

  resume(..._args: any[]): any {
    throw new Error('chrome.tts.resume is not implemented');
  }

  speak(..._args: any[]): any {
    throw new Error('chrome.tts.speak is not implemented');
  }

  stop(..._args: any[]): any {
    throw new Error('chrome.tts.stop is not implemented');
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
