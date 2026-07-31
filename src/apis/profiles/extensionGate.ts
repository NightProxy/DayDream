import { getProfileBroadcast } from "@apis/data/profileBroadcast";
import { ProfileExtensionHost } from "./extensions";
import { ProfileRegistry } from "./registry";

/**
 * Runtime gate consulted by src/apis/extensions.ts when dispatching
 * chrome.* calls or deciding whether to spawn an extension at boot.
 *
 * Responsibilities:
 *   - Cache the active profile's extension manifest.
 *   - Refresh on `active-changed` / `profile-updated` broadcasts.
 *   - Answer synchronous `isEnabled(id)` queries fast enough to gate
 *     dispatch without adding a microtask hop per call.
 *
 * v3 wiring plan (§5 of the proposal):
 *   1. src/apis/extensions.ts imports `getExtensionGate()` and calls
 *      `gate.isEnabled(extensionId)` before invoking each spawned
 *      extension's handler.
 *   2. `loadExtensionsAtBoot()` filters the returned list through
 *      `gate.isEnabled(...)` so disabled-per-profile packages never
 *      spawn.
 *   3. On broadcast, the manager tears down disabled extensions and
 *      spawns newly-enabled ones.
 *
 * This module ships the gate itself. The wiring into the giant
 * extensions.ts file is intentionally deferred to a follow-up because
 * the current manager loads a workspace-global list rather than a
 * per-profile one; the gate is a no-op until that call site changes.
 */
export class ExtensionGate {
	private readonly host = new ProfileExtensionHost();
	private readonly registry = new ProfileRegistry();
	private enabledIds: Set<string> | undefined;
	private refreshing: Promise<void> | undefined;

	constructor() {
		void this.refresh();
		try {
			const bc = getProfileBroadcast();
			bc.subscribe((message) => {
				if (
					message.type === "active-changed" ||
					message.type === "profile-updated"
				) {
					void this.refresh();
				}
			});
		} catch {
			// BroadcastChannel unavailable; the gate still works, it just
			// won't self-refresh across tabs.
		}
	}

	async ready(): Promise<void> {
		if (this.refreshing) await this.refreshing;
	}

	isEnabled(extensionId: string): boolean {
		// Optimistic: while the manifest is loading, allow — the manager
		// already checks its own enabled flag, so this is only a
		// per-profile *additional* gate.
		if (!this.enabledIds) return true;
		return this.enabledIds.has(extensionId);
	}

	private async refresh(): Promise<void> {
		this.refreshing = (async () => {
			try {
				const activeId = await this.registry.getActiveId();
				if (!activeId) {
					this.enabledIds = new Set();
					return;
				}
				const manifest = await this.host.readManifest(activeId);
				this.enabledIds = new Set(manifest.enabled.map((e) => e.id));
			} catch (error) {
				console.warn("[ExtensionGate] refresh failed", error);
				this.enabledIds = undefined;
			}
		})();
		return this.refreshing;
	}
}

let shared: ExtensionGate | undefined;
export function getExtensionGate(): ExtensionGate {
	shared ??= new ExtensionGate();
	return shared;
}
