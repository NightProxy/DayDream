
import type { ExtensionContext } from '../../extfs/types';

export interface MessageSender {
  id?: string;
  url?: string;
  origin?: string;
  tab?: unknown;
  frameId?: number;
  tlsChannelId?: string;
  documentId?: string;
  documentLifecycle?: 'prerender' | 'active' | 'cached' | 'pending_deletion';
}

export interface SenderBuildContext {
  callerExtId?: string;
  sourceWindow?: Window;
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
      sender.frameId = 0;
      if (info.url) {
        sender.url = info.url;
        try { sender.origin = new URL(info.url).origin; } catch { /* ignore */ }
      }
    }
  }

  return sender;
}
