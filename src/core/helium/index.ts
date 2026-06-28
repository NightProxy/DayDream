// Shared base classes and utilities
export { ChromeEvent } from './shared/ChromeEvent';
export type { EventListener } from './shared/ChromeEvent';
export { DeclarativeEvent } from './shared/DeclarativeEvent';
export type { Rule, RuleCallback } from './shared/DeclarativeEvent';
export { ChromeSetting } from './shared/ChromeSetting';
export { ContentSetting } from './shared/ContentSetting';
export { StorageArea } from './shared/StorageArea';

// Shared namespace classes (30 identical between MV2 and MV3)
export * from './shared/api';

// CRX/XPI unpack
export * from './shared/unpack';

// Per-manifest-version Chrome classes
export { Chrome as ChromeMV2 } from './mv2/Chrome';
export { Chrome as ChromeMV3 } from './mv3/Chrome';

// Extension filesystem + lifecycle + Scramjet plugin
export * from './extfs';

// Extension iframe bootstrap (host-side helpers + IIFE bundle source)
export * from './bootstrap';

// Content scripts: per-page injection, mini-chrome runtime, Port API,
// chrome.scripting.* handlers
export * from './content';

// Per-namespace host handlers (chrome.tabs, chrome.windows, ...)
export * from './host';
