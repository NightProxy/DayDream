import type { ExtensionContext } from '../../extfs/types';

export class ChromeOffscreen {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  closeDocument(..._args: any[]): any {
    throw new Error('chrome.offscreen.closeDocument is not implemented');
  }

  createDocument(..._args: any[]): any {
    throw new Error('chrome.offscreen.createDocument is not implemented');
  }

  hasDocument(..._args: any[]): any {
    throw new Error('chrome.offscreen.hasDocument is not implemented');
  }

  static readonly Reason = {
    AUDIO_PLAYBACK: "AUDIO_PLAYBACK",
    BATTERY_STATUS: "BATTERY_STATUS",
    BLOBS: "BLOBS",
    CLIPBOARD: "CLIPBOARD",
    DISPLAY_MEDIA: "DISPLAY_MEDIA",
    DOM_PARSER: "DOM_PARSER",
    DOM_SCRAPING: "DOM_SCRAPING",
    GEOLOCATION: "GEOLOCATION",
    IFRAME_SCRIPTING: "IFRAME_SCRIPTING",
    LOCAL_STORAGE: "LOCAL_STORAGE",
    MATCH_MEDIA: "MATCH_MEDIA",
    TESTING: "TESTING",
    USER_MEDIA: "USER_MEDIA",
    WEB_RTC: "WEB_RTC",
    WORKERS: "WORKERS",
  } as const;

}
