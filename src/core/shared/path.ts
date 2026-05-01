const ddxBase = self.location.pathname.replace(/[^/]*$/, '');
self.__ddxBase = ddxBase;

export const basePath = ddxBase;

export function stripBase(pathname: string): string {
	if (basePath !== '/' && pathname.startsWith(basePath)) {
		return '/' + pathname.slice(basePath.length);
	}

	return pathname;
}
