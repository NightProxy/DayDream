// src/core/helium/host/permissions/handlers.ts
//
// chrome.permissions.* host handlers (spec §22).
//
// - getAll: union of manifest-declared perms + persisted optional grants.
// - contains: predicate over the union of declared + optional grants.
// - request: prompts the user (via Nightmare's permissionPrompt), and
//   on approval persists the granted optional perms to extfs. Fires
//   chrome.permissions.onAdded.
// - remove: drops items from the persisted optional grants and fires
//   chrome.permissions.onRemoved.
//
// Tasks/specs do not implement runtime revocation of MANIFEST-declared
// perms (Chrome behavior); only optional grants are mutable here.

import type { ExtensionContext } from '../../extfs/types';
import type { PermissionPrompt } from '@pkgs/Nightmare/permissionPrompt';
import { loadOptional, saveOptional } from './storage';

export interface PermissionsHandlerDeps {
	/** Resolve the Nightmare permission prompt at call time (lazy). */
	getPrompt: () => PermissionPrompt | null;
	/** Fire chrome.permissions.* events on a given extension's channel. */
	fireEventOn: (extId: string, method: string, args: unknown[]) => void;
}

interface PermsArg {
	permissions?: string[];
	origins?: string[];
}

function manifestPermissions(ctx: ExtensionContext): string[] {
	const m = ctx.manifest as { permissions?: unknown[] };
	if (!Array.isArray(m.permissions)) return [];
	return m.permissions.filter((p): p is string => typeof p === 'string');
}

function manifestHostPermissions(ctx: ExtensionContext): string[] {
	const m = ctx.manifest as {
		host_permissions?: unknown[];
		// MV2 stores host patterns inside `permissions[]` mixed with API perms.
		// We don't try to discriminate here; getAll exposes only declared
		// host_permissions (MV3) plus any optional origin grants. MV2
		// hosts will simply be reported as API permissions, mirroring how
		// the manifest itself encodes them.
	};
	if (!Array.isArray(m.host_permissions)) return [];
	return m.host_permissions.filter((p): p is string => typeof p === 'string');
}

function manifestOptionalPermissions(ctx: ExtensionContext): string[] {
	const m = ctx.manifest as { optional_permissions?: unknown[] };
	if (!Array.isArray(m.optional_permissions)) return [];
	return m.optional_permissions.filter((p): p is string => typeof p === 'string');
}

function manifestOptionalHostPermissions(ctx: ExtensionContext): string[] {
	const m = ctx.manifest as { optional_host_permissions?: unknown[] };
	if (!Array.isArray(m.optional_host_permissions)) return [];
	return m.optional_host_permissions.filter((p): p is string => typeof p === 'string');
}

function extensionName(ctx: ExtensionContext): string {
	const m = ctx.manifest as { name?: string };
	return typeof m.name === 'string' && m.name.length > 0 ? m.name : ctx.id;
}

export class PermissionsHandlers {
	constructor(private readonly deps: PermissionsHandlerDeps) {}

	getAll = async (
		ctx: ExtensionContext,
		_args: unknown[],
	): Promise<{ permissions: string[]; origins: string[] }> => {
		const optional = await loadOptional(ctx.id);
		const perms = new Set<string>([
			...manifestPermissions(ctx),
			...optional.permissions,
		]);
		const origins = new Set<string>([
			...manifestHostPermissions(ctx),
			...optional.origins,
		]);
		return {
			permissions: Array.from(perms),
			origins: Array.from(origins),
		};
	};

	contains = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<boolean> => {
		const arg = (args[0] ?? {}) as PermsArg;
		const all = await this.getAll(ctx, []);
		const have = new Set(all.permissions);
		const haveOrigins = new Set(all.origins);
		if (Array.isArray(arg.permissions)) {
			for (const p of arg.permissions) {
				if (typeof p !== 'string') return false;
				if (!have.has(p)) return false;
			}
		}
		if (Array.isArray(arg.origins)) {
			for (const o of arg.origins) {
				if (typeof o !== 'string') return false;
				if (!haveOrigins.has(o)) return false;
			}
		}
		return true;
	};

	request = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<boolean> => {
		const arg = (args[0] ?? {}) as PermsArg;
		const reqPerms = Array.isArray(arg.permissions)
			? arg.permissions.filter((p): p is string => typeof p === 'string')
			: [];
		const reqOrigins = Array.isArray(arg.origins)
			? arg.origins.filter((o): o is string => typeof o === 'string')
			: [];

		if (reqPerms.length === 0 && reqOrigins.length === 0) return true;

		// Validate that every requested permission appears in the
		// manifest's optional_permissions / optional_host_permissions
		// (Chrome semantics — request() may only ask for things the
		// manifest opted into). Items already granted (in manifest
		// permissions, host_permissions, or previously approved
		// optional grants) are auto-allowed.
		const optionalDecl = new Set(manifestOptionalPermissions(ctx));
		const optionalHostDecl = new Set(manifestOptionalHostPermissions(ctx));
		const granted = await this.getAll(ctx, []);
		const grantedPerms = new Set(granted.permissions);
		const grantedOrigins = new Set(granted.origins);

		const newPerms: string[] = [];
		const newOrigins: string[] = [];
		for (const p of reqPerms) {
			if (grantedPerms.has(p)) continue;
			if (!optionalDecl.has(p)) {
				throw new Error(
					`Permission "${p}" is not declared in optional_permissions`,
				);
			}
			newPerms.push(p);
		}
		for (const o of reqOrigins) {
			if (grantedOrigins.has(o)) continue;
			if (!optionalHostDecl.has(o)) {
				throw new Error(
					`Origin "${o}" is not declared in optional_host_permissions`,
				);
			}
			newOrigins.push(o);
		}

		if (newPerms.length === 0 && newOrigins.length === 0) {
			return true;
		}

		const prompt = this.deps.getPrompt();
		if (!prompt) {
			// No UI available; default-deny to match secure-fail.
			console.warn(
				`[helium/permissions] request: Nightmare permission prompt unavailable; denying for ${ctx.id}`,
			);
			return false;
		}

		const promptRequest: { extensionName: string; permissions?: string[]; origins?: string[] } = {
			extensionName: extensionName(ctx),
		};
		if (newPerms.length > 0) promptRequest.permissions = newPerms;
		if (newOrigins.length > 0) promptRequest.origins = newOrigins;
		const ok = await prompt.ask(promptRequest);
		if (!ok) return false;

		const current = await loadOptional(ctx.id);
		const merged = {
			permissions: Array.from(new Set([...current.permissions, ...newPerms])),
			origins: Array.from(new Set([...current.origins, ...newOrigins])),
		};
		await saveOptional(ctx.id, merged);
		this.deps.fireEventOn(ctx.id, 'chrome.permissions.onAdded', [
			{ permissions: newPerms, origins: newOrigins },
		]);
		return true;
	};

	remove = async (
		ctx: ExtensionContext,
		args: unknown[],
	): Promise<boolean> => {
		const arg = (args[0] ?? {}) as PermsArg;
		const remPerms = Array.isArray(arg.permissions)
			? arg.permissions.filter((p): p is string => typeof p === 'string')
			: [];
		const remOrigins = Array.isArray(arg.origins)
			? arg.origins.filter((o): o is string => typeof o === 'string')
			: [];
		if (remPerms.length === 0 && remOrigins.length === 0) return true;

		// Cannot remove manifest-required permissions; only optional grants
		// are removable.
		const declared = new Set(manifestPermissions(ctx));
		const declaredHosts = new Set(manifestHostPermissions(ctx));
		for (const p of remPerms) {
			if (declared.has(p)) {
				throw new Error(
					`Permission "${p}" is required by the manifest and cannot be removed`,
				);
			}
		}
		for (const o of remOrigins) {
			if (declaredHosts.has(o)) {
				throw new Error(
					`Origin "${o}" is required by the manifest and cannot be removed`,
				);
			}
		}

		const current = await loadOptional(ctx.id);
		const remPermSet = new Set(remPerms);
		const remOriginSet = new Set(remOrigins);
		const removedPerms: string[] = [];
		const removedOrigins: string[] = [];
		for (const p of current.permissions) {
			if (remPermSet.has(p)) removedPerms.push(p);
		}
		for (const o of current.origins) {
			if (remOriginSet.has(o)) removedOrigins.push(o);
		}
		const next = {
			permissions: current.permissions.filter(p => !remPermSet.has(p)),
			origins: current.origins.filter(o => !remOriginSet.has(o)),
		};
		await saveOptional(ctx.id, next);
		if (removedPerms.length > 0 || removedOrigins.length > 0) {
			this.deps.fireEventOn(ctx.id, 'chrome.permissions.onRemoved', [
				{ permissions: removedPerms, origins: removedOrigins },
			]);
		}
		return true;
	};
}
