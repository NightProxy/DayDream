
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Apply a Chrome HSV-delta tint. Chrome tint format: [h, s, v] where each is
 * either a delta in [-1..1] or the sentinel value -1 meaning "leave unchanged".
 * Hue is a multiplier of 360 (so -1 hue means "skip", 0.5 means +180°).
 */
export function applyChromeHsvDelta(rgbColor: string, tint: [number, number, number]): string {
  const m = rgbColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return rgbColor;
  const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
  const [h, s, v] = rgbToHsv(r, g, b);

  const newH = tint[0] === -1 ? h : ((tint[0] * 360) % 360 + 360) % 360;
  const newS = tint[1] === -1 ? s : Math.max(0, Math.min(1, tint[1]));
  const newV = tint[2] === -1 ? v : Math.max(0, Math.min(1, tint[2]));

  const [nr, ng, nb] = hsvToRgb(newH, newS, newV);
  return `rgb(${nr},${ng},${nb})`;
}

export function mimeOf(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function deriveAccentPalette(mainRgb: string, _tint?: [number, number, number]): string[] {
  const m = mainRgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return [mainRgb];
  const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
  const [h, s, v] = rgbToHsv(r, g, b);
  const out: string[] = [];
  for (const dh of [-60, -30, 0, 30, 60]) {
    const nh = (h + dh + 360) % 360;
    const [nr, ng, nb] = hsvToRgb(nh, s, v);
    out.push(`rgb(${nr},${ng},${nb})`);
  }
  return out;
}
