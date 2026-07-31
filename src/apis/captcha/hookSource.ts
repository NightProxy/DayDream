/**
 * Loads the in-iframe captcha hook source as a string.
 *
 * Vite's `?raw` query returns the file contents as a string at build
 * time — the hook IIFE itself is never imported as a module, it's
 * registered with `scriptInjectionRegistry` as an inline script
 * (see `./index.ts`).
 *
 * Same trick the vendored scramjet controller uses for Obscura
 * (`src/core/SJ/controller/src/index.ts:37` imports the IIFE with `?text`).
 * `?raw` is Vite's standard equivalent.
 */

// `?raw` returns string; the type below tells tsc that.
import HOOK_SOURCE from './hook.runtime.js?raw';

export const CAPTCHA_HOOK_SOURCE: string = HOOK_SOURCE;
