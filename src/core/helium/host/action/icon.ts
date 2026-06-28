// src/core/helium/host/action/icon.ts
//
// Icon resolution helpers. Extensions may declare default_icon as either
// a string (single icon path) or an object mapping size → path. setIcon
// can pass either path or imageData; v1 supports path only.

export type IconSpec = string | Record<string, string>;

export function pickIconForSize(spec: IconSpec | undefined, sizePx: number): string | undefined {
  if (!spec) return undefined;
  if (typeof spec === 'string') return spec;
  const keys = Object.keys(spec).map((k) => Number(k)).filter((n) => Number.isFinite(n));
  if (keys.length === 0) return undefined;
  // Prefer the smallest size >= requested
  keys.sort((a, b) => a - b);
  const ge = keys.find((k) => k >= sizePx);
  const chosen = ge ?? keys[keys.length - 1]!;
  return spec[String(chosen)];
}
