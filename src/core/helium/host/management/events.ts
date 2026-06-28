// src/core/helium/host/management/events.ts
//
// Wires chrome.management.* events (onInstalled, onUninstalled,
// onEnabled, onDisabled) to the ExtensionManager's lifecycle
// listeners. ExtensionManager exposes `on(event, listener)` for
// 'installed' | 'uninstalled' | 'enabled' | 'disabled'.
//
// Each event must be fanned out only to extensions that hold the
// 'management' permission. onUninstalled receives the bare id (the
// extension is already gone at fire time, so an ExtensionInfo is
// not available).

import { getExtension } from '../../extfs';
import { buildExtensionInfo } from './handlers';

export type ManagementEvent =
	| 'installed'
	| 'uninstalled'
	| 'enabled'
	| 'disabled';

export interface ManagementEventDeps {
	on: (event: ManagementEvent, listener: (id: string) => void) => void;
	off: (event: ManagementEvent, listener: (id: string) => void) => void;
	fanoutEvent: (method: string, args: unknown[], requiredPerm?: string) => void;
}

export function installManagementEventListeners(
	deps: ManagementEventDeps,
): () => void {
	const onInstalled = (id: string): void => {
		void (async () => {
			try {
				const got = await getExtension(id);
				if (!got) return;
				const info = buildExtensionInfo(got.entry, got.manifest);
				deps.fanoutEvent('chrome.management.onInstalled', [info], 'management');
			} catch (err) {
				console.warn('[helium/management] onInstalled fanout failed:', err);
			}
		})();
	};

	const onUninstalled = (id: string): void => {
		try {
			deps.fanoutEvent('chrome.management.onUninstalled', [id], 'management');
		} catch (err) {
			console.warn('[helium/management] onUninstalled fanout failed:', err);
		}
	};

	const onEnabled = (id: string): void => {
		void (async () => {
			try {
				const got = await getExtension(id);
				if (!got) return;
				const info = buildExtensionInfo(got.entry, got.manifest);
				deps.fanoutEvent('chrome.management.onEnabled', [info], 'management');
			} catch (err) {
				console.warn('[helium/management] onEnabled fanout failed:', err);
			}
		})();
	};

	const onDisabled = (id: string): void => {
		void (async () => {
			try {
				const got = await getExtension(id);
				if (!got) return;
				const info = buildExtensionInfo(got.entry, got.manifest);
				deps.fanoutEvent('chrome.management.onDisabled', [info], 'management');
			} catch (err) {
				console.warn('[helium/management] onDisabled fanout failed:', err);
			}
		})();
	};

	deps.on('installed', onInstalled);
	deps.on('uninstalled', onUninstalled);
	deps.on('enabled', onEnabled);
	deps.on('disabled', onDisabled);

	return () => {
		deps.off('installed', onInstalled);
		deps.off('uninstalled', onUninstalled);
		deps.off('enabled', onEnabled);
		deps.off('disabled', onDisabled);
	};
}
