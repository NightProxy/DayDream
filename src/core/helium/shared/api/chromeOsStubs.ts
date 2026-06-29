// src/core/helium/shared/api/chromeOsStubs.ts
//
// ChromeOS-only API stubs. Each class throws with a clear,
// detectable error message so extensions can `try { ... } catch (e) { ... }`
// and fall back to non-ChromeOS code paths instead of crashing with
// "Cannot read properties of undefined".
//
// We INTENTIONALLY do not implement these — they're system-level
// integrations that have no meaning in a browser-in-browser context
// (no real OS networking config, no kiosk wallpaper, no enterprise
// management plane, no smart-card reader, no IME stack, no audio
// hardware enumeration, no userland-mounted filesystem provider,
// no document scanner, no platform keystore).
//
// If a Chromebook-flavored DDX build ever wants any of these, the
// platform layer can override the relevant class by reassigning
// `chrome.X = new RealX(ctx)` after Chrome construction.

import type { ExtensionContext } from '../../extfs/types';
import { ChromeEvent } from '..';

/** Common throwing impl. Bound at class construction to keep `this.ctx` accessible. */
function notSupported(api: string): never {
  throw new Error(
    `chrome.${api} is a ChromeOS-only API not supported in DDX. ` +
      `Detect availability via try/catch or by checking the manifest's "platform" field.`,
  );
}

// ── chrome.vpnProvider ──────────────────────────────────────────────
export class ChromeVpnProvider {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  public readonly onPacketReceived: ChromeEvent = new ChromeEvent();
  public readonly onPlatformMessage: ChromeEvent = new ChromeEvent();
  public readonly onUIEvent: ChromeEvent = new ChromeEvent();
  public readonly onConfigRemoved: ChromeEvent = new ChromeEvent();
  public readonly onConfigCreated: ChromeEvent = new ChromeEvent();
  createConfig(..._args: any[]): any { return notSupported('vpnProvider.createConfig'); }
  destroyConfig(..._args: any[]): any { return notSupported('vpnProvider.destroyConfig'); }
  setParameters(..._args: any[]): any { return notSupported('vpnProvider.setParameters'); }
  sendPacket(..._args: any[]): any { return notSupported('vpnProvider.sendPacket'); }
  notifyConnectionStateChanged(..._args: any[]): any { return notSupported('vpnProvider.notifyConnectionStateChanged'); }
}

// ── chrome.wallpaper ────────────────────────────────────────────────
export class ChromeWallpaper {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  setWallpaper(..._args: any[]): any { return notSupported('wallpaper.setWallpaper'); }
}

// ── chrome.networking.onc ───────────────────────────────────────────
// The full surface lives under `chrome.networking.onc.*`; we expose
// a single `onc` namespace stub so feature-detection works.
class NetworkingOnc {
  public readonly onNetworksChanged: ChromeEvent = new ChromeEvent();
  public readonly onNetworkListChanged: ChromeEvent = new ChromeEvent();
  public readonly onDeviceStateListChanged: ChromeEvent = new ChromeEvent();
  public readonly onPortalDetectionCompleted: ChromeEvent = new ChromeEvent();
  public readonly onCertificateListsChanged: ChromeEvent = new ChromeEvent();
  getNetworks(..._args: any[]): any { return notSupported('networking.onc.getNetworks'); }
  getProperties(..._args: any[]): any { return notSupported('networking.onc.getProperties'); }
  getManagedProperties(..._args: any[]): any { return notSupported('networking.onc.getManagedProperties'); }
  getState(..._args: any[]): any { return notSupported('networking.onc.getState'); }
  getDeviceStates(..._args: any[]): any { return notSupported('networking.onc.getDeviceStates'); }
  getGlobalPolicy(..._args: any[]): any { return notSupported('networking.onc.getGlobalPolicy'); }
  getCertificateLists(..._args: any[]): any { return notSupported('networking.onc.getCertificateLists'); }
  enableNetworkType(..._args: any[]): any { return notSupported('networking.onc.enableNetworkType'); }
  disableNetworkType(..._args: any[]): any { return notSupported('networking.onc.disableNetworkType'); }
  requestNetworkScan(..._args: any[]): any { return notSupported('networking.onc.requestNetworkScan'); }
  setProperties(..._args: any[]): any { return notSupported('networking.onc.setProperties'); }
  createNetwork(..._args: any[]): any { return notSupported('networking.onc.createNetwork'); }
  forgetNetwork(..._args: any[]): any { return notSupported('networking.onc.forgetNetwork'); }
  startConnect(..._args: any[]): any { return notSupported('networking.onc.startConnect'); }
  startDisconnect(..._args: any[]): any { return notSupported('networking.onc.startDisconnect'); }
}

export class ChromeNetworking {
  protected readonly ctx: ExtensionContext;
  public readonly onc: NetworkingOnc;
  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.onc = new NetworkingOnc();
  }
}

// ── chrome.enterprise.* ─────────────────────────────────────────────
class EnterpriseDeviceAttributes {
  getDirectoryDeviceId(..._args: any[]): any { return notSupported('enterprise.deviceAttributes.getDirectoryDeviceId'); }
  getDeviceSerialNumber(..._args: any[]): any { return notSupported('enterprise.deviceAttributes.getDeviceSerialNumber'); }
  getDeviceAssetId(..._args: any[]): any { return notSupported('enterprise.deviceAttributes.getDeviceAssetId'); }
  getDeviceAnnotatedLocation(..._args: any[]): any { return notSupported('enterprise.deviceAttributes.getDeviceAnnotatedLocation'); }
  getDeviceHostname(..._args: any[]): any { return notSupported('enterprise.deviceAttributes.getDeviceHostname'); }
}

class EnterpriseHardwarePlatform {
  getHardwarePlatformInfo(..._args: any[]): any { return notSupported('enterprise.hardwarePlatform.getHardwarePlatformInfo'); }
}

class EnterpriseNetworkingAttributes {
  getNetworkDetails(..._args: any[]): any { return notSupported('enterprise.networkingAttributes.getNetworkDetails'); }
}

class EnterprisePlatformKeys {
  getTokens(..._args: any[]): any { return notSupported('enterprise.platformKeys.getTokens'); }
  getCertificates(..._args: any[]): any { return notSupported('enterprise.platformKeys.getCertificates'); }
  importCertificate(..._args: any[]): any { return notSupported('enterprise.platformKeys.importCertificate'); }
  removeCertificate(..._args: any[]): any { return notSupported('enterprise.platformKeys.removeCertificate'); }
  challengeMachineKey(..._args: any[]): any { return notSupported('enterprise.platformKeys.challengeMachineKey'); }
  challengeUserKey(..._args: any[]): any { return notSupported('enterprise.platformKeys.challengeUserKey'); }
}

export class ChromeEnterprise {
  protected readonly ctx: ExtensionContext;
  public readonly deviceAttributes: EnterpriseDeviceAttributes;
  public readonly hardwarePlatform: EnterpriseHardwarePlatform;
  public readonly networkingAttributes: EnterpriseNetworkingAttributes;
  public readonly platformKeys: EnterprisePlatformKeys;
  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.deviceAttributes = new EnterpriseDeviceAttributes();
    this.hardwarePlatform = new EnterpriseHardwarePlatform();
    this.networkingAttributes = new EnterpriseNetworkingAttributes();
    this.platformKeys = new EnterprisePlatformKeys();
  }
}

// ── chrome.certificateProvider ──────────────────────────────────────
export class ChromeCertificateProvider {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  public readonly onCertificatesUpdateRequested: ChromeEvent = new ChromeEvent();
  public readonly onSignatureRequested: ChromeEvent = new ChromeEvent();
  // Deprecated (pre-MV3) events kept for compat:
  public readonly onCertificatesRequested: ChromeEvent = new ChromeEvent();
  public readonly onSignDigestRequested: ChromeEvent = new ChromeEvent();
  setCertificates(..._args: any[]): any { return notSupported('certificateProvider.setCertificates'); }
  reportSignature(..._args: any[]): any { return notSupported('certificateProvider.reportSignature'); }
  requestPin(..._args: any[]): any { return notSupported('certificateProvider.requestPin'); }
  stopPinRequest(..._args: any[]): any { return notSupported('certificateProvider.stopPinRequest'); }
}

// ── chrome.input.ime ────────────────────────────────────────────────
class InputIme {
  public readonly onActivate: ChromeEvent = new ChromeEvent();
  public readonly onDeactivated: ChromeEvent = new ChromeEvent();
  public readonly onFocus: ChromeEvent = new ChromeEvent();
  public readonly onBlur: ChromeEvent = new ChromeEvent();
  public readonly onInputContextUpdate: ChromeEvent = new ChromeEvent();
  public readonly onKeyEvent: ChromeEvent = new ChromeEvent();
  public readonly onCandidateClicked: ChromeEvent = new ChromeEvent();
  public readonly onMenuItemActivated: ChromeEvent = new ChromeEvent();
  public readonly onSurroundingTextChanged: ChromeEvent = new ChromeEvent();
  public readonly onReset: ChromeEvent = new ChromeEvent();
  public readonly onAssistiveWindowButtonClicked: ChromeEvent = new ChromeEvent();
  setComposition(..._args: any[]): any { return notSupported('input.ime.setComposition'); }
  clearComposition(..._args: any[]): any { return notSupported('input.ime.clearComposition'); }
  commitText(..._args: any[]): any { return notSupported('input.ime.commitText'); }
  sendKeyEvents(..._args: any[]): any { return notSupported('input.ime.sendKeyEvents'); }
  hideInputView(..._args: any[]): any { return notSupported('input.ime.hideInputView'); }
  setCandidateWindowProperties(..._args: any[]): any { return notSupported('input.ime.setCandidateWindowProperties'); }
  setCandidates(..._args: any[]): any { return notSupported('input.ime.setCandidates'); }
  setCursorPosition(..._args: any[]): any { return notSupported('input.ime.setCursorPosition'); }
  setMenuItems(..._args: any[]): any { return notSupported('input.ime.setMenuItems'); }
  updateMenuItems(..._args: any[]): any { return notSupported('input.ime.updateMenuItems'); }
  deleteSurroundingText(..._args: any[]): any { return notSupported('input.ime.deleteSurroundingText'); }
  keyEventHandled(..._args: any[]): any { return notSupported('input.ime.keyEventHandled'); }
  setAssistiveWindowProperties(..._args: any[]): any { return notSupported('input.ime.setAssistiveWindowProperties'); }
  setAssistiveWindowButtonHighlighted(..._args: any[]): any { return notSupported('input.ime.setAssistiveWindowButtonHighlighted'); }
}

export class ChromeInput {
  protected readonly ctx: ExtensionContext;
  public readonly ime: InputIme;
  constructor(ctx: ExtensionContext) {
    this.ctx = ctx;
    this.ime = new InputIme();
  }
}

// ── chrome.audio ────────────────────────────────────────────────────
export class ChromeAudio {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  public readonly onLevelChanged: ChromeEvent = new ChromeEvent();
  public readonly onMuteChanged: ChromeEvent = new ChromeEvent();
  public readonly onDeviceListChanged: ChromeEvent = new ChromeEvent();
  getDevices(..._args: any[]): any { return notSupported('audio.getDevices'); }
  setActiveDevices(..._args: any[]): any { return notSupported('audio.setActiveDevices'); }
  setProperties(..._args: any[]): any { return notSupported('audio.setProperties'); }
  getMute(..._args: any[]): any { return notSupported('audio.getMute'); }
  setMute(..._args: any[]): any { return notSupported('audio.setMute'); }
}

// ── chrome.fileSystemProvider ───────────────────────────────────────
export class ChromeFileSystemProvider {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  public readonly onUnmountRequested: ChromeEvent = new ChromeEvent();
  public readonly onGetMetadataRequested: ChromeEvent = new ChromeEvent();
  public readonly onGetActionsRequested: ChromeEvent = new ChromeEvent();
  public readonly onReadDirectoryRequested: ChromeEvent = new ChromeEvent();
  public readonly onOpenFileRequested: ChromeEvent = new ChromeEvent();
  public readonly onCloseFileRequested: ChromeEvent = new ChromeEvent();
  public readonly onReadFileRequested: ChromeEvent = new ChromeEvent();
  public readonly onCreateDirectoryRequested: ChromeEvent = new ChromeEvent();
  public readonly onDeleteEntryRequested: ChromeEvent = new ChromeEvent();
  public readonly onCreateFileRequested: ChromeEvent = new ChromeEvent();
  public readonly onCopyEntryRequested: ChromeEvent = new ChromeEvent();
  public readonly onMoveEntryRequested: ChromeEvent = new ChromeEvent();
  public readonly onWriteFileRequested: ChromeEvent = new ChromeEvent();
  public readonly onTruncateRequested: ChromeEvent = new ChromeEvent();
  public readonly onAbortRequested: ChromeEvent = new ChromeEvent();
  public readonly onConfigureRequested: ChromeEvent = new ChromeEvent();
  public readonly onMountRequested: ChromeEvent = new ChromeEvent();
  public readonly onAddWatcherRequested: ChromeEvent = new ChromeEvent();
  public readonly onRemoveWatcherRequested: ChromeEvent = new ChromeEvent();
  public readonly onExecuteActionRequested: ChromeEvent = new ChromeEvent();
  mount(..._args: any[]): any { return notSupported('fileSystemProvider.mount'); }
  unmount(..._args: any[]): any { return notSupported('fileSystemProvider.unmount'); }
  getAll(..._args: any[]): any { return notSupported('fileSystemProvider.getAll'); }
  get(..._args: any[]): any { return notSupported('fileSystemProvider.get'); }
  notify(..._args: any[]): any { return notSupported('fileSystemProvider.notify'); }
}

// ── chrome.documentScan ─────────────────────────────────────────────
export class ChromeDocumentScan {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  scan(..._args: any[]): any { return notSupported('documentScan.scan'); }
  getScannerList(..._args: any[]): any { return notSupported('documentScan.getScannerList'); }
  openScanner(..._args: any[]): any { return notSupported('documentScan.openScanner'); }
  getOptionGroups(..._args: any[]): any { return notSupported('documentScan.getOptionGroups'); }
  setOptions(..._args: any[]): any { return notSupported('documentScan.setOptions'); }
  startScan(..._args: any[]): any { return notSupported('documentScan.startScan'); }
  readScanData(..._args: any[]): any { return notSupported('documentScan.readScanData'); }
  cancelScan(..._args: any[]): any { return notSupported('documentScan.cancelScan'); }
  closeScanner(..._args: any[]): any { return notSupported('documentScan.closeScanner'); }
}

// ── chrome.platformKeys ─────────────────────────────────────────────
export class ChromePlatformKeys {
  protected readonly ctx: ExtensionContext;
  constructor(ctx: ExtensionContext) { this.ctx = ctx; }
  selectClientCertificates(..._args: any[]): any { return notSupported('platformKeys.selectClientCertificates'); }
  getKeyPair(..._args: any[]): any { return notSupported('platformKeys.getKeyPair'); }
  getKeyPairBySpki(..._args: any[]): any { return notSupported('platformKeys.getKeyPairBySpki'); }
  // platformKeys.subtleCrypto returns a (would-be) SubtleCrypto-compatible
  // object; we expose a throwing one to avoid the "not a function" error.
  subtleCrypto(): { encrypt: () => never; decrypt: () => never; sign: () => never; verify: () => never } {
    const t = () => notSupported('platformKeys.subtleCrypto');
    return { encrypt: t, decrypt: t, sign: t, verify: t };
  }
  verifyTLSServerCertificate(..._args: any[]): any { return notSupported('platformKeys.verifyTLSServerCertificate'); }
}
