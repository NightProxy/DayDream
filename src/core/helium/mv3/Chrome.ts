import type { ExtensionContext } from '../extfs/types';
import {
  ChromeAction,
  ChromeAlarms,
  ChromeAudio,
  ChromeBookmarks,
  ChromeBrowsingData,
  ChromeCertificateProvider,
  ChromeClipboard,
  ChromeCommands,
  ChromeContentSettings,
  ChromeContextMenus,
  ChromeCookies,
  ChromeDebugger,
  ChromeDeclarativeContent,
  ChromeDeclarativeNetRequest,
  ChromeDesktopCapture,
  ChromeDns,
  ChromeDocumentScan,
  ChromeDom,
  ChromeDownloads,
  ChromeEnterprise,
  ChromeExtension,
  ChromeFileSystemProvider,
  ChromeFontSettings,
  ChromeGcm,
  ChromeHistory,
  ChromeI18n,
  ChromeIdentity,
  ChromeIdle,
  ChromeInput,
  ChromeInstanceID,
  ChromeManagement,
  ChromeMenus,
  ChromeNetworking,
  ChromeNotifications,
  ChromeOffscreen,
  ChromeOmnibox,
  ChromePageAction,
  ChromePageCapture,
  ChromePlatformKeys,
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
  ChromeVpnProvider,
  ChromeWallpaper,
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
  loadTimes(..._args: any[]): any {
    throw new Error('chrome.loadTimes is not implemented');
  }

  csi(..._args: any[]): any {
    throw new Error('chrome.csi is not implemented');
  }

  public readonly action: ChromeAction;
  public readonly alarms: ChromeAlarms;
  public readonly audio: ChromeAudio;
  public readonly bookmarks: ChromeBookmarks;
  public readonly browsingData: ChromeBrowsingData;
  public readonly certificateProvider: ChromeCertificateProvider;
  public readonly clipboard: ChromeClipboard;
  public readonly commands: ChromeCommands;
  public readonly contentSettings: ChromeContentSettings;
  public readonly contextMenus: ChromeContextMenus;
  public readonly cookies: ChromeCookies;
  public readonly debugger: ChromeDebugger;
  public readonly declarativeContent: ChromeDeclarativeContent;
  public readonly declarativeNetRequest: ChromeDeclarativeNetRequest;
  public readonly desktopCapture: ChromeDesktopCapture;
  public readonly dns: ChromeDns;
  public readonly documentScan: ChromeDocumentScan;
  public readonly dom: ChromeDom;
  public readonly downloads: ChromeDownloads;
  public readonly enterprise: ChromeEnterprise;
  public readonly extension: ChromeExtension;
  public readonly fileSystemProvider: ChromeFileSystemProvider;
  public readonly fontSettings: ChromeFontSettings;
  public readonly gcm: ChromeGcm;
  public readonly history: ChromeHistory;
  public readonly i18n: ChromeI18n;
  public readonly identity: ChromeIdentity;
  public readonly idle: ChromeIdle;
  public readonly input: ChromeInput;
  public readonly instanceID: ChromeInstanceID;
  public readonly management: ChromeManagement;
  public readonly menus: ChromeMenus;
  public readonly networking: ChromeNetworking;
  public readonly notifications: ChromeNotifications;
  public readonly offscreen: ChromeOffscreen;
  public readonly omnibox: ChromeOmnibox;
  public readonly pageAction: ChromePageAction;
  public readonly platformKeys: ChromePlatformKeys;
  public readonly pageCapture: ChromePageCapture;
  public readonly permissions: ChromePermissions;
  public readonly power: ChromePower;
  public readonly printerProvider: ChromePrinterProvider;
  public readonly privacy: ChromePrivacy;
  public readonly processes: ChromeProcesses;
  public readonly proxy: ChromeProxy;
  public readonly readingList: ChromeReadingList;
  public readonly runtime: ChromeRuntime;
  public readonly scripting: ChromeScripting;
  public readonly search: ChromeSearch;
  public readonly sessions: ChromeSessions;
  public readonly sidePanel: ChromeSidePanel;
  public readonly storage: ChromeStorage;
  public readonly system: ChromeSystem;
  public readonly tabCapture: ChromeTabCapture;
  public readonly tabGroups: ChromeTabGroups;
  public readonly tabs: ChromeTabs;
  public readonly topSites: ChromeTopSites;
  public readonly tts: ChromeTts;
  public readonly ttsEngine: ChromeTtsEngine;
  public readonly vpnProvider: ChromeVpnProvider;
  public readonly wallpaper: ChromeWallpaper;
  public readonly webAuthenticationProxy: ChromeWebAuthenticationProxy;
  public readonly webNavigation: ChromeWebNavigation;
  public readonly webRequest: ChromeWebRequest;
  public readonly windows: ChromeWindows;

  constructor(ctx: ExtensionContext) {
    this.action = new ChromeAction(ctx);
    this.alarms = new ChromeAlarms(ctx);
    this.audio = new ChromeAudio(ctx);
    this.bookmarks = new ChromeBookmarks(ctx);
    this.browsingData = new ChromeBrowsingData(ctx);
    this.certificateProvider = new ChromeCertificateProvider(ctx);
    this.clipboard = new ChromeClipboard(ctx);
    this.commands = new ChromeCommands(ctx);
    this.contentSettings = new ChromeContentSettings(ctx);
    this.contextMenus = new ChromeContextMenus(ctx);
    this.cookies = new ChromeCookies(ctx);
    this.debugger = new ChromeDebugger(ctx);
    this.declarativeContent = new ChromeDeclarativeContent(ctx);
    this.declarativeNetRequest = new ChromeDeclarativeNetRequest(ctx);
    this.desktopCapture = new ChromeDesktopCapture(ctx);
    this.dns = new ChromeDns(ctx);
    this.documentScan = new ChromeDocumentScan(ctx);
    this.dom = new ChromeDom(ctx);
    this.downloads = new ChromeDownloads(ctx);
    this.enterprise = new ChromeEnterprise(ctx);
    this.extension = new ChromeExtension(ctx);
    this.fileSystemProvider = new ChromeFileSystemProvider(ctx);
    this.fontSettings = new ChromeFontSettings(ctx);
    this.gcm = new ChromeGcm(ctx);
    this.history = new ChromeHistory(ctx);
    this.i18n = new ChromeI18n(ctx);
    this.identity = new ChromeIdentity(ctx);
    this.idle = new ChromeIdle(ctx);
    this.input = new ChromeInput(ctx);
    this.instanceID = new ChromeInstanceID(ctx);
    this.management = new ChromeManagement(ctx);
    this.menus = new ChromeMenus(ctx);
    this.networking = new ChromeNetworking(ctx);
    this.notifications = new ChromeNotifications(ctx);
    this.offscreen = new ChromeOffscreen(ctx);
    this.omnibox = new ChromeOmnibox(ctx);
    this.pageAction = new ChromePageAction(ctx);
    this.platformKeys = new ChromePlatformKeys(ctx);
    this.pageCapture = new ChromePageCapture(ctx);
    this.permissions = new ChromePermissions(ctx);
    this.power = new ChromePower(ctx);
    this.printerProvider = new ChromePrinterProvider(ctx);
    this.privacy = new ChromePrivacy(ctx);
    this.processes = new ChromeProcesses(ctx);
    this.proxy = new ChromeProxy(ctx);
    this.readingList = new ChromeReadingList(ctx);
    this.runtime = new ChromeRuntime(ctx);
    this.scripting = new ChromeScripting(ctx);
    this.search = new ChromeSearch(ctx);
    this.sessions = new ChromeSessions(ctx);
    this.sidePanel = new ChromeSidePanel(ctx);
    this.storage = new ChromeStorage(ctx);
    this.system = new ChromeSystem(ctx);
    this.tabCapture = new ChromeTabCapture(ctx);
    this.tabGroups = new ChromeTabGroups(ctx);
    this.tabs = new ChromeTabs(ctx);
    this.topSites = new ChromeTopSites(ctx);
    this.tts = new ChromeTts(ctx);
    this.ttsEngine = new ChromeTtsEngine(ctx);
    this.vpnProvider = new ChromeVpnProvider(ctx);
    this.wallpaper = new ChromeWallpaper(ctx);
    this.webAuthenticationProxy = new ChromeWebAuthenticationProxy(ctx);
    this.webNavigation = new ChromeWebNavigation(ctx);
    this.webRequest = new ChromeWebRequest(ctx);
    this.windows = new ChromeWindows(ctx);
  }
}
