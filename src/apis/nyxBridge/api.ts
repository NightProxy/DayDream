// src/apis/nyxBridge/api.ts
//
// THE ddx.* CONTRACT. Edit this file to add/remove/rename methods.
// Both the host handler implementations and the injected client runtime
// derive from these types. If a method is declared here, the host MUST
// implement it. If a namespace is declared here, the client runtime
// auto-exposes it.

// ── Shared types ────────────────────────────────────────────────────

export type TabId = number;

export interface TabTarget {
	tabId: TabId;
	frameId?: number;
}

export interface ElementHandle {
	__handle: string;
	tabId: TabId;
}

export interface TabInfo {
	id: TabId;
	index: number;
	active: boolean;
	url?: string;
	title?: string;
	favIconUrl?: string;
	status?: 'loading' | 'complete' | 'unloaded';
	pinned: boolean;
	highlighted: boolean;
	discarded: boolean;
	windowId: number;
	groupId: number;
	openerTabId?: number;
	incognito: boolean;
}

export interface PageSnapshot {
	url: string;
	title: string;
	text: string;
	elements: SnapshotElement[];
}

export interface SnapshotElement {
	selector: string;
	role: string;
	type?: string;
	text?: string;
	attrs: Record<string, string>;
	visible: boolean;
}

export interface Cookie {
	name: string;
	value: string;
	domain: string;
	path: string;
	secure: boolean;
	httpOnly: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	expirationDate?: number;
}

export type ErrorCode =
	| 'element_not_found'
	| 'tab_not_found'
	| 'frame_not_found'
	| 'timeout'
	| 'nav_aborted'
	| 'permission_denied'
	| 'handshake_required'
	| 'session_expired'
	| 'cdp_error'
	| 'invalid_argument'
	| 'not_supported';

export interface DDXErrorShape {
	name: 'DDXError';
	code: ErrorCode;
	message: string;
}

// Forward-compat event shape (Helium / chrome.* style).
// In v1 the dispatch path is a no-op; events are declared so that
// future push-event support and a future chrome.* polyfill can attach
// directly without changing the surface.
export interface ChromeEventLike<F extends (...args: any[]) => void> {
	addListener(cb: F): void;
	removeListener(cb: F): void;
	hasListener(cb: F): boolean;
	hasListeners(): boolean;
}

// Supporting types referenced from the namespaces below. These mirror
// their Chrome counterparts (see src/core/helium/mv3/api/*
// for the full Chrome shapes — we keep only the fields v1 actually uses).

export interface RegisteredContentScript {
	id: string;
	matches: string[];
	js?: string[];
	css?: string[];
	runAt?: 'document_start' | 'document_end' | 'document_idle';
	world?: 'ISOLATED' | 'MAIN';
}

export interface FrameDetails {
	frameId: number;
	parentFrameId: number;
	url: string;
	errorOccurred?: boolean;
}

export interface NavDetails {
	tabId: TabId;
	url: string;
	frameId: number;
	timeStamp: number;
}

export interface NavErrorDetails extends NavDetails {
	error: string;
}

export interface WindowInfo {
	id: number;
	focused: boolean;
	state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
	type?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
	tabs?: TabInfo[];
}

export interface WindowCreateProps {
	url?: string | string[];
	tabId?: TabId;
	focused?: boolean;
	type?: 'normal' | 'popup' | 'panel';
}

export interface WindowUpdateProps {
	focused?: boolean;
	state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen';
}

export interface BookmarkTreeNode {
	id: string;
	parentId?: string;
	index?: number;
	url?: string;
	title: string;
	dateAdded?: number;
	children?: BookmarkTreeNode[];
}

export interface HistoryItem {
	id: string;
	url?: string;
	title?: string;
	lastVisitTime?: number;
	visitCount?: number;
	typedCount?: number;
}

export interface VisitItem {
	id: string;
	visitId: string;
	visitTime?: number;
	referringVisitId: string;
	transition: string;
}

export interface TargetInfo {
	targetId: string;
	type: 'page' | 'iframe';
	title: string;
	url: string;
	attached: boolean;
	tabId?: TabId;
}

export interface UserProfile {
	id: string;
	name?: string;
	email?: string;
}

// ── Namespaces ──────────────────────────────────────────────────────

export interface DDXTabs {
	query(q: { active?: boolean; url?: string | string[]; title?: string }): Promise<TabInfo[]>;
	get(tabId: TabId): Promise<TabInfo>;
	getCurrent(): Promise<TabInfo | undefined>;
	create(p: { url?: string; active?: boolean; index?: number }): Promise<TabInfo>;
	update(tabId: TabId, p: { url?: string; active?: boolean; muted?: boolean }): Promise<TabInfo>;
	remove(tabIds: TabId | TabId[]): Promise<void>;
	duplicate(tabId: TabId): Promise<TabInfo>;
	reload(tabId?: TabId, opts?: { bypassCache?: boolean }): Promise<void>;
	goBack(tabId?: TabId): Promise<void>;
	goForward(tabId?: TabId): Promise<void>;
	captureVisibleTab(windowId?: number, opts?: { format?: 'png' | 'jpeg'; quality?: number }): Promise<string>;
	sendMessage(tabId: TabId, message: unknown, opts?: { frameId?: number }): Promise<unknown>;

	readonly TAB_ID_NONE: -1;
	readonly TAB_INDEX_NONE: -1;

	readonly onCreated: ChromeEventLike<(tab: TabInfo) => void>;
	readonly onUpdated: ChromeEventLike<(tabId: TabId, changeInfo: Partial<TabInfo>, tab: TabInfo) => void>;
	readonly onActivated: ChromeEventLike<(info: { tabId: TabId; windowId: number }) => void>;
	readonly onRemoved: ChromeEventLike<(tabId: TabId, info: { isWindowClosing: boolean; windowId: number }) => void>;
	readonly onMoved: ChromeEventLike<(tabId: TabId, info: { fromIndex: number; toIndex: number; windowId: number }) => void>;
}

export interface DDXScripting {
	executeScript(inj: {
		target: { tabId: TabId; frameIds?: number[]; allFrames?: boolean };
		func?: (...args: unknown[]) => unknown;
		files?: string[];
		args?: unknown[];
		world?: 'ISOLATED' | 'MAIN';
		injectImmediately?: boolean;
	}): Promise<Array<{ result?: unknown; error?: unknown; frameId: number; documentId: string }>>;
	insertCSS(inj: { target: { tabId: TabId; frameIds?: number[]; allFrames?: boolean }; css?: string; files?: string[]; origin?: 'AUTHOR' | 'USER' }): Promise<void>;
	removeCSS(inj: { target: { tabId: TabId; frameIds?: number[]; allFrames?: boolean }; css?: string; files?: string[]; origin?: 'AUTHOR' | 'USER' }): Promise<void>;
	registerContentScripts(scripts: RegisteredContentScript[]): Promise<void>;
	unregisterContentScripts(filter?: { ids?: string[] }): Promise<void>;
	getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<RegisteredContentScript[]>;
	updateContentScripts(scripts: RegisteredContentScript[]): Promise<void>;
}

export interface DDXDom {
	readPage(target: TabTarget, opts?: { interactiveOnly?: boolean; includeText?: boolean; maxElements?: number }): Promise<PageSnapshot>;
	querySelector(target: TabTarget, selector: string): Promise<ElementHandle | null>;
	querySelectorAll(target: TabTarget, selector: string): Promise<ElementHandle[]>;
	getText(target: TabTarget, ref: string | ElementHandle): Promise<string>;
	getAttribute(target: TabTarget, ref: string | ElementHandle, name: string): Promise<string | null>;
	getValue(target: TabTarget, ref: string | ElementHandle): Promise<string>;
	getOuterHTML(target: TabTarget, ref: string | ElementHandle): Promise<string>;
	getInnerHTML(target: TabTarget, ref: string | ElementHandle): Promise<string>;
	boundingBox(target: TabTarget, ref: string | ElementHandle): Promise<{ x: number; y: number; width: number; height: number } | null>;
	isVisible(target: TabTarget, ref: string | ElementHandle): Promise<boolean>;
	openOrClosedShadowRoot(target: TabTarget, ref: string | ElementHandle): Promise<ElementHandle | null>;

	click(target: TabTarget, ref: string | ElementHandle, opts?: { button?: 'left' | 'right' | 'middle'; clickCount?: number; modifiers?: string[]; position?: { x: number; y: number } }): Promise<void>;
	dblclick(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	hover(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	type(target: TabTarget, ref: string | ElementHandle, text: string, opts?: { delay?: number; clear?: boolean }): Promise<void>;
	press(target: TabTarget, ref: string | ElementHandle, key: string, opts?: { modifiers?: string[] }): Promise<void>;
	select(target: TabTarget, ref: string | ElementHandle, value: string | string[]): Promise<void>;
	check(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	uncheck(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	focus(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	blur(target: TabTarget, ref: string | ElementHandle): Promise<void>;
	scroll(target: TabTarget, ref: string | ElementHandle, opts?: { x?: number; y?: number; intoView?: boolean }): Promise<void>;
	dragAndDrop(target: TabTarget, source: string | ElementHandle, dest: string | ElementHandle): Promise<void>;
	uploadFile(target: TabTarget, ref: string | ElementHandle, files: Array<{ name: string; mimeType: string; data: string }>): Promise<void>;
}

export interface DDXInput {
	keyboard: {
		down(target: TabTarget, key: string, opts?: { modifiers?: string[] }): Promise<void>;
		up(target: TabTarget, key: string): Promise<void>;
		press(target: TabTarget, key: string, opts?: { modifiers?: string[] }): Promise<void>;
		type(target: TabTarget, text: string, opts?: { delay?: number }): Promise<void>;
	};
	mouse: {
		move(target: TabTarget, x: number, y: number, opts?: { steps?: number }): Promise<void>;
		down(target: TabTarget, opts?: { button?: 'left' | 'right' | 'middle' }): Promise<void>;
		up(target: TabTarget, opts?: { button?: 'left' | 'right' | 'middle' }): Promise<void>;
		click(target: TabTarget, x: number, y: number, opts?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<void>;
		wheel(target: TabTarget, deltaX: number, deltaY: number): Promise<void>;
	};
}

export interface DDXWebNavigation {
	getFrame(d: { tabId: TabId; frameId: number }): Promise<FrameDetails>;
	getAllFrames(d: { tabId: TabId }): Promise<FrameDetails[]>;
	waitForLoad(target: TabTarget, opts?: { timeout?: number; state?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<{ url: string }>;
	waitForNavigation(target: TabTarget, opts?: { timeout?: number; urlPattern?: string }): Promise<{ url: string; status: number }>;
	waitForSelector(target: TabTarget, selector: string, opts?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' | 'detached' }): Promise<ElementHandle>;
	waitForFunction(target: TabTarget, fnSource: string, args?: unknown[], opts?: { timeout?: number; polling?: number | 'raf' }): Promise<unknown>;

	readonly onBeforeNavigate: ChromeEventLike<(d: NavDetails) => void>;
	readonly onCommitted: ChromeEventLike<(d: NavDetails) => void>;
	readonly onDOMContentLoaded: ChromeEventLike<(d: NavDetails) => void>;
	readonly onCompleted: ChromeEventLike<(d: NavDetails) => void>;
	readonly onErrorOccurred: ChromeEventLike<(d: NavErrorDetails) => void>;
	readonly onHistoryStateUpdated: ChromeEventLike<(d: NavDetails) => void>;
}

export interface DDXCookies {
	get(d: { url: string; name: string }): Promise<Cookie | null>;
	getAll(d: { url?: string; domain?: string; name?: string; path?: string; secure?: boolean; session?: boolean }): Promise<Cookie[]>;
	set(d: { url: string; name?: string; value?: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; expirationDate?: number }): Promise<Cookie | null>;
	remove(d: { url: string; name: string }): Promise<{ url: string; name: string } | null>;
	getAllCookieStores(): Promise<Array<{ id: string; tabIds: TabId[] }>>;
	readonly onChanged: ChromeEventLike<(info: { cookie: Cookie; cause: string; removed: boolean }) => void>;
}

// PageStorageArea targets the PAGE's web storage (not extension storage).
// Naming mirrors chrome.storage so the future polyfill is structurally close.
export interface PageStorageArea {
	get(target: TabTarget, keys?: string | string[] | null): Promise<Record<string, unknown>>;
	set(target: TabTarget, items: Record<string, unknown>): Promise<void>;
	remove(target: TabTarget, keys: string | string[]): Promise<void>;
	clear(target: TabTarget): Promise<void>;
	getKeys(target: TabTarget): Promise<string[]>;
}

export interface DDXStorage {
	local: PageStorageArea;
	session: PageStorageArea;
}

export interface DDXHistory {
	search(q: { text: string; startTime?: number; endTime?: number; maxResults?: number }): Promise<HistoryItem[]>;
	addUrl(d: { url: string; title?: string; visitTime?: number }): Promise<void>;
	deleteUrl(d: { url: string }): Promise<void>;
	deleteRange(r: { startTime: number; endTime: number }): Promise<void>;
	deleteAll(): Promise<void>;
	getVisits(d: { url: string }): Promise<VisitItem[]>;
	readonly onVisited: ChromeEventLike<(item: HistoryItem) => void>;
	readonly onVisitRemoved: ChromeEventLike<(removed: { allHistory: boolean; urls?: string[] }) => void>;
}

export interface DDXBookmarks {
	get(idOrIds: string | string[]): Promise<BookmarkTreeNode[]>;
	getChildren(id: string): Promise<BookmarkTreeNode[]>;
	getRecent(n: number): Promise<BookmarkTreeNode[]>;
	getTree(): Promise<BookmarkTreeNode[]>;
	getSubTree(id: string): Promise<BookmarkTreeNode[]>;
	search(q: string | { query?: string; url?: string; title?: string }): Promise<BookmarkTreeNode[]>;
	create(b: { parentId?: string; index?: number; title?: string; url?: string }): Promise<BookmarkTreeNode>;
	move(id: string, dest: { parentId?: string; index?: number }): Promise<BookmarkTreeNode>;
	update(id: string, changes: { title?: string; url?: string }): Promise<BookmarkTreeNode>;
	remove(id: string): Promise<void>;
	removeTree(id: string): Promise<void>;
}

export interface DDXWindows {
	getCurrent(opts?: { populate?: boolean }): Promise<WindowInfo>;
	getLastFocused(opts?: { populate?: boolean }): Promise<WindowInfo>;
	getAll(opts?: { populate?: boolean }): Promise<WindowInfo[]>;
	get(windowId: number, opts?: { populate?: boolean }): Promise<WindowInfo>;
	create(p: WindowCreateProps): Promise<WindowInfo>;
	remove(windowId: number): Promise<void>;
	update(windowId: number, p: WindowUpdateProps): Promise<WindowInfo>;
	readonly WINDOW_ID_NONE: -1;
	readonly WINDOW_ID_CURRENT: -2;
}

export interface DDXDebugger {
	attach(target: { tabId: TabId }, requiredVersion: string): Promise<void>;
	detach(target: { tabId: TabId }): Promise<void>;
	sendCommand(target: { tabId: TabId }, method: string, commandParams?: object): Promise<object>;
	getTargets(): Promise<TargetInfo[]>;
	readonly onEvent: ChromeEventLike<(source: { tabId?: TabId }, method: string, params?: object) => void>;
	readonly onDetach: ChromeEventLike<(source: { tabId?: TabId }, reason: string) => void>;
}

export interface DDXSearch {
	query(opts: { text: string; disposition?: 'CURRENT_TAB' | 'NEW_TAB' | 'NEW_WINDOW'; tabId?: TabId }): Promise<void>;
}

export interface DDXDialogs {
	handleNext(target: TabTarget, action: 'accept' | 'dismiss', promptText?: string): Promise<void>;
}

export interface DDXRuntime {
	readonly id: string;
	getURL(path: string): string;
	getManifest(): { version: string; protocolVersion: string; capabilities: string[] };
	getPlatformInfo(): Promise<{ os: string; arch: string }>;
}

export interface DDXAuth {
	getPlusToken(): Promise<{ token: string; expiresAt: number } | null>;
	getUser(): Promise<UserProfile | null>;
}

export interface DDXHost {
	version(): Promise<{ protocolVersion: string; hostVersion: string }>;
	capabilities(): Promise<{ namespaces: Record<string, string[]> }>;
	setDefaultTimeout(ms: number): Promise<void>;
}

export interface DDX {
	readonly tabs: DDXTabs;
	readonly scripting: DDXScripting;
	readonly dom: DDXDom;
	readonly input: DDXInput;
	readonly webNavigation: DDXWebNavigation;
	readonly cookies: DDXCookies;
	readonly storage: DDXStorage;
	readonly history: DDXHistory;
	readonly bookmarks: DDXBookmarks;
	readonly windows: DDXWindows;
	readonly debugger: DDXDebugger;
	readonly search: DDXSearch;
	readonly dialogs: DDXDialogs;
	readonly runtime: DDXRuntime;
	readonly auth: DDXAuth;
	readonly host: DDXHost;
}

// ── Wire-format registry ────────────────────────────────────────────
//
// METHOD_REGISTRY is a flat list of "namespace.method" strings.
// Both the host channel (to validate incoming methods) and the client
// runtime (to build window.ddx) iterate over this. Adding a method:
// (1) declare it on the relevant interface, (2) append the dotted name
// here, (3) add a handler entry in handlers/index.ts.

export const METHOD_REGISTRY = [
	// tabs
	'tabs.query', 'tabs.get', 'tabs.getCurrent', 'tabs.create', 'tabs.update',
	'tabs.remove', 'tabs.duplicate', 'tabs.reload', 'tabs.goBack', 'tabs.goForward',
	'tabs.captureVisibleTab', 'tabs.sendMessage',
	'tabs.move', 'tabs.group', 'tabs.ungroup', 'tabs.hardReload',
	// scripting
	'scripting.executeScript', 'scripting.insertCSS', 'scripting.removeCSS',
	'scripting.registerContentScripts', 'scripting.unregisterContentScripts',
	'scripting.getRegisteredContentScripts', 'scripting.updateContentScripts',
	// dom (read)
	'dom.readPage', 'dom.querySelector', 'dom.querySelectorAll',
	'dom.getText', 'dom.getAttribute', 'dom.getValue',
	'dom.getOuterHTML', 'dom.getInnerHTML', 'dom.boundingBox', 'dom.isVisible',
	'dom.openOrClosedShadowRoot',
	// dom (interact)
	'dom.click', 'dom.dblclick', 'dom.hover', 'dom.type', 'dom.press',
	'dom.select', 'dom.check', 'dom.uncheck', 'dom.focus', 'dom.blur',
	'dom.scroll', 'dom.dragAndDrop', 'dom.uploadFile',
	// input
	'input.keyboard.down', 'input.keyboard.up', 'input.keyboard.press', 'input.keyboard.type',
	'input.mouse.move', 'input.mouse.down', 'input.mouse.up', 'input.mouse.click', 'input.mouse.wheel',
	// webNavigation
	'webNavigation.getFrame', 'webNavigation.getAllFrames',
	'webNavigation.waitForLoad', 'webNavigation.waitForNavigation',
	'webNavigation.waitForSelector', 'webNavigation.waitForFunction',
	// cookies
	'cookies.get', 'cookies.getAll', 'cookies.set', 'cookies.remove', 'cookies.getAllCookieStores',
	// storage (page-targeted)
	'storage.local.get', 'storage.local.set', 'storage.local.remove',
	'storage.local.clear', 'storage.local.getKeys',
	'storage.session.get', 'storage.session.set', 'storage.session.remove',
	'storage.session.clear', 'storage.session.getKeys',
	// history
	'history.search', 'history.addUrl', 'history.deleteUrl', 'history.deleteRange',
	'history.deleteAll', 'history.getVisits',
	// bookmarks
	'bookmarks.get', 'bookmarks.getChildren', 'bookmarks.getRecent',
	'bookmarks.getTree', 'bookmarks.getSubTree', 'bookmarks.search',
	'bookmarks.create', 'bookmarks.move', 'bookmarks.update',
	'bookmarks.remove', 'bookmarks.removeTree',
	// windows
	'windows.getCurrent', 'windows.getLastFocused', 'windows.getAll',
	'windows.get', 'windows.create', 'windows.remove', 'windows.update',
	// debugger
	'debugger.attach', 'debugger.detach', 'debugger.sendCommand', 'debugger.getTargets',
	// search
	'search.query',
	// dialogs
	'dialogs.handleNext',
	// runtime
	'runtime.getURL', 'runtime.getManifest', 'runtime.getPlatformInfo',
	// auth
	'auth.getPlusToken', 'auth.getUser',
	'auth.setToken', 'auth.clearToken',
	// host
	'host.version', 'host.capabilities', 'host.setDefaultTimeout',
] as const;

export type MethodName = (typeof METHOD_REGISTRY)[number];

// Reserved event paths. The client runtime stubs these as no-op
// addListener/removeListener objects so NyxAI can register handlers
// without errors; v1 never dispatches them.
export const RESERVED_EVENT_PATHS = [
	'tabs.onCreated', 'tabs.onUpdated', 'tabs.onActivated', 'tabs.onRemoved', 'tabs.onMoved',
	'webNavigation.onBeforeNavigate', 'webNavigation.onCommitted',
	'webNavigation.onDOMContentLoaded', 'webNavigation.onCompleted',
	'webNavigation.onErrorOccurred', 'webNavigation.onHistoryStateUpdated',
	'cookies.onChanged',
	'history.onVisited', 'history.onVisitRemoved',
	'debugger.onEvent', 'debugger.onDetach',
] as const;

export type ReservedEventPath = (typeof RESERVED_EVENT_PATHS)[number];

// Protocol version. Bump on breaking changes to the wire format.
export const PROTOCOL_VERSION = '1.0';
