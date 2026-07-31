
declare module 'libcurl.js' {
	interface LibcurlFetchOptions {
		method?: string;
		headers?: Record<string, string>;
		body?: BodyInit | ArrayBuffer | undefined;
		redirect?: 'follow' | 'manual' | 'error';
		signal?: AbortSignal | undefined;
	}

	interface LibcurlFetchResult {
		status: number;
		statusText: string;
		headers: Headers;
		raw_headers?: [string, string][];
		body: ReadableStream | ArrayBuffer | string;
	}

	class HTTPSession {
		fetch(url: string, opts?: LibcurlFetchOptions): Promise<LibcurlFetchResult>;
		close(): void;
	}

	class LibcurlWebSocket extends EventTarget {
		constructor(
			url: string,
			protocols?: string[],
			opts?: { headers?: Record<string, string> }
		);
		binaryType: string;
		readyState: number;
		onopen: ((ev: Event) => unknown) | null;
		onclose: ((ev: CloseEvent) => unknown) | null;
		onerror: ((ev: Event) => unknown) | null;
		onmessage: ((ev: MessageEvent) => unknown) | null;
		send(data: ArrayBuffer | string | ArrayBufferView): void;
		close(code?: number, reason?: string): void;
	}

	interface LibcurlAPI {
		ready: boolean;
		version: { lib: string };
		transport: typeof WebSocket | string | ((url: string) => unknown);
		load_wasm(url: string): Promise<void>;
		set_websocket(url: string): void;
		HTTPSession: typeof HTTPSession;
		WebSocket: typeof LibcurlWebSocket;
		onload?: () => void;
	}

	export const libcurl: LibcurlAPI;
}

declare module 'libcurl.js/libcurl.wasm?url' {
	const url: string;
	export default url;
}
