export function installConsolePolyfill(): void {
	const warn = console.warn.bind(console);
	const error = console.error.bind(console);
	const noop = (): void => {};

	self.console = {
		...console,
		log: noop,
		info: noop,
		debug: noop,
		trace: noop,
		dir: noop,
		table: noop,
		count: noop,
		time: noop,
		timeEnd: noop,
		timeLog: noop,
		group: noop,
		groupEnd: noop,
		groupCollapsed: noop,
		clear: noop,
		profile: noop,
		profileEnd: noop,
		warn,
		error
	};
}
