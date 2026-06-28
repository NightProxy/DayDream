// src/core/helium/host/runtime/dispatch.ts
//
// chrome.runtime.onMessage dispatcher with Chrome's sendResponse contract:
//   - All listeners invoked with (message, sender, sendResponse)
//   - Sync return values collected
//   - If any listener returned `true`, wait for the first async sendResponse
//     (subsequent calls are no-ops)
//   - If a listener calls sendResponse synchronously, that value wins
//     immediately and any `true` returns are ignored
//   - Timeout: 30 seconds for async sendResponse

const DEFAULT_TIMEOUT_MS = 30_000;

export type OnMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void | undefined;

export interface DispatchResult {
  /** The response value, or undefined if nothing responded. */
  response: unknown;
  /** True if any listener handled (returned true or called sendResponse). */
  handled: boolean;
}

export function dispatchOnMessage(
  listeners: Iterable<OnMessageListener>,
  message: unknown,
  sender: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<DispatchResult> {
  return new Promise<DispatchResult>((resolve) => {
    let settled = false;
    let anyReturnedTrue = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = (response: unknown, handled: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve({ response, handled });
    };

    const makeSendResponse = (): ((r: unknown) => void) => {
      let used = false;
      return (r: unknown) => {
        if (used || settled) return;
        used = true;
        settle(r, true);
      };
    };

    for (const listener of listeners) {
      if (settled) break;
      const sendResp = makeSendResponse();
      try {
        const r = listener(message, sender, sendResp);
        if (r === true) anyReturnedTrue = true;
      } catch (err) {
        // Log but continue; Chrome doesn't propagate listener errors
        console.error('[helium/runtime] onMessage listener threw:', err);
      }
    }

    if (settled) return;

    if (!anyReturnedTrue) {
      // No listener will respond asynchronously
      settle(undefined, false);
      return;
    }

    // Wait for async sendResponse or timeout
    timer = setTimeout(() => {
      settle(undefined, false);
    }, timeoutMs);
  });
}
