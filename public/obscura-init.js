// Backwards-compatibility shim.
//
// Obscura is now bootstrapped synchronously by the sjConfig bundle
// (assets/config.js) which loads before this file. That bundle attaches
// `window.__obscura` and wires the codec into `window.__scramjet$config.codec`.
//
// This file used to own that responsibility (with an encodeURIComponent stub).
// It is kept around solely so existing call sites that import or reference
// `obscura-init.js` continue to work without changes. It is intentionally a
// no-op when `__obscura` is already present, and just warns otherwise — we no
// longer install a fallback codec because that masks real load failures and
// would silently produce non-Obscura URLs that decode would reject.

(() => {
	if (self.__obscura && typeof self.__obscura.encode === 'function') {
		// sjConfig already initialized Obscura — nothing to do.
		return;
	}

	console.warn(
		'[obscura-init] __obscura not found on global; sjConfig may have failed to load.'
	);
})();
