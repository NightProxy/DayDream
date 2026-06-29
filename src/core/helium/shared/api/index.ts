export { ChromeAlarms } from './alarms';
export { ChromeBookmarks } from './bookmarks';
export { ChromeBrowsingData } from './browsingData';
export { ChromeClipboard } from './clipboard';
export { ChromeCommands } from './commands';
export { ChromeContextMenus } from './contextMenus';
export { ChromeCookies } from './cookies';
export { ChromeMenus } from './menus';
export { ChromePageAction } from './pageAction';
// ChromeOS-only stubs — declared so chrome.X is non-undefined; all
// methods throw a clear "ChromeOS-only" error. See chromeOsStubs.ts
// for the rationale and full list.
export {
  ChromeAudio,
  ChromeCertificateProvider,
  ChromeDocumentScan,
  ChromeEnterprise,
  ChromeFileSystemProvider,
  ChromeInput,
  ChromeNetworking,
  ChromePlatformKeys,
  ChromeVpnProvider,
  ChromeWallpaper,
} from './chromeOsStubs';
export { ChromeDebugger } from './debugger';
export { ChromeDeclarativeContent } from './declarativeContent';
export { ChromeDesktopCapture } from './desktopCapture';
export { ChromeDevtools } from './devtools';
export { ChromeDom } from './dom';
export { ChromeFontSettings } from './fontSettings';
export { ChromeGcm } from './gcm';
export { ChromeHistory } from './history';
export { ChromeI18n } from './i18n';
export { ChromeIdle } from './idle';
export { ChromeInstanceID } from './instanceID';
export { ChromeNotifications } from './notifications';
export { ChromeOmnibox } from './omnibox';
export { ChromePageCapture } from './pageCapture';
export { ChromePower } from './power';
export { ChromePrinterProvider } from './printerProvider';
export { ChromePrivacy } from './privacy';
export { ChromeProxy } from './proxy';
export { ChromeSearch } from './search';
export { ChromeSessions } from './sessions';
export { ChromeTopSites } from './topSites';
export { ChromeTts } from './tts';
export { ChromeTtsEngine } from './ttsEngine';
export { ChromeWebNavigation } from './webNavigation';
export { ChromeWebRequest } from './webRequest';
export { ChromeWindows } from './windows';

// Base classes for the 11 divergent namespaces. These are produced by
// Tasks 3-7 of the shared-API refactor plan
// (docs/superpowers/plans/2026-06-24-helium-shared-api-refactor.md).
// Uncomment each export as the corresponding file lands.
//
export { ChromeStorageBase } from './storage';
export { ChromeTabsBase } from './tabs';
export { ChromeRuntimeBase } from './runtime';
export { ChromeContentSettingsBase } from './contentSettings';
export { ChromeDownloadsBase } from './downloads';
export { ChromeExtensionBase } from './extension';
export { ChromeIdentityBase } from './identity';
export { ChromeManagementBase } from './management';
export { ChromePermissionsBase } from './permissions';
export { ChromeSystemBase, ChromeSystemStorageBase } from './system';
export { ChromeTabCaptureBase } from './tabCapture';
