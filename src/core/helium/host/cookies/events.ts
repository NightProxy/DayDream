
import type { ExtensionManager } from '@apis/extensions';
import type { CookieAccessor, CookieChangeDelta, DDXCookie } from '@apis/data/cookies';

const BROADCAST_CHANNEL_NAME = '__scramjet_controller_channel';

export function installCookieEventListeners(extMgr: ExtensionManager): () => void {
  const accessor: CookieAccessor | undefined = (extMgr as unknown as {
    nyxCtx?: { cookies?: CookieAccessor };
  }).nyxCtx?.cookies;
  if (!accessor) {
    return () => undefined;
  }

  const fanout = (delta: CookieChangeDelta): void => {
    try {
      extMgr.fanoutEvent('chrome.cookies.onChanged', [delta], 'cookies');
    } catch (err) {
      console.warn('[helium/cookies] fanout failed:', err);
    }
  };

  const unsubLocal = accessor.onChange(fanout);

  let snapshot: Map<string, DDXCookie> = new Map();
  void accessor.snapshot().then((s) => { snapshot = s; });

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch (err) {
    console.warn('[helium/cookies] BroadcastChannel unavailable:', err);
    return () => { unsubLocal(); };
  }

  let pendingTimer: number | null = null;
  const scheduleDiff = (): void => {
    if (pendingTimer !== null) return;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      void runDiff();
    }, 30);
  };

  const runDiff = async (): Promise<void> => {
    let next: Map<string, DDXCookie>;
    try {
      next = await accessor.snapshot();
    } catch (err) {
      console.warn('[helium/cookies] snapshot failed:', err);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    for (const [key, prior] of snapshot) {
      const newer = next.get(key);
      if (!newer) {
        const expired = prior.expirationDate !== undefined && prior.expirationDate <= now;
        fanout({
          removed: true,
          cookie: prior,
          cause: expired ? 'expired' : 'explicit',
        });
        continue;
      }
      if (cookieDiffers(prior, newer)) {
        fanout({ removed: true, cookie: prior, cause: 'overwrite' });
        fanout({ removed: false, cookie: newer, cause: 'explicit' });
      }
    }
    for (const [key, newer] of next) {
      if (!snapshot.has(key)) {
        fanout({ removed: false, cookie: newer, cause: 'explicit' });
      }
    }
    snapshot = next;
  };

  const onBcMessage = (e: MessageEvent): void => {
    const data = e.data as { updatedAt?: number } | null;
    if (!data) return;
    scheduleDiff();
  };
  bc.addEventListener('message', onBcMessage);

  return () => {
    unsubLocal();
    bc?.removeEventListener('message', onBcMessage);
    try { bc?.close(); } catch { /* noop */ }
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };
}

/**
 * Shallow value-equality check for two cookie snapshots at the same
 * identity (`domain|path|name`). Returns true if any user-visible
 * attribute differs (so the diff path emits an overwrite pair).
 */
function cookieDiffers(a: DDXCookie, b: DDXCookie): boolean {
  return (
    a.value !== b.value ||
    a.secure !== b.secure ||
    a.httpOnly !== b.httpOnly ||
    a.sameSite !== b.sameSite ||
    a.hostOnly !== b.hostOnly ||
    a.session !== b.session ||
    a.expirationDate !== b.expirationDate
  );
}
