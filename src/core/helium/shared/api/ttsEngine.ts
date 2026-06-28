import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

export class ChromeTtsEngine {
  protected readonly ctx: ExtensionContext;

  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
  }

  public readonly onLanguageStatusRequest: ChromeEvent = new ChromeEvent();
  public readonly onUninstallLanguageRequest: ChromeEvent = new ChromeEvent();
  public readonly onInstallLanguageRequest: ChromeEvent = new ChromeEvent();
  public readonly onResume: ChromeEvent = new ChromeEvent();
  public readonly onPause: ChromeEvent = new ChromeEvent();
  public readonly onStop: ChromeEvent = new ChromeEvent();
  public readonly onSpeakWithAudioStream: ChromeEvent = new ChromeEvent();
  public readonly onSpeak: ChromeEvent = new ChromeEvent();

  sendTtsAudio(..._args: any[]): any {
    throw new Error('chrome.ttsEngine.sendTtsAudio is not implemented');
  }

  sendTtsEvent(..._args: any[]): any {
    throw new Error('chrome.ttsEngine.sendTtsEvent is not implemented');
  }

  updateLanguage(..._args: any[]): any {
    throw new Error('chrome.ttsEngine.updateLanguage is not implemented');
  }

  updateVoices(..._args: any[]): any {
    throw new Error('chrome.ttsEngine.updateVoices is not implemented');
  }

  static readonly LanguageInstallStatus = {
    FAILED: "failed",
    INSTALLED: "installed",
    INSTALLING: "installing",
    NOT_INSTALLED: "notInstalled",
  } as const;

  static readonly TtsClientSource = {
    CHROMEFEATURE: "chromefeature",
    EXTENSION: "extension",
  } as const;

  static readonly VoiceGender = {
    FEMALE: "female",
    MALE: "male",
  } as const;

}
