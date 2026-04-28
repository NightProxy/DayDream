export class ChromeDesktopCapture {

  cancelChooseDesktopMedia(...args: any[]): any {
    throw new Error('chrome.desktopCapture.cancelChooseDesktopMedia is not implemented');
  }

  chooseDesktopMedia(...args: any[]): any {
    throw new Error('chrome.desktopCapture.chooseDesktopMedia is not implemented');
  }

  static readonly DesktopCaptureSourceType = {
    AUDIO: "audio",
    SCREEN: "screen",
    TAB: "tab",
    WINDOW: "window",
  } as const;

  static readonly SelfCapturePreferenceEnum = {
    EXCLUDE: "exclude",
    INCLUDE: "include",
  } as const;

  static readonly SystemAudioPreferenceEnum = {
    EXCLUDE: "exclude",
    INCLUDE: "include",
  } as const;

  static readonly WindowAudioPreferenceEnum = {
    EXCLUDE: "exclude",
    SYSTEM: "system",
    WINDOW: "window",
  } as const;

}
