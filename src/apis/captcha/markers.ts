/**
 * Wire-protocol markers for the captcha page⇄host postMessage channel.
 *
 * These constants are the public protocol surface between
 * `hook.runtime.js` (which uses the LITERAL strings — TypeScript can't
 * import constants into a `?raw`-loaded JS file) and the host bridge
 * (`bridge.ts`). If you change a value here, you MUST also change the
 * matching literal in `hook.runtime.js`.
 *
 * The shape of the request and response payloads is documented on
 * `RequestResponseChannel` in `src/apis/eventsBridge.ts`; the captcha
 * bridge constructs that channel with the markers below.
 */

/** Page→host: solve-this-captcha request envelope key. */
export const REQ_MARKER = '__ddx_captcha_req';

/** Host→page: result envelope key (token or error). */
export const RES_MARKER = '__ddx_captcha_res';

/**
 * Page→host: one-shot "the hook is alive in this frame" announcement.
 * Useful for debugging — the host bridge can log when it sees one.
 * Carries `{ pageUrl, at }` (timestamp ms). Now also carries a
 * `MessagePort` in the transfer list — the host stores it and uses it
 * for ALL subsequent replies to this frame instead of
 * `event.source.postMessage`. See "Why a MessagePort" in
 * `bridge.ts`'s `makeReplyTransport`.
 */
export const HOOK_READY_MARKER = '__ddx_captcha_hook_ready';

/**
 * Sentinel set on `window` by the hook to make installation
 * idempotent. Subsequent injections of the same hook short-circuit.
 */
export const HOOK_INSTALLED_FLAG = '__ddx_captcha_hook_installed';
