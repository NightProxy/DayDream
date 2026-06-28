/**
 * Public surface of the devtools subsystem.
 *
 * - `DevToolsManager` — singleton lifecycle manager (per-tab sessions).
 * - `installDevToolsHook` — Scramjet plugin that injects the per-frame
 *   agent into proxied windows for tabs with DevTools open.
 * - `DevtoolsMessage` — wire-protocol type for the agent envelope.
 */

export { DevToolsManager } from './manager';
export { DevToolsSession } from './session';
export { installDevToolsHook } from './hookInstaller';
export type { DevtoolsMessage } from './types';
export type {
	AddPanelOpts,
	PanelEntry,
	PanelHandle,
} from './panel';
