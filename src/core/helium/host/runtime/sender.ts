// src/core/helium/host/runtime/sender.ts
//
// MessageSender enrichment per Helium Tiers 1-3 spec §4.1.
//
// Builds the Chrome MessageSender shape for runtime/tabs.sendMessage
// callsites. Two flavors:
//   - BG → BG (own ext or cross-ext): set `id` to caller's ext id.
//   - CS → BG: use a tabInfoLookup to resolve the source window to a
//     tab id + url, and set `tab`, `url`, `origin`, `frameId`.
//
// `frameId` is fixed to 0 for v1 (top-frame only).
// `tlsChannelId` is not supported.

import type { ExtensionContext } from '../../extfs/types';

export interface MessageSender {
  id?: string;
  url?: string;
  origin?: string;
  tab?: unknown;             // chrome.tabs.Tab; ExtensionManager fills in
  frameId?: number;
  tlsChannelId?: string;     // not implemented
  documentId?: string;
  documentLifecycle?: 'prerender' | 'active' | 'cached' | 'pending_deletion';
}

export interface SenderBuildContext {
  callerExtId?: string;       // For BG→BG within own ext or cross-ext
  sourceWindow?: Window;      // For CS→BG: the originating page window
  tabInfoLookup?: (window: Window) => { tabId: number; url?: string; tab?: unknown } | null;
}

export function buildMessageSender(
  _ctx: ExtensionContext,
  build: SenderBuildContext,
): MessageSender {
  const sender: MessageSender = {};

  if (build.callerExtId) {
    sender.id = build.callerExtId;
  }

  if (build.sourceWindow && build.tabInfoLookup) {
    const info = build.tabInfoLookup(build.sourceWindow);
    if (info) {
      sender.tab = info.tab;
      sender.frameId = 0; // v1: top-frame only
      if (info.url) {
        sender.url = info.url;
        try { sender.origin = new URL(info.url).origin; } catch { /* ignore */ }
      }
    }
  }

  return sender;
}
