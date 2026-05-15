import { NightFS } from '@apis/data/fs';
import type { FSType } from '@terbiumos/tfs';

import { basePath } from '@core/shared/path';
import { resolveInternalHtml } from '@core/sw/req';

const CACHE_ROOT = '/cache';

const fsState: {
	store: FSType | null;
	ready: Promise<FSType> | null;
} = {
	store: null,
	ready: null
};

function dirname(path: string): string {
	if (path === '/') return '/';
	const idx = path.lastIndexOf('/');
	if (idx <= 0) return '/';
	return path.slice(0, idx);
}

function cachePath(relativePath: string): string {
	return `${CACHE_ROOT}${relativePath.startsWith('/') ? relativePath : `/${relativePath}`}`;
}

async function exists(store: FSType, path: string): Promise<boolean> {
	return new Promise(resolve => {
		store.exists(path, resolve);
	});
}

async function mkdir(store: FSType, path: string): Promise<void> {
	return new Promise((resolve, reject) => {
		store.mkdir(path, err => (err ? reject(err) : resolve()));
	});
}

async function readFileUtf8(store: FSType, path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		store.readFile(path, 'utf8', (err, content) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(content as string);
		});
	});
}

async function writeFileUtf8(
	store: FSType,
	path: string,
	content: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		store.writeFile(path, content, 'utf8', err =>
			err ? reject(err) : resolve()
		);
	});
}

async function readFileBinary(
	store: FSType,
	path: string
): Promise<Uint8Array> {
	return new Promise((resolve, reject) => {
		store.readFile(path, (err, content) => {
			if (err) {
				reject(err);
				return;
			}
			if (content instanceof Uint8Array) {
				resolve(content);
				return;
			}
			resolve(new Uint8Array(content as ArrayBuffer));
		});
	});
}

async function writeFileBinary(
	store: FSType,
	path: string,
	content: Uint8Array
): Promise<void> {
	return new Promise((resolve, reject) => {
		store.writeFile(path, content, err => (err ? reject(err) : resolve()));
	});
}

async function ensureDir(store: FSType, path: string): Promise<void> {
	if (path === '/' || path === '') return;

	const parts = path.split('/').filter(Boolean);
	let current = '';

	for (const part of parts) {
		current += `/${part}`;
		if (await exists(store, current)) continue;
		await mkdir(store, current);
	}
}

async function getStore(): Promise<FSType> {
	if (fsState.store) return fsState.store;

	if (!fsState.ready) {
		fsState.ready = (async () => {
			const nfs = new NightFS();
			await nfs.init;
			const store = nfs.core.fs;
			await ensureDir(store, CACHE_ROOT);
			fsState.store = store;
			return store;
		})();
	}

	return fsState.ready;
}

async function writeCacheFile(
	relativePath: string,
	body: string
): Promise<void> {
	const store = await getStore();
	const path = cachePath(relativePath);
	await ensureDir(store, dirname(path));
	await writeFileUtf8(store, path, body);
}

async function readCacheFile(relativePath: string): Promise<string | null> {
	const store = await getStore();
	const path = cachePath(relativePath);
	if (!(await exists(store, path))) return null;

	try {
		return await readFileUtf8(store, path);
	} catch {
		return null;
	}
}

async function writeCacheBinaryFile(
	relativePath: string,
	body: Uint8Array
): Promise<void> {
	const store = await getStore();
	const path = cachePath(relativePath);
	await ensureDir(store, dirname(path));
	await writeFileBinary(store, path, body);
}

async function readCacheBinaryFile(
	relativePath: string
): Promise<Uint8Array | null> {
	const store = await getStore();
	const path = cachePath(relativePath);
	if (!(await exists(store, path))) return null;

	try {
		return await readFileBinary(store, path);
	} catch {
		return null;
	}
}

function cacheMetaPath(relativePath: string): string {
	return `${relativePath}.meta.json`;
}

async function writeCacheMeta(
	relativePath: string,
	meta: { contentType: string }
): Promise<void> {
	await writeCacheFile(cacheMetaPath(relativePath), JSON.stringify(meta));
}

async function readCacheMeta(
	relativePath: string
): Promise<{ contentType: string } | null> {
	const raw = await readCacheFile(cacheMetaPath(relativePath));
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { contentType?: unknown };
		if (
			typeof parsed.contentType === 'string' &&
			parsed.contentType.length > 0
		) {
			return { contentType: parsed.contentType };
		}
		return null;
	} catch {
		return null;
	}
}

function buildFetchPath(relativePath: string): string {
	return basePath + relativePath.replace(/^\//, '');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength
	) as ArrayBuffer;
}

export async function serveInternalPage(
	relativePath: string
): Promise<Response> {
	const htmlRelative = resolveInternalHtml(relativePath);
	const fetchPath = buildFetchPath(htmlRelative);

	try {
		const response = await fetch(fetchPath);
		if (response.ok) {
			const text = await response.clone().text();
			await writeCacheFile(htmlRelative, text);

			const headers = new Headers(response.headers);
			headers.set('Content-Type', 'text/html; charset=utf-8');
			return new Response(text, {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		}

		return response;
	} catch (err) {
		const cached = await readCacheFile(htmlRelative);
		if (cached !== null) {
			console.warn(
				`[DDXWorker] Network failed for ${relativePath}, serving from fs cache`
			);
			return new Response(cached, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			});
		}

		console.error(
			`[DDXWorker] Failed to serve internal page: ${relativePath}`,
			err
		);
		return new Response('Page not found', {
			status: 404,
			headers: { 'Content-Type': 'text/plain' }
		});
	}
}

export async function serveJsonFile(relativePath: string): Promise<Response> {
	const fetchPath = buildFetchPath(relativePath);

	try {
		const response = await fetch(fetchPath);
		if (response.ok) {
			const text = await response.clone().text();
			await writeCacheFile(relativePath, text);

			const headers = new Headers(response.headers);
			headers.set('Content-Type', 'application/json; charset=utf-8');
			return new Response(text, {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		}

		const cached = await readCacheFile(relativePath);
		if (cached !== null) {
			return new Response(cached, {
				status: 200,
				headers: {
					'Content-Type': 'application/json; charset=utf-8'
				}
			});
		}

		return response;
	} catch (err) {
		const cached = await readCacheFile(relativePath);
		if (cached !== null) {
			return new Response(cached, {
				status: 200,
				headers: {
					'Content-Type': 'application/json; charset=utf-8'
				}
			});
		}

		console.error(
			`[DDXWorker] Failed to serve json file: ${relativePath}`,
			err
		);
		return new Response('JSON not available', {
			status: 503,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8'
			}
		});
	}
}

export async function serveResFile(relativePath: string): Promise<Response> {
	const fetchPath = buildFetchPath(relativePath);

	try {
		const response = await fetch(fetchPath);
		if (response.ok) {
			const bytes = new Uint8Array(await response.clone().arrayBuffer());
			await writeCacheBinaryFile(relativePath, bytes);

			const headers = new Headers(response.headers);
			const contentType =
				headers.get('Content-Type') || 'application/octet-stream';
			headers.set('Content-Type', contentType);
			await writeCacheMeta(relativePath, { contentType });
			return new Response(toArrayBuffer(bytes), {
				status: response.status,
				statusText: response.statusText,
				headers
			});
		}

		const cached = await readCacheBinaryFile(relativePath);
		if (cached !== null) {
			const meta = await readCacheMeta(relativePath);
			return new Response(toArrayBuffer(cached), {
				status: 200,
				headers: {
					'Content-Type':
						meta?.contentType || 'application/octet-stream'
				}
			});
		}

		return response;
	} catch (err) {
		const cached = await readCacheBinaryFile(relativePath);
		if (cached !== null) {
			const meta = await readCacheMeta(relativePath);
			return new Response(toArrayBuffer(cached), {
				status: 200,
				headers: {
					'Content-Type':
						meta?.contentType || 'application/octet-stream'
				}
			});
		}

		console.error(
			`[DDXWorker] Failed to serve /res file: ${relativePath}`,
			err
		);
		return new Response('Resource not available', {
			status: 503,
			headers: {
				'Content-Type': 'text/plain; charset=utf-8'
			}
		});
	}
}

export async function primeJsonCache(): Promise<void> {
	const jsonFiles = [
		'/json/g.json',
		'/json/c.json',
		'/json/p.json',
		'/json/t.json'
	];

	await Promise.all(
		jsonFiles.map(async relativePath => {
			try {
				const response = await fetch(buildFetchPath(relativePath));
				if (!response.ok) return;
				const text = await response.text();
				await writeCacheFile(relativePath, text);
			} catch (err) {
				console.warn(
					`[DDXWorker] Failed to pre-cache ${relativePath}:`,
					err
				);
			}
		})
	);
}
