import { getAdblockRules } from "@core/sw/ads";

export function wildcardToRegex(pattern: string): RegExp {
	return new RegExp(
		'^' +
			pattern
				.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
				.replace(/\*\*/g, '.*')
				.replace(/\*/g, '[^/]*') +
			'$',
		'i'
	);
}

export function isCfRequest(url: string, patterns: string[]): boolean {
	return patterns.map(wildcardToRegex).some(rule => rule.test(url));
}

export function isAdRequest(url: string, request: Request | null): boolean {
  if ((getAdblockRules().map(wildcardToRegex)).some(r => r.test(url))) return true;

  try {
    const p = new URL(url);

    if (
      p.hostname === 'pagead2.googlesyndication.com' ||
      p.hostname.endsWith('.googlesyndication.com') ||
      p.hostname.endsWith('.doubleclick.net') ||
      p.hostname.endsWith('.media.net')
    )
      return true;

    if (request?.destination === 'script') {
      if (/ads|adservice|pagead|doubleclick|googlesyndication|analytics/i.test(p.pathname))
        return true;
    }
	//@ts-expect-error
    if (request?.destination === 'ping') return true;

    if (p.search && /(utm_|gclid|fbclid|ad|ads|tracking|pixel)/i.test(p.search)) {
      return true;
    }
  } catch {}

  return false;
}

export function shouldRestoreRequest(
	relativePath: string,
	restoredEndpoints: string[]
): boolean {
	return restoredEndpoints.some(endpoint =>
		relativePath.startsWith(endpoint)
	);
}

export function isServerRoutedEndpoint(
	relativePath: string,
	serverRoutedEndpoints: string[]
): boolean {
	return serverRoutedEndpoints.some(endpoint =>
		relativePath.startsWith(endpoint)
	);
}

export function isInternalRoute(relativePath: string): boolean {
	return relativePath.startsWith('/internal/');
}

export function isJsonCacheRoute(relativePath: string): boolean {
	return relativePath.startsWith('/json/') && relativePath.endsWith('.json');
}

export function resolveInternalHtml(relativePath: string): string {
	const clean = relativePath.replace(/\/+$/, '');
	if (/\.\w+$/.test(clean)) return clean;
	return `${clean}/index.html`;
}

export function createCorsPreflightResponse(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': '*',
			'Access-Control-Max-Age': '86400'
		}
	});
}

export function getErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}
