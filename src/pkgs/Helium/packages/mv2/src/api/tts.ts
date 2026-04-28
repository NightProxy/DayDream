import { ChromeEvent } from '@anthropic/chrome-api-shared';

export class ChromeTts {
  public readonly onVoicesChanged: ChromeEvent = new ChromeEvent();
  public readonly onEvent: ChromeEvent = new ChromeEvent();

  getVoices(...args: any[]): any {
    throw new Error('chrome.tts.getVoices is not implemented');
  }

  isSpeaking(...args: any[]): any {
    throw new Error('chrome.tts.isSpeaking is not implemented');
  }

  pause(...args: any[]): any {
    throw new Error('chrome.tts.pause is not implemented');
  }

  resume(...args: any[]): any {
    throw new Error('chrome.tts.resume is not implemented');
  }

  speak(...args: any[]): any {
    throw new Error('chrome.tts.speak is not implemented');
  }

  stop(...args: any[]): any {
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
