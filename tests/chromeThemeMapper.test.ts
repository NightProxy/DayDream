import { describe, test, expect } from "vitest";
import { chromeManifestToThemePreset } from "../src/utils/global/chromeThemeMapper";
import { applyChromeHsvDelta, mimeOf, base64Encode } from "../src/utils/global/chromeThemeMath";

describe("chromeThemeMapper", () => {
  test("color-only theme maps to ThemePreset", () => {
    const manifest = {
      name: "Test Theme",
      version: "1.0",
      manifest_version: 3,
      theme: {
        colors: {
          frame: [50, 50, 50],
          toolbar: [40, 40, 40],
          tab_text: [255, 255, 255],
          ntp_link: [128, 200, 100],
        },
      },
    } as any;
    const preset = chromeManifestToThemePreset(manifest, new Map(), "ext1");
    expect(preset.name).toBe("Test Theme (extension)");
    expect(preset["background-color"]).toBe("rgb(50,50,50)");
    expect(preset["tab-bg-color"]).toBe("rgb(40,40,40)");
    expect(preset["text-color"]).toBe("rgb(255,255,255)");
    expect(preset["main-color"]).toBe("rgb(128,200,100)");
  });

  test("missing fields fall back to defaults", () => {
    const manifest = { name: "Empty", version: "1", manifest_version: 3, theme: {} } as any;
    const preset = chromeManifestToThemePreset(manifest, new Map(), "ext2");
    expect(preset["background-color"]).toBe("rgb(20,18,28)");
    expect(preset["text-color"]).toBe("rgb(255,255,255)");
  });

  test("NTP background image inlines as data URL", () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const manifest = {
      name: "T",
      version: "1",
      manifest_version: 3,
      theme: { images: { theme_ntp_background: "bg.png" } },
    } as any;
    const fileMap = new Map([["bg.png", bytes]]);
    const preset = chromeManifestToThemePreset(manifest, fileMap, "ext3");
    expect(preset["background-image"]).toMatch(/^data:image\/png;base64,/);
  });

  test("tints apply HSV delta", () => {
    const manifest = {
      name: "T",
      version: "1",
      manifest_version: 3,
      theme: {
        colors: { ntp_link: [255, 0, 0] },
        tints: { buttons: [0.5, -1, -1] },
      },
    } as any;
    const preset = chromeManifestToThemePreset(manifest, new Map(), "ext4");
    expect(preset["main-color"]).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(preset["main-color"]).not.toBe("rgb(255,0,0)");
  });

  test("applyChromeHsvDelta with -1 preserves channel", () => {
    expect(applyChromeHsvDelta("rgb(100,150,200)", [-1, -1, -1])).toBe("rgb(100,150,200)");
  });

  test("mimeOf detects png/jpg/webp", () => {
    expect(mimeOf("foo.png")).toBe("image/png");
    expect(mimeOf("foo.jpg")).toBe("image/jpeg");
    expect(mimeOf("foo.webp")).toBe("image/webp");
    expect(mimeOf("foo.txt")).toBe("application/octet-stream");
  });

  test("base64Encode round-trips small bytes", () => {
    const bytes = new Uint8Array([65, 66, 67]);
    expect(base64Encode(bytes)).toBe("QUJD");
  });
});
