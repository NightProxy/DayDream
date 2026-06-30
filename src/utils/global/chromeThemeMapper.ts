import type { ChromeManifest } from "@core/helium/shared/unpack/types";
import type { ThemePreset } from "@utils/global/theming";
import { applyChromeHsvDelta, base64Encode, deriveAccentPalette, mimeOf } from "./chromeThemeMath";

const rgb = (arr?: [number, number, number]): string | null =>
  arr ? `rgb(${arr.join(",")})` : null;

const fallback = (...candidates: Array<string | null>): string => {
  for (const c of candidates) if (c) return c;
  return "rgb(20,18,28)";
};

const withAlpha = (color: string, alpha: number): string => {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return color;
  return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`;
};

export function chromeManifestToThemePreset(
  manifest: ChromeManifest,
  fileMap: Map<string, Uint8Array>,
  extId: string,
): ThemePreset {
  const t = ((manifest as any).theme || {}) as {
    colors?: Record<string, [number, number, number] | undefined>;
    images?: Record<string, string | undefined>;
    tints?: Record<string, [number, number, number] | undefined>;
  };
  const colors = t.colors || {};
  const images = t.images || {};
  const tints = t.tints || {};

  const bgColor = fallback(rgb(colors.ntp_background), rgb(colors.frame));
  const tabBg = fallback(rgb(colors.toolbar), rgb(colors.frame));
  const tabActiveBg = fallback(rgb(colors.toolbar), bgColor);
  const text = fallback(rgb(colors.tab_text), rgb(colors.bookmark_text), "rgb(255,255,255)");
  const accent = fallback(rgb(colors.ntp_link), rgb(colors.toolbar_button_icon), text);

  const preset: ThemePreset = {
    name: `${(manifest as any).name} (extension)`,
    description: `Chrome theme from ${(manifest as any).name}`,
    "background-color": bgColor,
    "hover-background-color": withAlpha(bgColor, 0.85),
    "input-background-color": fallback(rgb(colors.omnibox_background), rgb(colors.button_background), tabBg),
    "tab-bg-color": tabBg,
    "tab-active-bg-color": tabActiveBg,
    "utility-background-color": tabBg,
    "dark-translucent-bg": withAlpha(bgColor, 0.7),
    "border-color": fallback(rgb(colors.frame_inactive), withAlpha(bgColor, 0.3)),
    "text-color": text,
    "hover-text-color": fallback(rgb(colors.tab_text_inactive), text),
    "active-text-color": fallback(rgb(colors.toolbar_button_icon), text),
    "main-color": accent,
    "faded-main-color": withAlpha(accent, 0.5),
    "accent-colors": deriveAccentPalette(accent, tints.buttons),
  };

  const ntpBg = images.theme_ntp_background;
  if (ntpBg && fileMap.has(ntpBg)) {
    const bytes = fileMap.get(ntpBg)!;
    preset["background-image"] = `data:${mimeOf(ntpBg)};base64,${base64Encode(bytes)}`;
  }

  if (tints.buttons) preset["main-color"] = applyChromeHsvDelta(preset["main-color"]!, tints.buttons);
  if (tints.frame) preset["background-color"] = applyChromeHsvDelta(preset["background-color"]!, tints.frame);

  const unmappable: string[] = [];
  if (images.theme_frame) unmappable.push("theme_frame");
  if (images.theme_toolbar) unmappable.push("theme_toolbar");
  if (images.theme_tab_background) unmappable.push("theme_tab_background");
  if (images.theme_window_control_background) unmappable.push("theme_window_control_background");
  if (unmappable.length) {
    console.warn(`[chromeTheme] ${extId} has unmappable fields: ${unmappable.join(", ")}`);
  }

  return preset;
}
