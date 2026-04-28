import { ContentSetting } from '@anthropic/chrome-api-shared';

export class ChromeContentSettings {
  public readonly unsandboxedPlugins: ContentSetting = new ContentSetting();
  public readonly popups: ContentSetting = new ContentSetting();
  public readonly plugins: ContentSetting = new ContentSetting();
  public readonly notifications: ContentSetting = new ContentSetting();
  public readonly mouselock: ContentSetting = new ContentSetting();
  public readonly microphone: ContentSetting = new ContentSetting();
  public readonly location: ContentSetting = new ContentSetting();
  public readonly javascript: ContentSetting = new ContentSetting();
  public readonly images: ContentSetting = new ContentSetting();
  public readonly fullscreen: ContentSetting = new ContentSetting();
  public readonly cookies: ContentSetting = new ContentSetting();
  public readonly clipboard: ContentSetting = new ContentSetting();
  public readonly camera: ContentSetting = new ContentSetting();
  public readonly automaticDownloads: ContentSetting = new ContentSetting();
  public readonly autoVerify: ContentSetting = new ContentSetting();

  static readonly AutoVerifyContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
  } as const;

  static readonly CameraContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly ClipboardContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly CookiesContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
    SESSION_ONLY: "session_only",
  } as const;

  static readonly FullscreenContentSetting = {
    ALLOW: "allow",
  } as const;

  static readonly ImagesContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
  } as const;

  static readonly JavascriptContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
  } as const;

  static readonly LocationContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly MicrophoneContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly MouselockContentSetting = {
    ALLOW: "allow",
  } as const;

  static readonly MultipleAutomaticDownloadsContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly NotificationsContentSetting = {
    ALLOW: "allow",
    ASK: "ask",
    BLOCK: "block",
  } as const;

  static readonly PluginsContentSetting = {
    BLOCK: "block",
  } as const;

  static readonly PopupsContentSetting = {
    ALLOW: "allow",
    BLOCK: "block",
  } as const;

  static readonly PpapiBrokerContentSetting = {
    BLOCK: "block",
  } as const;

  static readonly Scope = {
    INCOGNITO_SESSION_ONLY: "incognito_session_only",
    REGULAR: "regular",
  } as const;

}
