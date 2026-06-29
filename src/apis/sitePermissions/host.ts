// src/apis/sitePermissions/host.ts
//
// Host-side coordinator for Web Platform permission prompts.
//
// Listens on `window` for `__ddxSitePermission` postMessage requests
// from proxied iframes. Each request is `{type, name, origin, reqId}`.
// We resolve the current state:
//   - 'granted' → reply yes
//   - 'denied'  → reply no
//   - 'prompt'  → show Nightmare modal, persist user's choice
//                  (unless user picks "this time only"), reply
//
// Permission name → user-facing label:
//   geolocation  → "Use your location"
//   notifications→ "Show notifications"
//   camera       → "Use your camera"
//   microphone   → "Use your microphone"
//   midi         → "Access MIDI devices"
//   ...
//
// We anchor the prompt to the active tab (no per-iframe anchor — DDX
// shows one prompt at a time). Concurrent requests for the SAME
// (origin, name) are coalesced.

import { SitePermissionsStore } from '../sitePermissions';

interface PermissionRequestMessage {
  __ddxSitePermission: true;
  /** When true, return current stored state without showing a prompt. */
  __query?: boolean;
  reqId: number;
  origin: string;
  name: string;
}

interface PermissionResponseMessage {
  __ddxSitePermissionResp: true;
  reqId: number;
  state: 'granted' | 'denied' | 'prompt';
}

interface NightmarePromptDeps {
  ask(req: {
    extensionName: string;
    permissions?: string[];
    origins?: string[];
  }): Promise<boolean>;
}

interface NightmareLike {
  permissionPrompt?: NightmarePromptDeps;
}

/**
 * Friendly label for each permission name. Falls back to the raw
 * name if not in the table (extension-defined permissions etc).
 */
const FRIENDLY_LABELS: Record<string, string> = {
  geolocation: 'Use your location',
  notifications: 'Show notifications',
  camera: 'Use your camera',
  microphone: 'Use your microphone',
  midi: 'Access MIDI devices',
  'background-sync': 'Sync data in the background',
  'persistent-storage': 'Store data persistently',
  push: 'Send push notifications',
  'screen-wake-lock': 'Prevent the screen from sleeping',
  'clipboard-read': 'Read clipboard contents',
  'clipboard-write': 'Write to your clipboard',
  'display-capture': 'Capture your screen',
  'storage-access': 'Access cross-site storage',
  'system-wake-lock': 'Prevent your system from sleeping',
};

function friendlyLabel(name: string): string {
  return FRIENDLY_LABELS[name] ?? name;
}

/**
 * Coalesce concurrent prompts for the same (origin, name). Map keys
 * are `${origin}|${name}` and values are the in-flight promise.
 */
const inFlight = new Map<string, Promise<'granted' | 'denied'>>();

/**
 * Install the message listener. Returns a teardown.
 *
 * Scramjet wraps outbound postMessage from proxied iframes in an
 * envelope: `{$scramjet$messagetype, $scramjet$origin, $scramjet$data}`.
 * The host sees this wrapped shape and must unwrap it to read the
 * permission request payload. Same pattern as content-script relay
 * (see `src/core/helium/content/relay.ts:79-85`).
 */
export function installSitePermissionsHost(): () => void {
  const onMsg = async (e: MessageEvent): Promise<void> => {
    const raw = e.data as
      | (PermissionRequestMessage & { $scramjet$messagetype?: string })
      | { $scramjet$messagetype: string; $scramjet$data?: PermissionRequestMessage }
      | null;
    if (!raw || typeof raw !== 'object') return;
    // Unwrap Scramjet's window-postMessage envelope if present.
    const data = (raw as { __ddxSitePermission?: true }).__ddxSitePermission
      ? (raw as PermissionRequestMessage)
      : (raw as { $scramjet$messagetype?: string; $scramjet$data?: PermissionRequestMessage })
            .$scramjet$messagetype &&
          (raw as { $scramjet$data?: PermissionRequestMessage }).$scramjet$data
            ?.__ddxSitePermission
        ? (raw as { $scramjet$data: PermissionRequestMessage }).$scramjet$data
        : null;
    if (!data) return;
    if (typeof data.reqId !== 'number') return;

    const source = e.source as Window | null;
    if (!source) return;

    let result: 'granted' | 'denied' | 'prompt';
    try {
      if (data.__query) {
        // Read-only: never prompt.
        const store = SitePermissionsStore.getInstance();
        result = await store.getState(data.origin, data.name);
      } else {
        result = await resolveOne(data.origin, data.name);
      }
    } catch (err) {
      console.warn('[sitePerms/host] resolve failed:', err);
      result = 'denied';
    }
    const reply: PermissionResponseMessage = {
      __ddxSitePermissionResp: true,
      reqId: data.reqId,
      state: result,
    };
    // Post back to the iframe's contentWindow. The iframe's own
    // `message` listener also has to unwrap if Scramjet's inbound
    // wrap-handler kicks in — we handle that on the page side by
    // accepting both raw and wrapped envelopes.
    try {
      source.postMessage(reply, '*');
    } catch (err) {
      console.warn('[sitePerms/host] reply postMessage failed:', err);
    }
  };
  window.addEventListener('message', onMsg);
  return () => window.removeEventListener('message', onMsg);
}

async function resolveOne(origin: string, name: string): Promise<'granted' | 'denied'> {
  if (!origin || !name) return 'denied';
  const key = `${origin}|${name}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const work = (async () => {
    const store = SitePermissionsStore.getInstance();
    const state = await store.getState(origin, name);
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'denied';

    // Need to prompt.
    const nightmare = (window as { nightmare?: NightmareLike }).nightmare;
    if (!nightmare?.permissionPrompt?.ask) {
      // No prompt UI available — default to denied for safety.
      console.warn(
        '[sitePerms/host] no permission prompt UI available; defaulting to denied',
      );
      return 'denied';
    }
    const allow = await nightmare.permissionPrompt.ask({
      extensionName: hostnameFromOrigin(origin),
      permissions: [friendlyLabel(name)],
      origins: [origin],
    });
    const finalState: 'granted' | 'denied' = allow ? 'granted' : 'denied';
    await store.setState(origin, name, finalState);
    return finalState;
  })();

  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

function hostnameFromOrigin(origin: string): string {
  try { return new URL(origin).hostname; } catch { return origin; }
}
