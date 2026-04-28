import {
  ChromeAlarms,
  ChromeApp,
  ChromeBookmarks,
  ChromeBrowserAction,
  ChromeBrowsingData,
  ChromeClipboard,
  ChromeContentSettings,
  ChromeContextMenus,
  ChromeCookies,
  ChromeDebugger,
  ChromeDeclarativeContent,
  ChromeDesktopCapture,
  ChromeDom,
  ChromeDownloads,
  ChromeExtension,
  ChromeFontSettings,
  ChromeGcm,
  ChromeHistory,
  ChromeI18n,
  ChromeIdentity,
  ChromeIdle,
  ChromeInstanceID,
  ChromeManagement,
  ChromeNotifications,
  ChromePageCapture,
  ChromePermissions,
  ChromePower,
  ChromePrinterProvider,
  ChromePrivacy,
  ChromeProxy,
  ChromeRuntime,
  ChromeSearch,
  ChromeSessions,
  ChromeStorage,
  ChromeSystem,
  ChromeTabCapture,
  ChromeTabs,
  ChromeTopSites,
  ChromeTts,
  ChromeTtsEngine,
  ChromeWebNavigation,
  ChromeWebRequest,
  ChromeWindows,
} from './api';

/**
 * Root Chrome API class for Manifest 2.
 * Assembles all namespace classes into a single chrome object.
 */
export class Chrome {
  loadTimes(...args: any[]): any {
    throw new Error('chrome.loadTimes is not implemented');
  }

  csi(...args: any[]): any {
    throw new Error('chrome.csi is not implemented');
  }

  public readonly alarms: ChromeAlarms = new ChromeAlarms();
  public readonly app: ChromeApp = new ChromeApp();
  public readonly bookmarks: ChromeBookmarks = new ChromeBookmarks();
  public readonly browserAction: ChromeBrowserAction = new ChromeBrowserAction();
  public readonly browsingData: ChromeBrowsingData = new ChromeBrowsingData();
  public readonly clipboard: ChromeClipboard = new ChromeClipboard();
  public readonly contentSettings: ChromeContentSettings = new ChromeContentSettings();
  public readonly contextMenus: ChromeContextMenus = new ChromeContextMenus();
  public readonly cookies: ChromeCookies = new ChromeCookies();
  public readonly debugger: ChromeDebugger = new ChromeDebugger();
  public readonly declarativeContent: ChromeDeclarativeContent = new ChromeDeclarativeContent();
  public readonly desktopCapture: ChromeDesktopCapture = new ChromeDesktopCapture();
  public readonly dom: ChromeDom = new ChromeDom();
  public readonly downloads: ChromeDownloads = new ChromeDownloads();
  public readonly extension: ChromeExtension = new ChromeExtension();
  public readonly fontSettings: ChromeFontSettings = new ChromeFontSettings();
  public readonly gcm: ChromeGcm = new ChromeGcm();
  public readonly history: ChromeHistory = new ChromeHistory();
  public readonly i18n: ChromeI18n = new ChromeI18n();
  public readonly identity: ChromeIdentity = new ChromeIdentity();
  public readonly idle: ChromeIdle = new ChromeIdle();
  public readonly instanceID: ChromeInstanceID = new ChromeInstanceID();
  public readonly management: ChromeManagement = new ChromeManagement();
  public readonly notifications: ChromeNotifications = new ChromeNotifications();
  public readonly pageCapture: ChromePageCapture = new ChromePageCapture();
  public readonly permissions: ChromePermissions = new ChromePermissions();
  public readonly power: ChromePower = new ChromePower();
  public readonly printerProvider: ChromePrinterProvider = new ChromePrinterProvider();
  public readonly privacy: ChromePrivacy = new ChromePrivacy();
  public readonly proxy: ChromeProxy = new ChromeProxy();
  public readonly runtime: ChromeRuntime = new ChromeRuntime();
  public readonly search: ChromeSearch = new ChromeSearch();
  public readonly sessions: ChromeSessions = new ChromeSessions();
  public readonly storage: ChromeStorage = new ChromeStorage();
  public readonly system: ChromeSystem = new ChromeSystem();
  public readonly tabCapture: ChromeTabCapture = new ChromeTabCapture();
  public readonly tabs: ChromeTabs = new ChromeTabs();
  public readonly topSites: ChromeTopSites = new ChromeTopSites();
  public readonly tts: ChromeTts = new ChromeTts();
  public readonly ttsEngine: ChromeTtsEngine = new ChromeTtsEngine();
  public readonly webNavigation: ChromeWebNavigation = new ChromeWebNavigation();
  public readonly webRequest: ChromeWebRequest = new ChromeWebRequest();
  public readonly windows: ChromeWindows = new ChromeWindows();
}
