/**
 * Runs inside the chii front_end iframe BEFORE chii_app.js loads.
 *
 * Monkey-patches window.WebSocket so when chii_app opens its CDP
 * socket, we hand back a fake WebSocket whose `send` posts to
 * window.parent and whose 'message' events are synthesized from
 * parent messages.
 *
 * The chii front_end reads `?ws=<value>` from its URL and uses that
 * value to construct the CDP socket URL — typically `ws://<value>/`.
 * We pass `?ws=ddx-bridge` in the wrapper HTML, so the front_end
 * constructs `ws://ddx-bridge/`. The sentinel below matches that.
 *
 * Posts `{ kind: 'devtools-ready' }` to the parent once the fake
 * socket fires 'open' so the host can flush queued frame events.
 */
(function () {
	const NativeWebSocket = window.WebSocket;
	// Match URL strings constructed from `?ws=ddx-bridge` (the chii
	// fork builds `ws://ddx-bridge/` or `ws://ddx-bridge`). We also
	// match `ws=ddx-bridge` for callers that pass the query string
	// form directly.
	function isShimUrl(u) {
		if (typeof u !== 'string') return false;
		return u.indexOf('ddx-bridge') !== -1;
	}

	class FakeWebSocket {
		constructor(url) {
			this.url = url;
			this.readyState = 0; // CONNECTING
			this.binaryType = 'arraybuffer';
			this._listeners = { open: [], message: [], close: [], error: [] };
			this.onopen = null;
			this.onmessage = null;
			this.onclose = null;
			this.onerror = null;
			Promise.resolve().then(() => {
				this.readyState = 1; // OPEN
				this._fire('open', { type: 'open' });
				try {
					window.parent.postMessage({ kind: 'devtools-ready' }, '*');
				} catch (_) {}
			});
			window.addEventListener('message', (ev) => {
				const d = ev && ev.data;
				if (!d || typeof d !== 'object') return;
				if (d.kind !== 'cdp-to-devtools') return;
				if (typeof d.payload !== 'string') return;
				this._fire('message', { type: 'message', data: d.payload });
			});
		}
		addEventListener(type, fn) {
			if (this._listeners[type]) this._listeners[type].push(fn);
		}
		removeEventListener(type, fn) {
			if (!this._listeners[type]) return;
			this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
		}
		_fire(type, event) {
			const onProp = this['on' + type];
			if (typeof onProp === 'function') {
				try {
					onProp.call(this, event);
				} catch (_) {}
			}
			for (const fn of this._listeners[type]) {
				try {
					fn.call(this, event);
				} catch (_) {}
			}
		}
		send(data) {
			if (this.readyState !== 1) return;
			const payload = typeof data === 'string' ? data : String(data);
			try {
				window.parent.postMessage(
					{ kind: 'cdp-from-devtools', payload },
					'*'
				);
			} catch (_) {}
		}
		close() {
			if (this.readyState === 3) return;
			this.readyState = 3; // CLOSED
			this._fire('close', { type: 'close', code: 1000 });
		}
	}

	const ShimmedWebSocket = function (url, protocols) {
		if (isShimUrl(url)) {
			return new FakeWebSocket(url);
		}
		return new NativeWebSocket(url, protocols);
	};
	ShimmedWebSocket.CONNECTING = 0;
	ShimmedWebSocket.OPEN = 1;
	ShimmedWebSocket.CLOSING = 2;
	ShimmedWebSocket.CLOSED = 3;
	ShimmedWebSocket.prototype = NativeWebSocket.prototype;

	window.WebSocket = ShimmedWebSocket;
})();
