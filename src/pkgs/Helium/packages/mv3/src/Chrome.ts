import {
  ChromeAction,
  ChromeAlarms,
  ChromeBookmarks,
  ChromeBrowsingData,
  ChromeClipboard,
  ChromeContentSettings,
  ChromeContextMenus,
  ChromeCookies,
  ChromeDebugger,
  ChromeDeclarativeContent,
  ChromeDeclarativeNetRequest,
  ChromeDesktopCapture,
  ChromeDns,
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
  ChromeOffscreen,
  ChromePageCapture,
  ChromePermissions,
  ChromePower,
  ChromePrinterProvider,
  ChromePrivacy,
  ChromeProcesses,
  ChromeProxy,
  ChromeReadingList,
  ChromeRuntime,
  ChromeScripting,
  ChromeSearch,
  ChromeSessions,
  ChromeSidePanel,
  ChromeStorage,
  ChromeSystem,
  ChromeTabCapture,
  ChromeTabGroups,
  ChromeTabs,
  ChromeTopSites,
  ChromeTts,
  ChromeTtsEngine,
  ChromeWebAuthenticationProxy,
  ChromeWebNavigation,
  ChromeWebRequest,
  ChromeWindows,
} from './api';

/**
 * Root Chrome API class for Manifest 3.
 * Assembles all namespace classes into a single chrome object.
 */
export class Chrome {
  loadTimes(...args: any[]): any {
    throw new Error('chrome.loadTimes is not implemented');
  }

  csi(...args: any[]): any {
    throw new Error('chrome.csi is not implemented');
  }

  public readonly action: ChromeAction = new ChromeAction();
  public readonly alarms: ChromeAlarms = new ChromeAlarms();
  public readonly bookmarks: ChromeBookmarks = new ChromeBookmarks();
  public readonly browsingData: ChromeBrowsingData = new ChromeBrowsingData();
  public readonly clipboard: ChromeClipboard = new ChromeClipboard();
  public readonly contentSettings: ChromeContentSettings = new ChromeContentSettings();
  public readonly contextMenus: ChromeContextMenus = new ChromeContextMenus();
  public readonly cookies: ChromeCookies = new ChromeCookies();
  public readonly debugger: ChromeDebugger = new ChromeDebugger();
  public readonly declarativeContent: ChromeDeclarativeContent = new ChromeDeclarativeContent();
  public readonly declarativeNetRequest: ChromeDeclarativeNetRequest = new ChromeDeclarativeNetRequest();
  public readonly desktopCapture: ChromeDesktopCapture = new ChromeDesktopCapture();
  public readonly dns: ChromeDns = new ChromeDns();
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
  public readonly offscreen: ChromeOffscreen = new ChromeOffscreen();
  public readonly pageCapture: ChromePageCapture = new ChromePageCapture();
  public readonly permissions: ChromePermissions = new ChromePermissions();
  public readonly power: ChromePower = new ChromePower();
  public readonly printerProvider: ChromePrinterProvider = new ChromePrinterProvider();
  public readonly privacy: ChromePrivacy = new ChromePrivacy();
  public readonly processes: ChromeProcesses = new ChromeProcesses();
  public readonly proxy: ChromeProxy = new ChromeProxy();
  public readonly readingList: ChromeReadingList = new ChromeReadingList();
  public readonly runtime: ChromeRuntime = new ChromeRuntime();
  public readonly scripting: ChromeScripting = new ChromeScripting();
  public readonly search: ChromeSearch = new ChromeSearch();
  public readonly sessions: ChromeSessions = new ChromeSessions();
  public readonly sidePanel: ChromeSidePanel = new ChromeSidePanel();
  public readonly storage: ChromeStorage = new ChromeStorage();
  public readonly system: ChromeSystem = new ChromeSystem();
  public readonly tabCapture: ChromeTabCapture = new ChromeTabCapture();
  public readonly tabGroups: ChromeTabGroups = new ChromeTabGroups();
  public readonly tabs: ChromeTabs = new ChromeTabs();
  public readonly topSites: ChromeTopSites = new ChromeTopSites();
  public readonly tts: ChromeTts = new ChromeTts();
  public readonly ttsEngine: ChromeTtsEngine = new ChromeTtsEngine();
  public readonly webAuthenticationProxy: ChromeWebAuthenticationProxy = new ChromeWebAuthenticationProxy();
  public readonly webNavigation: ChromeWebNavigation = new ChromeWebNavigation();
  public readonly webRequest: ChromeWebRequest = new ChromeWebRequest();
  public readonly windows: ChromeWindows = new ChromeWindows();
}
