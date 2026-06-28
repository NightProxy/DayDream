import type { ExtensionContext } from '../extfs/types';
import {
  ChromeAlarms,
  ChromeApp,
  ChromeBookmarks,
  ChromeBrowserAction,
  ChromeBrowsingData,
  ChromeClipboard,
  ChromeCommands,
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
  ChromeOmnibox,
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
  loadTimes(..._args: any[]): any {
    throw new Error('chrome.loadTimes is not implemented');
  }

  csi(..._args: any[]): any {
    throw new Error('chrome.csi is not implemented');
  }

  public readonly alarms: ChromeAlarms;
  public readonly app: ChromeApp;
  public readonly bookmarks: ChromeBookmarks;
  public readonly browserAction: ChromeBrowserAction;
  public readonly browsingData: ChromeBrowsingData;
  public readonly clipboard: ChromeClipboard;
  public readonly commands: ChromeCommands;
  public readonly contentSettings: ChromeContentSettings;
  public readonly contextMenus: ChromeContextMenus;
  public readonly cookies: ChromeCookies;
  public readonly debugger: ChromeDebugger;
  public readonly declarativeContent: ChromeDeclarativeContent;
  public readonly desktopCapture: ChromeDesktopCapture;
  public readonly dom: ChromeDom;
  public readonly downloads: ChromeDownloads;
  public readonly extension: ChromeExtension;
  public readonly fontSettings: ChromeFontSettings;
  public readonly gcm: ChromeGcm;
  public readonly history: ChromeHistory;
  public readonly i18n: ChromeI18n;
  public readonly identity: ChromeIdentity;
  public readonly idle: ChromeIdle;
  public readonly instanceID: ChromeInstanceID;
  public readonly management: ChromeManagement;
  public readonly notifications: ChromeNotifications;
  public readonly omnibox: ChromeOmnibox;
  public readonly pageCapture: ChromePageCapture;
  public readonly permissions: ChromePermissions;
  public readonly power: ChromePower;
  public readonly printerProvider: ChromePrinterProvider;
  public readonly privacy: ChromePrivacy;
  public readonly proxy: ChromeProxy;
  public readonly runtime: ChromeRuntime;
  public readonly search: ChromeSearch;
  public readonly sessions: ChromeSessions;
  public readonly storage: ChromeStorage;
  public readonly system: ChromeSystem;
  public readonly tabCapture: ChromeTabCapture;
  public readonly tabs: ChromeTabs;
  public readonly topSites: ChromeTopSites;
  public readonly tts: ChromeTts;
  public readonly ttsEngine: ChromeTtsEngine;
  public readonly webNavigation: ChromeWebNavigation;
  public readonly webRequest: ChromeWebRequest;
  public readonly windows: ChromeWindows;

  constructor(ctx: ExtensionContext) {
    this.alarms = new ChromeAlarms(ctx);
    this.app = new ChromeApp(ctx);
    this.bookmarks = new ChromeBookmarks(ctx);
    this.browserAction = new ChromeBrowserAction(ctx);
    this.browsingData = new ChromeBrowsingData(ctx);
    this.clipboard = new ChromeClipboard(ctx);
    this.commands = new ChromeCommands(ctx);
    this.contentSettings = new ChromeContentSettings(ctx);
    this.contextMenus = new ChromeContextMenus(ctx);
    this.cookies = new ChromeCookies(ctx);
    this.debugger = new ChromeDebugger(ctx);
    this.declarativeContent = new ChromeDeclarativeContent(ctx);
    this.desktopCapture = new ChromeDesktopCapture(ctx);
    this.dom = new ChromeDom(ctx);
    this.downloads = new ChromeDownloads(ctx);
    this.extension = new ChromeExtension(ctx);
    this.fontSettings = new ChromeFontSettings(ctx);
    this.gcm = new ChromeGcm(ctx);
    this.history = new ChromeHistory(ctx);
    this.i18n = new ChromeI18n(ctx);
    this.identity = new ChromeIdentity(ctx);
    this.idle = new ChromeIdle(ctx);
    this.instanceID = new ChromeInstanceID(ctx);
    this.management = new ChromeManagement(ctx);
    this.notifications = new ChromeNotifications(ctx);
    this.omnibox = new ChromeOmnibox(ctx);
    this.pageCapture = new ChromePageCapture(ctx);
    this.permissions = new ChromePermissions(ctx);
    this.power = new ChromePower(ctx);
    this.printerProvider = new ChromePrinterProvider(ctx);
    this.privacy = new ChromePrivacy(ctx);
    this.proxy = new ChromeProxy(ctx);
    this.runtime = new ChromeRuntime(ctx);
    this.search = new ChromeSearch(ctx);
    this.sessions = new ChromeSessions(ctx);
    this.storage = new ChromeStorage(ctx);
    this.system = new ChromeSystem(ctx);
    this.tabCapture = new ChromeTabCapture(ctx);
    this.tabs = new ChromeTabs(ctx);
    this.topSites = new ChromeTopSites(ctx);
    this.tts = new ChromeTts(ctx);
    this.ttsEngine = new ChromeTtsEngine(ctx);
    this.webNavigation = new ChromeWebNavigation(ctx);
    this.webRequest = new ChromeWebRequest(ctx);
    this.windows = new ChromeWindows(ctx);
  }
}
