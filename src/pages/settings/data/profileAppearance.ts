
import type { ProfileAppearance } from "../../../apis/profiles/types";

const COLOR_PRESETS = [
  "#cba6f7", // mauve (default --main)
  "#f5c2e7", // pink
  "#f38ba8", // red/rose
  "#fab387", // peach
  "#f9e2af", // yellow
  "#a6e3a1", // green
  "#94e2d5", // teal
  "#89b4fa", // blue
];

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return h >>> 0;
}

export function autoColorForId(id: string): string {
  return COLOR_PRESETS[hashString(id) % COLOR_PRESETS.length];
}

export function resolveAppearance(id: string, appearance: ProfileAppearance | undefined): ProfileAppearance {
  if (appearance && appearance.color !== "auto") return appearance;
  const color = appearance?.color === "auto" ? autoColorForId(id) : (appearance?.color ?? autoColorForId(id));
  return {
    avatarType: appearance?.avatarType ?? "letter",
    avatarIcon: appearance?.avatarIcon,
    avatarImage: appearance?.avatarImage,
    color,
  };
}

export function darkenColor(hex: string, amount = 0.45): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

export interface AvatarRenderOpts {
  size?: number;
  fontSize?: number;
}

export function createAvatar(id: string, appearance: ProfileAppearance | undefined, opts: AvatarRenderOpts = {}): HTMLElement {
  const size = opts.size ?? 32;
  const fontSize = opts.fontSize ?? Math.round(size * 0.45);
  const resolved = resolveAppearance(id, appearance);
  const el = document.createElement("div");
  el.className = "profile-avatar";
  el.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-weight: 700;
    font-size: ${fontSize}px;
    color: var(--bg-2);
    background: linear-gradient(135deg, ${resolved.color}, ${darkenColor(resolved.color)});
    overflow: hidden;
  `;
  if (resolved.avatarType === "image" && resolved.avatarImage) {
    el.style.background = `center / cover no-repeat url("${resolved.avatarImage}")`;
  } else if (resolved.avatarType === "icon" && resolved.avatarIcon) {
    const i = document.createElement("i");
    i.setAttribute("data-lucide", resolved.avatarIcon);
    i.style.cssText = `width: ${Math.round(size * 0.55)}px; height: ${Math.round(size * 0.55)}px;`;
    el.appendChild(i);
  } else {
    el.textContent = (id.charAt(0) || "?").toUpperCase();
  }
  return el;
}

export const AVATAR_COLOR_PRESETS = COLOR_PRESETS;
export const AVATAR_ICON_PRESETS = [
  "user", "briefcase", "gamepad-2", "graduation-cap", "heart", "star", "rocket", "flame",
];
