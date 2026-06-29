export interface ProtocolRoute {
	proto: string;
	path: string;
	url: string;
	urlResolver?: 'basepath';
	proxy: boolean;
}

export const BUILTIN_PROTOCOL_ROUTES: ProtocolRoute[] = [
	{ proto: 'ddx', path: 'newtab', url: 'internal/newtab', urlResolver: 'basepath', proxy: false },
	{ proto: 'ddx', path: 'home',   url: 'internal/newtab', urlResolver: 'basepath', proxy: false },
	{ proto: 'ddx', path: 'games', url: 'https://gointospace.app', urlResolver: undefined, proxy: true },
	{ proto: 'ddx', path: 'ai', url: 'https://proper-roll-pleasant-seq.trycloudflare.com/', urlResolver: undefined, proxy: true },
	{ proto: 'ddx', path: '*',      url: 'internal',        urlResolver: 'basepath', proxy: false },
];