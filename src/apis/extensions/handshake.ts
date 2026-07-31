interface HandshakeOptions {
  onSuccess?: () => void;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export function attachExtensionHandshakeWhenReady(
  extId: string,
  iframe: HTMLIFrameElement,
  extPort: MessagePort,
  opts: HandshakeOptions = {},
): void {
  const retryMs = opts.retryMs ?? 25;
  const timeoutMs = opts.timeoutMs ?? 2_000;
  const now = opts.now ?? Date.now;
  const setTimer = opts.setTimer ?? setTimeout;
  const clearTimer = opts.clearTimer ?? clearTimeout;
  const deadline = now() + timeoutMs;
  let completed = false;
  let warned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    iframe.removeEventListener('load', onLoad);
  };

  const tryHandshake = (): boolean => {
    if (completed) return true;
    const win = iframe.contentWindow;
    if (!win) return false;

    try {
      const receive = (
        win as unknown as { __helium_handshake_receive__?: (port: MessagePort) => void }
      ).__helium_handshake_receive__;
      if (typeof receive !== 'function') return false;
      completed = true;
      clear();
      receive(extPort);
      opts.onSuccess?.();
      return true;
    } catch (err) {
      console.warn(`[ExtensionManager] handshake call failed for ${extId}:`, err);
      return false;
    }
  };

  const poll = (): void => {
    if (tryHandshake()) return;
    if (now() >= deadline) {
      if (!warned) {
        warned = true;
        console.warn(
          `[ExtensionManager] attachHandshakeWhenReady: bootstrap not installed for ${extId}` +
            ` (no __helium_handshake_receive__) after ${timeoutMs}ms. Is the HTML being served through HeliumExtensionPlugin?`,
        );
      }
      clear();
      return;
    }
    timer = setTimer(poll, retryMs);
  };

  const onLoad = (): void => {
    poll();
  };

  iframe.addEventListener('load', onLoad);

  try {
    const doc = iframe.contentDocument;
    if (doc && doc.readyState === 'complete') {
      poll();
      return;
    }
  } catch {
    // Fall through to load listener for cross-origin or transient access failures.
  }
}
