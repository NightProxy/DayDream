/**
 * Helium extension iframe bootstrap.
 *
 * Runs as the first <script> in every extension iframe. Order:
 *   1. Read ExtensionContext from <meta name="helium-ctx">
 *   2. Construct chrome global from ChromeMV2 or ChromeMV3
 *   3. Install handshake listener for the MessageChannel port
 *   4. Monkey-patch async chrome.* methods to call host via the port
 *   5. Wire event router so host can fire chrome.*.dispatch(...)
 *
 * The extension's own scripts run AFTER this bundle. They see a
 * working chrome global: sync methods (runtime.id, runtime.getURL,
 * runtime.getManifest, extension.getURL) resolve from ctx; async
 * methods return Promises that resolve once the host port arrives.
 */

import { Chrome as ChromeMV2 } from '../mv2/Chrome';
import { Chrome as ChromeMV3 } from '../mv3/Chrome';
import { dispatchOnMessage, type OnMessageListener } from '../host/runtime/dispatch';
import { ChromeDevtools } from '../shared/api/devtools';
import { ExtensionBridgeChannel } from './channel';
import { parseCtxFromMeta } from './ctx-encode';
import { findOpaqueId, subscribeEvent, unsubscribeEvent } from './event-rpc';

/**
 * Path → host RPC method map. The chrome.* methods at each path get
 * monkey-patched to call the host method via the port.
 *
 * MUST stay in sync with HANDLER_PERMISSIONS in src/apis/extensions.ts.
 * The sanity script cross-checks both sides.
 */
const RPC_BINDINGS: Array<[string[], string]> = [
  [['storage', 'local', 'get'],            'chrome.storage.local.get'],
  [['storage', 'local', 'set'],            'chrome.storage.local.set'],
  [['storage', 'local', 'remove'],         'chrome.storage.local.remove'],
  [['storage', 'local', 'clear'],          'chrome.storage.local.clear'],
  [['storage', 'local', 'getBytesInUse'],  'chrome.storage.local.getBytesInUse'],
  [['storage', 'local', 'getKeys'],        'chrome.storage.local.getKeys'],
  [['storage', 'sync',  'get'],            'chrome.storage.sync.get'],
  [['storage', 'sync',  'set'],            'chrome.storage.sync.set'],
  [['storage', 'sync',  'remove'],         'chrome.storage.sync.remove'],
  [['storage', 'sync',  'clear'],          'chrome.storage.sync.clear'],
  [['storage', 'sync',  'getBytesInUse'],  'chrome.storage.sync.getBytesInUse'],
  [['storage', 'sync',  'getKeys'],        'chrome.storage.sync.getKeys'],
  [['storage', 'session', 'get'],          'chrome.storage.session.get'],
  [['storage', 'session', 'set'],          'chrome.storage.session.set'],
  [['storage', 'session', 'remove'],       'chrome.storage.session.remove'],
  [['storage', 'session', 'clear'],        'chrome.storage.session.clear'],
  [['storage', 'session', 'getBytesInUse'],'chrome.storage.session.getBytesInUse'],
  [['storage', 'session', 'getKeys'],      'chrome.storage.session.getKeys'],
  [['storage', 'managed', 'get'],          'chrome.storage.managed.get'],
  [['storage', 'managed', 'getBytesInUse'],'chrome.storage.managed.getBytesInUse'],

  [['runtime', 'sendMessage'],                  'chrome.runtime.sendMessage'],
  [['runtime', 'getBackgroundPage'],            'chrome.runtime.getBackgroundPage'],
  [['runtime', 'getPlatformInfo'],              'chrome.runtime.getPlatformInfo'],
  [['runtime', 'getPackageDirectoryEntry'],     'chrome.runtime.getPackageDirectoryEntry'],
  [['runtime', 'requestUpdateCheck'],           'chrome.runtime.requestUpdateCheck'],
  [['runtime', 'reload'],                       'chrome.runtime.reload'],
  [['runtime', 'setUninstallURL'],              'chrome.runtime.setUninstallURL'],
  [['runtime', 'openOptionsPage'],              'chrome.runtime.openOptionsPage'],
  [['runtime', 'connectNative'],                'chrome.runtime.connectNative'],
  [['runtime', 'sendNativeMessage'],            'chrome.runtime.sendNativeMessage'],

  // NOTE: chrome.extension.getURL is a SYNCHRONOUS method in Chrome's
  [['extension', 'getBackgroundPage'],          'chrome.extension.getBackgroundPage'],
  [['extension', 'getViews'],                   'chrome.extension.getViews'],
  [['extension', 'isAllowedIncognitoAccess'],   'chrome.extension.isAllowedIncognitoAccess'],
  [['extension', 'isAllowedFileSchemeAccess'],  'chrome.extension.isAllowedFileSchemeAccess'],

  [['scripting', 'executeScript'],                  'chrome.scripting.executeScript'],
  [['scripting', 'insertCSS'],                      'chrome.scripting.insertCSS'],
  [['scripting', 'removeCSS'],                      'chrome.scripting.removeCSS'],
  [['scripting', 'registerContentScripts'],         'chrome.scripting.registerContentScripts'],
  [['scripting', 'unregisterContentScripts'],       'chrome.scripting.unregisterContentScripts'],
  [['scripting', 'getRegisteredContentScripts'],    'chrome.scripting.getRegisteredContentScripts'],
  [['scripting', 'updateContentScripts'],           'chrome.scripting.updateContentScripts'],

  [['tabs', 'query'],             'chrome.tabs.query'],
  [['tabs', 'get'],               'chrome.tabs.get'],
  [['tabs', 'getCurrent'],        'chrome.tabs.getCurrent'],
  [['tabs', 'create'],            'chrome.tabs.create'],
  [['tabs', 'update'],            'chrome.tabs.update'],
  [['tabs', 'remove'],            'chrome.tabs.remove'],
  [['tabs', 'duplicate'],         'chrome.tabs.duplicate'],
  [['tabs', 'reload'],            'chrome.tabs.reload'],
  [['tabs', 'goBack'],            'chrome.tabs.goBack'],
  [['tabs', 'goForward'],         'chrome.tabs.goForward'],
  [['tabs', 'captureVisibleTab'], 'chrome.tabs.captureVisibleTab'],
  [['tabs', 'move'],              'chrome.tabs.move'],
  [['tabs', 'group'],             'chrome.tabs.group'],
  [['tabs', 'ungroup'],           'chrome.tabs.ungroup'],
  [['tabs', 'detectLanguage'],    'chrome.tabs.detectLanguage'],
  [['tabs', 'discard'],           'chrome.tabs.discard'],
  [['tabs', 'highlight'],         'chrome.tabs.highlight'],
  [['tabs', 'getZoom'],           'chrome.tabs.getZoom'],
  [['tabs', 'setZoom'],           'chrome.tabs.setZoom'],
  [['tabs', 'getZoomSettings'],   'chrome.tabs.getZoomSettings'],
  [['tabs', 'setZoomSettings'],   'chrome.tabs.setZoomSettings'],
  [['tabs', 'toggleReaderMode'],  'chrome.tabs.toggleReaderMode'],
  [['tabs', 'sendMessage'],       'chrome.tabs.sendMessage'],
  [['tabs', 'executeScript'],     'chrome.tabs.executeScript'],
  [['tabs', 'insertCSS'],         'chrome.tabs.insertCSS'],
  [['tabs', 'removeCSS'],         'chrome.tabs.removeCSS'],

  [['windows', 'get'],            'chrome.windows.get'],
  [['windows', 'getCurrent'],     'chrome.windows.getCurrent'],
  [['windows', 'getLastFocused'], 'chrome.windows.getLastFocused'],
  [['windows', 'getAll'],         'chrome.windows.getAll'],
  [['windows', 'create'],         'chrome.windows.create'],
  [['windows', 'update'],         'chrome.windows.update'],
  [['windows', 'remove'],         'chrome.windows.remove'],

  [['alarms', 'create'],   'chrome.alarms.create'],
  [['alarms', 'get'],      'chrome.alarms.get'],
  [['alarms', 'getAll'],   'chrome.alarms.getAll'],
  [['alarms', 'clear'],    'chrome.alarms.clear'],
  [['alarms', 'clearAll'], 'chrome.alarms.clearAll'],

  [['bookmarks', 'get'],         'chrome.bookmarks.get'],
  [['bookmarks', 'getChildren'], 'chrome.bookmarks.getChildren'],
  [['bookmarks', 'getRecent'],   'chrome.bookmarks.getRecent'],
  [['bookmarks', 'getTree'],     'chrome.bookmarks.getTree'],
  [['bookmarks', 'getSubTree'],  'chrome.bookmarks.getSubTree'],
  [['bookmarks', 'search'],      'chrome.bookmarks.search'],
  [['bookmarks', 'create'],      'chrome.bookmarks.create'],
  [['bookmarks', 'move'],        'chrome.bookmarks.move'],
  [['bookmarks', 'update'],      'chrome.bookmarks.update'],
  [['bookmarks', 'remove'],      'chrome.bookmarks.remove'],
  [['bookmarks', 'removeTree'],  'chrome.bookmarks.removeTree'],

  [['history', 'search'],      'chrome.history.search'],
  [['history', 'getVisits'],   'chrome.history.getVisits'],
  [['history', 'addUrl'],      'chrome.history.addUrl'],
  [['history', 'deleteUrl'],   'chrome.history.deleteUrl'],
  [['history', 'deleteRange'], 'chrome.history.deleteRange'],
  [['history', 'deleteAll'],   'chrome.history.deleteAll'],

  [['cookies', 'get'],                'chrome.cookies.get'],
  [['cookies', 'getAll'],             'chrome.cookies.getAll'],
  [['cookies', 'set'],                'chrome.cookies.set'],
  [['cookies', 'remove'],             'chrome.cookies.remove'],
  [['cookies', 'getAllCookieStores'], 'chrome.cookies.getAllCookieStores'],

  [['i18n', 'detectLanguage'], 'chrome.i18n.detectLanguage'],

  [['webNavigation', 'getFrame'],     'chrome.webNavigation.getFrame'],
  [['webNavigation', 'getAllFrames'], 'chrome.webNavigation.getAllFrames'],

  [['action', 'setTitle'],                  'chrome.action.setTitle'],
  [['action', 'getTitle'],                  'chrome.action.getTitle'],
  [['action', 'setPopup'],                  'chrome.action.setPopup'],
  [['action', 'getPopup'],                  'chrome.action.getPopup'],
  [['action', 'setBadgeText'],              'chrome.action.setBadgeText'],
  [['action', 'getBadgeText'],              'chrome.action.getBadgeText'],
  [['action', 'setBadgeBackgroundColor'],   'chrome.action.setBadgeBackgroundColor'],
  [['action', 'getBadgeBackgroundColor'],   'chrome.action.getBadgeBackgroundColor'],
  [['action', 'setBadgeTextColor'],         'chrome.action.setBadgeTextColor'],
  [['action', 'getBadgeTextColor'],         'chrome.action.getBadgeTextColor'],
  [['action', 'setIcon'],                   'chrome.action.setIcon'],
  [['action', 'enable'],                    'chrome.action.enable'],
  [['action', 'disable'],                   'chrome.action.disable'],
  [['action', 'isEnabled'],                 'chrome.action.isEnabled'],
  [['action', 'openPopup'],                 'chrome.action.openPopup'],
  [['action', 'getUserSettings'],           'chrome.action.getUserSettings'],
  [['browserAction', 'setTitle'],                'chrome.browserAction.setTitle'],
  [['browserAction', 'getTitle'],                'chrome.browserAction.getTitle'],
  [['browserAction', 'setPopup'],                'chrome.browserAction.setPopup'],
  [['browserAction', 'getPopup'],                'chrome.browserAction.getPopup'],
  [['browserAction', 'setBadgeText'],            'chrome.browserAction.setBadgeText'],
  [['browserAction', 'getBadgeText'],            'chrome.browserAction.getBadgeText'],
  [['browserAction', 'setBadgeBackgroundColor'], 'chrome.browserAction.setBadgeBackgroundColor'],
  [['browserAction', 'getBadgeBackgroundColor'], 'chrome.browserAction.getBadgeBackgroundColor'],
  [['browserAction', 'setBadgeTextColor'],       'chrome.browserAction.setBadgeTextColor'],
  [['browserAction', 'getBadgeTextColor'],       'chrome.browserAction.getBadgeTextColor'],
  [['browserAction', 'setIcon'],                 'chrome.browserAction.setIcon'],
  [['browserAction', 'enable'],                  'chrome.browserAction.enable'],
  [['browserAction', 'disable'],                 'chrome.browserAction.disable'],
  [['browserAction', 'isEnabled'],               'chrome.browserAction.isEnabled'],
  [['browserAction', 'openPopup'],               'chrome.browserAction.openPopup'],
  [['browserAction', 'getUserSettings'],         'chrome.browserAction.getUserSettings'],
  [['pageAction', 'show'],     'chrome.pageAction.show'],
  [['pageAction', 'hide'],     'chrome.pageAction.hide'],
  [['pageAction', 'setTitle'], 'chrome.pageAction.setTitle'],
  [['pageAction', 'getTitle'], 'chrome.pageAction.getTitle'],
  [['pageAction', 'setPopup'], 'chrome.pageAction.setPopup'],
  [['pageAction', 'getPopup'], 'chrome.pageAction.getPopup'],
  [['pageAction', 'setIcon'],  'chrome.pageAction.setIcon'],

  [['commands', 'getAll'], 'chrome.commands.getAll'],

  [['notifications', 'create'],             'chrome.notifications.create'],
  [['notifications', 'update'],             'chrome.notifications.update'],
  [['notifications', 'clear'],              'chrome.notifications.clear'],
  [['notifications', 'getAll'],             'chrome.notifications.getAll'],
  [['notifications', 'getPermissionLevel'], 'chrome.notifications.getPermissionLevel'],

  [['contextMenus', 'create'],     'chrome.contextMenus.create'],
  [['contextMenus', 'update'],     'chrome.contextMenus.update'],
  [['contextMenus', 'remove'],     'chrome.contextMenus.remove'],
  [['contextMenus', 'removeAll'],  'chrome.contextMenus.removeAll'],
  [['menus', 'create'],     'chrome.menus.create'],
  [['menus', 'update'],     'chrome.menus.update'],
  [['menus', 'remove'],     'chrome.menus.remove'],
  [['menus', 'removeAll'],  'chrome.menus.removeAll'],

  [['omnibox', 'setDefaultSuggestion'], 'chrome.omnibox.setDefaultSuggestion'],

  [['webRequest', 'handlerBehaviorChanged'], 'chrome.webRequest.handlerBehaviorChanged'],

  [['declarativeNetRequest', 'updateDynamicRules'],         'chrome.declarativeNetRequest.updateDynamicRules'],
  [['declarativeNetRequest', 'getDynamicRules'],            'chrome.declarativeNetRequest.getDynamicRules'],
  [['declarativeNetRequest', 'updateSessionRules'],         'chrome.declarativeNetRequest.updateSessionRules'],
  [['declarativeNetRequest', 'getSessionRules'],            'chrome.declarativeNetRequest.getSessionRules'],
  [['declarativeNetRequest', 'updateEnabledRulesets'],      'chrome.declarativeNetRequest.updateEnabledRulesets'],
  [['declarativeNetRequest', 'getEnabledRulesets'],         'chrome.declarativeNetRequest.getEnabledRulesets'],
  [['declarativeNetRequest', 'getAvailableStaticRules'],    'chrome.declarativeNetRequest.getAvailableStaticRules'],
  [['declarativeNetRequest', 'getAvailableStaticRuleCount'],'chrome.declarativeNetRequest.getAvailableStaticRuleCount'],
  [['declarativeNetRequest', 'getDisabledRuleIds'],         'chrome.declarativeNetRequest.getDisabledRuleIds'],
  [['declarativeNetRequest', 'updateStaticRules'],          'chrome.declarativeNetRequest.updateStaticRules'],
  [['declarativeNetRequest', 'setExtensionActionOptions'],  'chrome.declarativeNetRequest.setExtensionActionOptions'],
  [['declarativeNetRequest', 'getMatchedRules'],            'chrome.declarativeNetRequest.getMatchedRules'],
  [['declarativeNetRequest', 'isRegexSupported'],           'chrome.declarativeNetRequest.isRegexSupported'],
  [['declarativeNetRequest', 'testMatchOutcome'],           'chrome.declarativeNetRequest.testMatchOutcome'],

  [['devtools', 'panels', 'create'],                                 'chrome.devtools.panels.create'],
  [['devtools', 'panels', 'elements', 'createSidebarPane'],          'chrome.devtools.panels.elements.createSidebarPane'],
  [['devtools', 'panels', 'sources', 'createSidebarPane'],           'chrome.devtools.panels.sources.createSidebarPane'],
  [['devtools', 'panels', 'setOpenResourceHandler'],                 'chrome.devtools.panels.setOpenResourceHandler'],
  [['devtools', 'inspectedWindow', 'eval'],                          'chrome.devtools.inspectedWindow.eval'],
  [['devtools', 'inspectedWindow', 'reload'],                        'chrome.devtools.inspectedWindow.reload'],
  [['devtools', 'inspectedWindow', 'getResources'],                  'chrome.devtools.inspectedWindow.getResources'],
  [['devtools', 'network', 'getHAR'],                                'chrome.devtools.network.getHAR'],

  [['permissions', 'getAll'],   'chrome.permissions.getAll'],
  [['permissions', 'contains'], 'chrome.permissions.contains'],
  [['permissions', 'request'],  'chrome.permissions.request'],
  [['permissions', 'remove'],   'chrome.permissions.remove'],

  [['sidePanel', 'setOptions'],       'chrome.sidePanel.setOptions'],
  [['sidePanel', 'getOptions'],       'chrome.sidePanel.getOptions'],
  [['sidePanel', 'setPanelBehavior'], 'chrome.sidePanel.setPanelBehavior'],
  [['sidePanel', 'getPanelBehavior'], 'chrome.sidePanel.getPanelBehavior'],
  [['sidePanel', 'open'],             'chrome.sidePanel.open'],

  [['downloads', 'download'],           'chrome.downloads.download'],
  [['downloads', 'search'],             'chrome.downloads.search'],
  [['downloads', 'pause'],              'chrome.downloads.pause'],
  [['downloads', 'resume'],             'chrome.downloads.resume'],
  [['downloads', 'cancel'],             'chrome.downloads.cancel'],
  [['downloads', 'remove'],             'chrome.downloads.remove'],
  [['downloads', 'erase'],              'chrome.downloads.erase'],
  [['downloads', 'open'],               'chrome.downloads.open'],
  [['downloads', 'show'],               'chrome.downloads.show'],
  [['downloads', 'showDefaultFolder'],  'chrome.downloads.showDefaultFolder'],
  [['downloads', 'acceptDanger'],       'chrome.downloads.acceptDanger'],
  [['downloads', 'setShelfEnabled'],    'chrome.downloads.setShelfEnabled'],

  [['identity', 'getAuthToken'],             'chrome.identity.getAuthToken'],
  [['identity', 'getProfileUserInfo'],       'chrome.identity.getProfileUserInfo'],
  [['identity', 'launchWebAuthFlow'],        'chrome.identity.launchWebAuthFlow'],
  [['identity', 'removeCachedAuthToken'],    'chrome.identity.removeCachedAuthToken'],
  [['identity', 'clearAllCachedAuthTokens'], 'chrome.identity.clearAllCachedAuthTokens'],
  [['identity', 'getAccounts'],              'chrome.identity.getAccounts'],
  [['identity', 'getRedirectURL'],           'chrome.identity.getRedirectURL'],

  [['management', 'getAll'],                          'chrome.management.getAll'],
  [['management', 'get'],                             'chrome.management.get'],
  [['management', 'getSelf'],                         'chrome.management.getSelf'],
  [['management', 'setEnabled'],                      'chrome.management.setEnabled'],
  [['management', 'uninstall'],                       'chrome.management.uninstall'],
  [['management', 'uninstallSelf'],                   'chrome.management.uninstallSelf'],
  [['management', 'getPermissionWarningsById'],       'chrome.management.getPermissionWarningsById'],
  [['management', 'getPermissionWarningsByManifest'], 'chrome.management.getPermissionWarningsByManifest'],
  [['management', 'launchApp'],                       'chrome.management.launchApp'],
  [['management', 'createAppShortcut'],               'chrome.management.createAppShortcut'],
  [['management', 'setLaunchType'],                   'chrome.management.setLaunchType'],
  [['management', 'generateAppForLink'],              'chrome.management.generateAppForLink'],

  [['idle', 'queryState'],            'chrome.idle.queryState'],
  [['idle', 'setDetectionInterval'],  'chrome.idle.setDetectionInterval'],

  [['runtime', 'getContexts'],        'chrome.runtime.getContexts'],

  [['offscreen', 'createDocument'],  'chrome.offscreen.createDocument'],
  [['offscreen', 'closeDocument'],   'chrome.offscreen.closeDocument'],
  [['offscreen', 'hasDocument'],     'chrome.offscreen.hasDocument'],

  [['search', 'query'],              'chrome.search.query'],

  [['sessions', 'getDevices'],          'chrome.sessions.getDevices'],
  [['sessions', 'getRecentlyClosed'],   'chrome.sessions.getRecentlyClosed'],
  [['sessions', 'restore'],             'chrome.sessions.restore'],

  [['topSites', 'get'],                 'chrome.topSites.get'],

  [['browsingData', 'remove'],            'chrome.browsingData.remove'],
  [['browsingData', 'removeAppcache'],    'chrome.browsingData.removeAppcache'],
  [['browsingData', 'removeCache'],       'chrome.browsingData.removeCache'],
  [['browsingData', 'removeCacheStorage'],'chrome.browsingData.removeCacheStorage'],
  [['browsingData', 'removeCookies'],     'chrome.browsingData.removeCookies'],
  [['browsingData', 'removeDownloads'],   'chrome.browsingData.removeDownloads'],
  [['browsingData', 'removeFileSystems'], 'chrome.browsingData.removeFileSystems'],
  [['browsingData', 'removeFormData'],    'chrome.browsingData.removeFormData'],
  [['browsingData', 'removeHistory'],     'chrome.browsingData.removeHistory'],
  [['browsingData', 'removeIndexedDB'],   'chrome.browsingData.removeIndexedDB'],
  [['browsingData', 'removeLocalStorage'],'chrome.browsingData.removeLocalStorage'],
  [['browsingData', 'removePasswords'],   'chrome.browsingData.removePasswords'],
  [['browsingData', 'removePluginData'],  'chrome.browsingData.removePluginData'],
  [['browsingData', 'removeServiceWorkers'],'chrome.browsingData.removeServiceWorkers'],
  [['browsingData', 'removeWebSQL'],      'chrome.browsingData.removeWebSQL'],
  [['browsingData', 'settings'],          'chrome.browsingData.settings'],

  [['tabGroups', 'get'],    'chrome.tabGroups.get'],
  [['tabGroups', 'move'],   'chrome.tabGroups.move'],
  [['tabGroups', 'query'],  'chrome.tabGroups.query'],
  [['tabGroups', 'update'], 'chrome.tabGroups.update'],

  [['readingList', 'addEntry'],    'chrome.readingList.addEntry'],
  [['readingList', 'query'],       'chrome.readingList.query'],
  [['readingList', 'removeEntry'], 'chrome.readingList.removeEntry'],
  [['readingList', 'updateEntry'], 'chrome.readingList.updateEntry'],

  [['dns', 'resolve'], 'chrome.dns.resolve'],

  [['debugger', 'attach'],      'chrome.debugger.attach'],
  [['debugger', 'detach'],      'chrome.debugger.detach'],
  [['debugger', 'sendCommand'], 'chrome.debugger.sendCommand'],
  [['debugger', 'getTargets'],  'chrome.debugger.getTargets'],

  [['declarativeContent', 'onPageChanged', 'addRules'],    'chrome.declarativeContent.addRules'],
  [['declarativeContent', 'onPageChanged', 'removeRules'], 'chrome.declarativeContent.removeRules'],
  [['declarativeContent', 'onPageChanged', 'getRules'],    'chrome.declarativeContent.getRules'],
];

/**
 * Bind every function-valued property on `chrome` (and its nested
 * namespaces) to its owning object, so extensions that destructure —
 * `const { getURL } = chrome.runtime; getURL('foo')`, or pass a
 * method reference like `something(chrome.tabs.query)` — don't hit
 * `TypeError: Cannot read properties of undefined (reading 'ctx')`
 * when `this` gets lost.
 *
 * Real Chrome's `chrome.*` methods are bindable this way (its API is
 * exposed as plain objects with function-valued properties, not
 * class instances). Our namespace classes make `this` matter, so we
 * bind post-construction to close the gap. Called ONCE right after
 * `new ChromeClass(ctx)`.
 *
 * Walks own+inherited props (getting past ES6 class methods, which
 * live on the prototype), recurses into object-valued props up to
 * `MAX_DEPTH` levels (covers `chrome.storage.local.get`,
 * `chrome.action.onClicked.addListener`, and
 * `chrome.declarativeContent.onPageChanged.addRules` — the deepest
 * paths we ship). Idempotent: skips functions already tagged with
 * `__heliumBound__`.
 */
function bindAllChromeMethods(root: unknown): void {
  const MAX_DEPTH = 3;
  const seen = new WeakSet<object>();
  const bindOne = (obj: any, depth: number): void => {
    if (obj === null || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);

    // Walk both own and prototype-chain properties. Instance methods
    // on ES6 classes live on the prototype; own descriptors cover
    // fields assigned in the constructor (e.g. `public readonly
    // onClicked = new ChromeEvent()`).
    for (let proto: any = obj; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        let desc: PropertyDescriptor | undefined;
        try {
          desc = Object.getOwnPropertyDescriptor(proto, key);
        } catch { continue; }
        // Accessor properties: leave them alone. Reading them may
        // throw or have side effects, and their getter/setter
        // functions are usually intentional.
        if (!desc || desc.get || desc.set) continue;

        let val: unknown;
        try { val = (obj as any)[key]; } catch { continue; }

        if (typeof val === 'function') {
          const fn = val as { __heliumBound__?: boolean };
          if (fn.__heliumBound__ === true) continue;
          try {
            const bound = (val as (...a: unknown[]) => unknown).bind(obj) as unknown as ((...a: unknown[]) => unknown) & { __heliumBound__: boolean };
            bound.__heliumBound__ = true;
            // Prefer defining on the owning object so lookups short-
            // circuit before hitting the prototype's unbound copy.
            Object.defineProperty(obj, key, {
              value: bound,
              writable: true,
              configurable: true,
              enumerable: desc.enumerable ?? false,
            });
          } catch { /* frozen / non-configurable — skip */ }
        } else if (typeof val === 'object' && val !== null && depth < MAX_DEPTH) {
          bindOne(val, depth + 1);
        }
      }
    }
  };
  try { bindOne(root, 0); } catch (err) {
    console.warn('[helium/bootstrap] bindAllChromeMethods failed:', err);
  }
}

(function main() {
  const meta = document.querySelector('meta[name="helium-ctx"]') as
    | HTMLMetaElement
    | null;
  if (!meta) {
    console.error(
      '[helium/bootstrap] missing <meta name="helium-ctx"> — extension cannot boot',
    );
    return;
  }

  let ctx;
  try {
    ctx = parseCtxFromMeta(meta.content);
  } catch (err) {
    console.error('[helium/bootstrap] failed to parse helium-ctx:', err);
    return;
  }

  const ChromeClass = ctx.manifestVersion === 2 ? ChromeMV2 : ChromeMV3;
  const chrome = new ChromeClass(ctx);
  if (ctx.inDevtools === true) {
    (chrome as any).devtools = new ChromeDevtools(ctx);
  }
  bindAllChromeMethods(chrome);
  (globalThis as any).chrome = chrome;

  let resolveChannel!: (ch: ExtensionBridgeChannel) => void;
  const channelReady = new Promise<ExtensionBridgeChannel>((r) => {
    resolveChannel = r;
  });

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => {
    resolveReady = r;
  });

  installRpcBindings(chrome, channelReady, ready);

  let consumed = false;
  const completeHandshake = (port: MessagePort): void => {
    if (consumed) return;
    consumed = true;
    window.removeEventListener('message', handshakeListener);
    const channel = new ExtensionBridgeChannel(port);
    resolveChannel(channel);
    installRuntimeOnMessageHandler(chrome, channel);
    installRuntimeConnect(chrome, channel);
    installEventRouter(chrome, channel);
    installWebRequestEventBindings(chrome, channel);
    resolveReady();
  };

  const handshakeListener = (e: MessageEvent) => {
    const data = e.data as
      | { type?: string; extId?: string }
      | null
      | undefined;
    if (data?.type !== '__helium_handshake__') return;
    if (data.extId !== ctx.id) return;
    const port = e.ports[0];
    if (!port) {
      console.error('[helium/bootstrap] handshake message had no port');
      return;
    }
    completeHandshake(port);
  };
  window.addEventListener('message', handshakeListener);

  try {
    Object.defineProperty(window, '__helium_handshake_receive__', {
      value: (port: MessagePort): void => {
        if (!port) {
          console.error('[helium/bootstrap] handshake call had no port');
          return;
        }
        completeHandshake(port);
      },
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } catch (err) {
    console.warn(
      '[helium/bootstrap] could not install __helium_handshake_receive__:',
      err,
    );
  }

  // Popup / options auto-size signal.
  //
  // Chrome sizes extension popups to the popup document's own
  // content, up to 800×600. We can't measure the popup DOM from the
  // host frame (Scramjet serves it under a rewritten origin, so
  // `iframe.contentDocument` reads throw SecurityError), so we
  // measure here inside the extension realm and postMessage the
  // dimensions upward. `popupHost.ts` listens for these messages,
  // filters by `iframe.contentWindow` identity, and resizes the
  // wrapper.
  //
  // We only install this in nested contexts (window.top !== window)
  // — the background iframe is nested too but is 0×0 and hidden, so
  // its size messages are silently dropped by popupHost's iframe
  // filter. Cheaper than plumbing an `inPopup` flag through
  // ExtensionContext and covers options_ui iframes for free.
  try {
    if (typeof window !== 'undefined' && window.top !== window && typeof ResizeObserver === 'function') {
      let lastW = -1;
      let lastH = -1;
      const post = (): void => {
        const el = document.documentElement;
        if (!el) return;
        const w = el.scrollWidth || el.clientWidth || 0;
        const h = el.scrollHeight || el.clientHeight || 0;
        if (w === lastW && h === lastH) return;
        lastW = w;
        lastH = h;
        try {
          window.parent.postMessage({ __helium_popup_size__: true, w, h }, '*');
        } catch { /* cross-realm postMessage rejected — nothing to do */ }
      };
      const install = (): void => {
        const el = document.documentElement;
        if (!el) return;
        try {
          const ro = new ResizeObserver(() => { post(); });
          ro.observe(el);
          if (document.body) ro.observe(document.body);
        } catch (err) {
          console.warn('[helium/bootstrap] popup ResizeObserver install failed:', err);
        }
        // Fire once immediately so the host doesn't sit at
        // POPUP_MIN_HEIGHT until the first layout-triggering
        // mutation.
        post();
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
      } else {
        install();
      }
    }
  } catch (err) {
    console.warn('[helium/bootstrap] popup size channel setup failed:', err);
  }
})();

/**
 * Walk RPC_BINDINGS and replace each method's "not implemented" stub
 * with one that calls the host via the channel.
 *
 * Critically: `channelReady` is a PROMISE for the channel, not the
 * channel itself. This lets us install the overlay BEFORE the
 * handshake completes — pre-handshake calls await channelReady and
 * resolve when the handshake finishes. Otherwise extensions that
 * call `chrome.X.Y(...)` at top-level of their BG script (before
 * the host has wired the MessagePort) would hit the throwing stub.
 */
function installRpcBindings(
  chrome: any,
  channelReady: Promise<ExtensionBridgeChannel>,
  ready: Promise<void>,
): void {
  for (const [path, rpcMethod] of RPC_BINDINGS) {
    const parent = resolvePath(chrome, path.slice(0, -1));
    const last = path[path.length - 1];
    if (!parent || !last) {
      continue;
    }
    const impl = async (args: unknown[]): Promise<unknown> => {
      const channel = await channelReady;
      await ready;
      try {
        const r = await channel.request(rpcMethod, { args });
        (chrome.runtime as any).lastError = null;
        return r;
      } catch (err) {
        const e = err as Error;
        (chrome.runtime as any).lastError = { message: e.message };
        if (e.name === 'ChromePermissionError') return undefined;
        throw err;
      }
    };
    parent[last] = (...args: unknown[]) => {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'function') {
        const cb = lastArg as (r?: unknown) => void;
        const rest = args.slice(0, -1);
        impl(rest).then(
          (r) => { try { cb(r); } catch (e) { console.error(e); } },
          (e) => {
            try { cb(undefined); } catch (er) { console.error(er); }
            console.warn(`[helium/bootstrap] ${rpcMethod}:`, e);
          },
        );
        return undefined;
      }
      return impl(args);
    };
  }
}

/**
 * Register an inbound handler for `chrome.runtime.onMessage` requests
 * from the host (used when peer extensions, the host, or content scripts
 * call sendMessage targeted at this extension).
 *
 * Wired through `registerEventHandler` (not `registerHandler`) because
 * the host's `dispatchRuntimeMessage` / `runtime.sendMessage` paths use
 * `channel.requestEvent(...)` — which lets us keep request/event id
 * spaces logically separate from regular RPC method calls.
 *
 * The actual sendResponse contract (sync return value, `return true`
 * for async, single-winner semantics, 30s default async timeout) is
 * implemented by `dispatchOnMessage` (host/runtime/dispatch.ts), which
 * is reused here so the bootstrap and the host-side relay agree on
 * behaviour.
 */
/**
 * Replace `chrome.runtime.connect` (and `chrome.tabs.connect`) with
 * real port implementations that request a host-allocated portId
 * via RPC, then send port-msg / port-close events through the
 * channel.
 *
 * Wire flow (BG-initiated → CS):
 *   1. BG: `chrome.tabs.connect(tabId, {name})`
 *   2. → request `__helium_bg_connect_tab__` with {tabId, name}
 *   3. ← host returns {portId} after registering the port
 *   4. BG wraps in BgInitiatedPort; subsequent port.postMessage
 *      sends `chrome.runtime.port-msg-bg-to-cs` events; CS receives
 *      via the existing port-msg relay.
 *
 * Same shape for runtime.connect: `__helium_bg_connect_runtime__`
 * with {targetExtId?, name}.
 *
 * If the host doesn't yet implement these RPCs, the returned port's
 * onMessage / onDisconnect fire normally (it's still a valid Port
 * object) but no real traffic flows. Extensions degrade gracefully.
 */
/**
 * Retry parameters for `makePort` connect RPCs.
 *
 * Common race: an auxiliary view (popup, options, dashboard) opens
 * and its uBlock-style client immediately calls `chrome.runtime.
 * connect(...)`, but the target BG isn't yet in the host's `spawned`
 * map — its own iframe is still handshaking. The host's
 * `bgInitiatedConnectRuntime` returns portId=-1 in that window, and
 * without retries we'd fire `onDisconnect` on the client-side port,
 * causing uBlock's `disconnectListener` to run `vAPI.shutdown.exec()`
 * (nested-iframe branch). Every pending `messaging.send(...)` then
 * resolves with `undefined`, and `cachePopupData(undefined)` leaves
 * `popupData = {}` so the first `safePunycodeToUnicode(pageDomain)`
 * crashes on `.split(undefined)` inside punycode.
 *
 * Delays are ~100 / 200 / 400 / 800ms — covers the observed spawn
 * window for uBlock on a cold DDX start. Total wait ~1.5s worst case.
 */
const CONNECT_RETRY_DELAYS_MS = [100, 200, 400, 800];

function installRuntimeConnect(
  chrome: any,
  channel: ExtensionBridgeChannel,
): void {
  const makePort = (
    portIdFactory: () => Promise<number>,
    name: string,
    label: string,
  ): unknown => {
    const onMessage = makeBgEvent();
    const onDisconnect = makeBgEvent();
    let disconnected = false;
    let resolvedPortId: number | null = null;
    const queuedSends: unknown[] = [];

    void (async () => {
      // Retry loop: portId=-1 usually means the target BG hasn't
      // finished spawning yet. Each attempt re-issues the RPC so the
      // host revisits `getSpawned(targetExtId)`.
      let portId = -1;
      let lastErr: unknown = null;
      const attempts = 1 + CONNECT_RETRY_DELAYS_MS.length;
      for (let i = 0; i < attempts; i++) {
        try {
          portId = await portIdFactory();
        } catch (err) {
          lastErr = err;
          portId = -1;
        }
        if (typeof portId === 'number' && portId >= 0) break;
        if (i < CONNECT_RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAYS_MS[i]!));
        }
      }

      if (typeof portId !== 'number' || portId < 0) {
        // Final failure. DO NOT fire onDisconnect here — uBlock and
        // similar clients react by calling `vAPI.shutdown.exec()`
        // (see `platform/common/vapi-client.js:disconnectListener`)
        // which resolves all pending `messaging.send(...)` promises
        // with undefined, and that undefined propagates into
        // `cachePopupData` → empty popupData → downstream crashes.
        //
        // Instead: leave the port in the "resolving" state so
        // `postMessage(...)` calls quietly queue and their reply
        // Promises stay pending. That's a worse UX (the popup shows
        // a loading state) than a real error, but it's contained —
        // no cascading `undefined` values reach page code.
        console.warn(
          '[helium/runtime.connect]',
          label,
          'connect failed after retries; port left in pending state to avoid crashing the client. lastErr=',
          lastErr,
        );
        return;
      }

      resolvedPortId = portId;
      bgPorts.set(portId, {
        portId, name, sender: { id: chrome.runtime.id },
        channel,
        disconnected: false,
        _receiveMessage(msg: unknown) {
          if (disconnected) return;
          onMessage._dispatch([msg]);
        },
        _hostClosed() {
          if (disconnected) return;
          disconnected = true;
          onDisconnect._dispatch([]);
        },
        postMessage() { /* never called externally */ },
        disconnect() { /* never called externally */ },
        onMessage,
        onDisconnect,
      } as unknown as BgPort);
      for (const msg of queuedSends) {
        channel.sendEvent('chrome.runtime.port-msg-bg-to-cs', [{ portId, message: msg }]);
      }
      queuedSends.length = 0;
    })();

    return {
      name,
      sender: undefined,
      onMessage,
      onDisconnect,
      postMessage(msg: unknown) {
        if (disconnected) return;
        if (resolvedPortId == null) {
          queuedSends.push(msg);
          return;
        }
        channel.sendEvent('chrome.runtime.port-msg-bg-to-cs', [{
          portId: resolvedPortId, message: msg,
        }]);
      },
      disconnect() {
        if (disconnected) return;
        disconnected = true;
        if (resolvedPortId != null) {
          channel.sendEvent('chrome.runtime.port-close-bg-initiated', [{
            portId: resolvedPortId,
          }]);
          bgPorts.delete(resolvedPortId);
        }
        onDisconnect._dispatch([]);
      },
    };
  };

  chrome.runtime.connect = (...args: unknown[]): unknown => {
    let extId: string | undefined;
    let connectInfo: { name?: string; includeTlsChannelId?: boolean } | undefined;
    if (typeof args[0] === 'string') {
      extId = args[0];
      connectInfo = args[1] as typeof connectInfo;
    } else {
      connectInfo = args[0] as typeof connectInfo;
    }
    const name = connectInfo?.name ?? '';
    const targetExtId = extId ?? chrome.runtime.id;
    const factory = async (): Promise<number> => {
      const r = await channel.request('__helium_bg_connect_runtime__', {
        args: [{ targetExtId, name }],
      });
      return (r as { portId?: number })?.portId ?? -1;
    };
    return makePort(factory, name, `runtime.connect(${targetExtId}, "${name}")`);
  };

  if (chrome.tabs) {
    chrome.tabs.connect = (...args: unknown[]): unknown => {
      const tabId = typeof args[0] === 'number' ? args[0] : -1;
      const connectInfo = args[1] as { name?: string; frameId?: number } | undefined;
      const name = connectInfo?.name ?? '';
      const factory = async (): Promise<number> => {
        const r = await channel.request('__helium_bg_connect_tab__', {
          args: [{ tabId, name, frameId: connectInfo?.frameId }],
        });
        return (r as { portId?: number })?.portId ?? -1;
      };
      return makePort(factory, name, `tabs.connect(${tabId}, "${name}")`);
    };
  }
}

function installRuntimeOnMessageHandler(
  chrome: any,
  channel: ExtensionBridgeChannel,
): void {
  const dispatch = (eventName: 'onMessage' | 'onMessageExternal') =>
    async (args: unknown[]) => {
      const [message, sender] = args as [unknown, unknown];
      const event = chrome.runtime?.[eventName];
      if (!event) return undefined;
      const listeners = collectOnMessageListeners(event);
      const result = await dispatchOnMessage(listeners, message, sender);
      return result.response;
    };
  channel.registerEventHandler('chrome.runtime.onMessage', dispatch('onMessage'));
  channel.registerEventHandler('chrome.runtime.onMessageExternal', dispatch('onMessageExternal'));
}

/**
 * Pull the listener set out of a ChromeEvent so dispatchOnMessage can
 * iterate it. ChromeEvent exposes a `_listenersForDispatch()` escape
 * hatch (see shared/ChromeEvent.ts) for exactly this case — we use
 * it when available, otherwise fall back to a compound listener that
 * wraps dispatchSync.
 */
function collectOnMessageListeners(event: any): Iterable<OnMessageListener> {
  if (typeof event._listenersForDispatch === 'function') {
    return event._listenersForDispatch() as Iterable<OnMessageListener>;
  }
  if (typeof event.dispatchSync === 'function') {
    const compound: OnMessageListener = (msg, sender, sendResponse) => {
      const results = event.dispatchSync(msg, sender, sendResponse) as unknown[];
      return results.some((r) => r === true);
    };
    return [compound];
  }
  return [];
}

/**
 * BG-side Port. Constructed when the host posts a
 * chrome.runtime.onConnect-port event; fires the BG's
 * chrome.runtime.onConnect listeners with this object.
 */
class BgPort {
  public readonly name: string;
  public readonly sender: { id: string };
  public readonly onMessage = makeBgEvent();
  public readonly onDisconnect = makeBgEvent();
  public disconnected = false;
  private channel: ExtensionBridgeChannel;
  public readonly portId: number;

  constructor(
    channel: ExtensionBridgeChannel,
    portId: number,
    name: string,
    sender: { id: string },
  ) {
    this.channel = channel;
    this.portId = portId;
    this.name = name;
    this.sender = sender;
  }

  postMessage(msg: unknown): void {
    if (this.disconnected) return;
    this.channel.sendEvent('chrome.runtime.port-msg-bg-to-cs', [{
      portId: this.portId, message: msg,
    }]);
  }

  disconnect(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.channel.sendEvent('chrome.runtime.port-close-bg-initiated', [{
      portId: this.portId,
    }]);
    this.onDisconnect._dispatch([]);
  }

  _receiveMessage(msg: unknown): void {
    if (this.disconnected) return;
    this.onMessage._dispatch([msg]);
  }

  _hostClosed(): void {
    if (this.disconnected) return;
    this.disconnected = true;
    this.onDisconnect._dispatch([]);
  }
}

interface BgEvent {
  addListener: (fn: (...args: unknown[]) => unknown) => void;
  removeListener: (fn: (...args: unknown[]) => unknown) => void;
  _dispatch: (args: unknown[]) => void;
}

function makeBgEvent(): BgEvent {
  const listeners = new Set<(...args: unknown[]) => unknown>();
  return {
    addListener: (fn) => { listeners.add(fn); },
    removeListener: (fn) => { listeners.delete(fn); },
    _dispatch: (args) => {
      for (const fn of listeners) {
        try { fn(...args); } catch (e) { console.error(e); }
      }
    },
  };
}

const bgPorts = new Map<number, BgPort>();

/**
 * Route inbound events from host (e.g. chrome.storage.onChanged) to
 * the matching ChromeEvent instance on the chrome global.
 *
 * Port lifecycle methods (chrome.runtime.onConnect-port,
 * chrome.runtime.port-msg, chrome.runtime.port-close) are handled
 * here first, then other events fall through to the path-resolve
 * dispatch.
 */
function installEventRouter(
  chrome: any,
  channel: ExtensionBridgeChannel,
): void {
  channel.setEventHandler((method, args) => {
    if (method === 'chrome.runtime.onConnect-port') {
      const info = args[0] as { portId: number; name: string; sender: { id: string } };
      const port = new BgPort(channel, info.portId, info.name, info.sender);
      bgPorts.set(info.portId, port);
      const ev = (chrome as any).runtime?.onConnect;
      if (ev && typeof ev.dispatch === 'function') ev.dispatch(port);
      return;
    }
    if (method === 'chrome.runtime.port-msg') {
      const info = args[0] as { portId: number; message: unknown };
      const port = bgPorts.get(info.portId);
      if (port) port._receiveMessage(info.message);
      return;
    }
    if (method === 'chrome.runtime.port-close') {
      const info = args[0] as { portId: number };
      const port = bgPorts.get(info.portId);
      if (port) {
        port._hostClosed();
        bgPorts.delete(info.portId);
      }
      return;
    }

    const parts = method.split('.');
    if (parts.length < 2 || parts[0] !== 'chrome') {
      console.warn('[helium/bootstrap] unsupported event method:', method);
      return;
    }
    const target = resolvePath(chrome, parts.slice(1));
    if (target && typeof (target as any).dispatch === 'function') {
      if (method === 'chrome.omnibox.onInputChanged') {
        const suggest = (suggestions: unknown) => {
          try {
            channel.sendEvent('chrome.omnibox.suggestions-out', [suggestions]);
          } catch (err) {
            console.warn('[helium/bootstrap] omnibox suggest send failed:', err);
          }
        };
        (target as any).dispatch(...args, suggest);
        return;
      }
      (target as any).dispatch(...args);
    } else {
      console.warn('[helium/bootstrap] event target not dispatchable:', method);
    }
  });
}

function resolvePath(root: any, path: string[]): any {
  let cur = root;
  for (const segment of path) {
    if (cur == null) return null;
    cur = cur[segment];
  }
  return cur;
}

/**
 * Rewrite chrome.webRequest.<event>.addListener / removeListener so
 * each subscription is mirrored on the host registry via the Event
 * Subscription RPC (Task 27). The local ChromeEvent's listener set
 * is kept in sync via subscribeEvent/unsubscribeEvent which store
 * an opaqueId per fn.
 *
 * webRequest events accept a non-standard signature:
 *   addListener(fn, filter, extraInfoSpec?)
 * We capture all three and forward to the host so it can apply
 * filters / honour 'blocking' / 'requestHeaders' etc.
 */
const WEB_REQUEST_EVENTS = [
  'onBeforeRequest',
  'onBeforeSendHeaders',
  'onSendHeaders',
  'onHeadersReceived',
  'onAuthRequired',
  'onResponseStarted',
  'onBeforeRedirect',
  'onCompleted',
  'onErrorOccurred',
] as const;

function installWebRequestEventBindings(
  chrome: any,
  channel: ExtensionBridgeChannel,
): void {
  const wr = chrome?.webRequest;
  if (!wr) return;
  for (const name of WEB_REQUEST_EVENTS) {
    const ev = wr[name];
    if (!ev) continue;
    const method = `chrome.webRequest.${name}`;
    const origAdd = ev.addListener?.bind(ev);
    const origRemove = ev.removeListener?.bind(ev);
    ev.addListener = (
      fn: (...args: unknown[]) => unknown,
      filter?: unknown,
      extraInfoSpec?: unknown,
    ) => {
      try {
        if (typeof origAdd === 'function') origAdd(fn);
      } catch (err) {
        console.warn(
          `[helium/bootstrap] local addListener for ${method} threw:`,
          err,
        );
      }
      subscribeEvent(method, channel, fn, filter, extraInfoSpec);
    };
    ev.removeListener = (fn: (...args: unknown[]) => unknown) => {
      try {
        if (typeof origRemove === 'function') origRemove(fn);
      } catch (err) {
        console.warn(
          `[helium/bootstrap] local removeListener for ${method} threw:`,
          err,
        );
      }
      const opaqueId = findOpaqueId(method, fn);
      if (opaqueId !== null) unsubscribeEvent(method, channel, opaqueId);
    };
  }
}
