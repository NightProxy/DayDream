
export type IconSpec = string | Record<string, string>;

export function pickIconForSize(spec: IconSpec | undefined, sizePx: number): string | undefined {
  if (!spec) return undefined;
  if (typeof spec === 'string') return spec;
  const keys = Object.keys(spec).map((k) => Number(k)).filter((n) => Number.isFinite(n));
  if (keys.length === 0) return undefined;
  keys.sort((a, b) => a - b);
  const ge = keys.find((k) => k >= sizePx);
  const chosen = ge ?? keys[keys.length - 1]!;
  return spec[String(chosen)];
}
