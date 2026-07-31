export type StorageOperation =
	| 'health'
	| 'getItem'
	| 'setItem'
	| 'mergeItem'
	| 'removeItem'
	| 'clear'
	| 'keys';

export interface StorageWorkerRequest {
	id: number;
	/**
	 * Profile scope for the request. Defaults to the legacy '__default__' bucket
	 * when a caller has not yet been migrated to profile-aware routing.
	 */
	profileId?: string;
	operation: StorageOperation;
	filePath: string;
	folderPath: string;
	key?: string;
	value?: unknown;
}

export type StorageWorkerErrorKind = 'transport' | 'service';

export type StorageWorkerResponse =
	| { id: number; ok: true; value?: unknown }
	| {
			id: number;
			ok: false;
			error: string;
			errorKind: StorageWorkerErrorKind;
	  };

export const DEFAULT_PROFILE_ID = '__default__';

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isReservedKey(key: string): boolean {
	return RESERVED_KEYS.has(key);
}
