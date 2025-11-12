import opentype from "opentype.js";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ttf2woff2 = require("ttf2woff2");

import { cssContent } from "./css";
import { runtime } from "./runtime";

export function fontObfuscationPlugin() {
  return {
    name: "vite-plugin-font-obfuscation",
    configureServer(server: any) {
      server.middlewares.use("/ob-fonts.css", (_req: any, res: any) => {
        res.setHeader("Content-Type", "text/css");
        res.end("/* Obfuscated fonts loading... */");
      });
      server.middlewares.use("/ob-fonts.js", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(
          "window.fontObfuscation = { encode: t => t, decode: t => t, processElement: () => {}, processExistingDOM: () => {}, isInitialized: () => false };",
        );
      });
    },
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string, ctx: any) {
        return html.replace(
          /<\/head>/,
          `    <link rel="stylesheet" href="/ob-fonts.css">
    <script>
      window.FONT_OBFUSCATION_CONFIG = {
        enabled: true,
        defaultFont: 'plusjakartasans',
        excludeInputs: false,
        obfuscateTitle: false,
        obfuscatePlaceholders: false
      };
    </script>
    <script src="/ob-fonts.js"></script>
</head>`,
        );
      },
    },
    async generateBundle(options: any, bundle: any) {
      const availableFonts = [
        {
          path: "./public/ttf/PlusJakartaSans-Regular.ttf",
          name: "plusjakartasans-obf",
        },
      ];

      function shuffle(arr: any[]) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }

      function getChineseChars(count = 52) {
        const chars: string[] = [];
        const ranges = [
          { start: 0x4e00, end: 0x9fff, priority: 1 },
          { start: 0x3400, end: 0x4dbf, priority: 2 },
        ];

        for (const range of ranges) {
          for (let i = range.start; i <= range.end; i++) {
            try {
              const ch = String.fromCodePoint(i);
              if (ch.length === 1 && ch.trim() !== "") {
                chars.push(ch);
              }
            } catch (e) {}

            if (chars.length >= count * 15) break;
          }
          if (chars.length >= count * 15) break;
        }

        const unique = [...new Set(chars)];
        shuffle(unique);

        console.log(`Got ${unique.length} CJK characters for obfuscation`);

        if (unique.length < count) {
          console.log(
            `Warning: Only found ${unique.length} characters, needed ${count}`,
          );
          return unique;
        }

        return unique.slice(0, count);
      }

      for (const fontConfig of availableFonts) {
        if (!fs.existsSync(fontConfig.path)) {
          console.log(`Font not found: ${fontConfig.path}, skipping...`);
          continue;
        }

        console.log(`Generating obfuscated font: ${fontConfig.name}`);

        const visibleChars = shuffle(
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,!?;:'\"1234567890-_()[]{}/@#$%&*+=<>|\\~`".split(
            "",
          ),
        );
        const inputChars = getChineseChars(visibleChars.length);

        if (inputChars.length < visibleChars.length) {
          console.log(`Trimming to ${inputChars.length} chars`);
          visibleChars.length = inputChars.length;
        }

        const baseFont: any = await new Promise((resolve, reject) => {
          (opentype as any).load(fontConfig.path, (err: any, font: any) => {
            if (err) reject(err);
            else resolve(font);
          });
        });

        const notdefGlyph = new opentype.Glyph({
          name: ".notdef",
          unicode: 0,
          advanceWidth: 500,
          path: new opentype.Path(),
        });

        const p = new opentype.Path();
        p.moveTo(50, 0);
        p.lineTo(450, 0);
        p.lineTo(450, 700);
        p.lineTo(50, 700);
        p.closePath();
        p.moveTo(100, 50);
        p.lineTo(100, 650);
        p.lineTo(400, 650);
        p.lineTo(400, 50);
        p.closePath();
        (notdefGlyph as any).path = p;

        const glyphs = [notdefGlyph];

        for (let i = 0; i < inputChars.length; i++) {
          const inputChar = inputChars[i];
          const outputChar = visibleChars[i];
          const sourceGlyph = baseFont.charToGlyph(outputChar);

          if (!sourceGlyph || !sourceGlyph.path) {
            console.log(`Missing glyph for ${outputChar}`);
            continue;
          }

          const g = new opentype.Glyph({
            name: `glyph_${inputChar.codePointAt(0)}`,
            unicode: inputChar.codePointAt(0),
            advanceWidth: sourceGlyph.advanceWidth,
            path: sourceGlyph.path,
          });

          glyphs.push(g);
        }

        const font = new opentype.Font({
          familyName: fontConfig.name,
          styleName: "Regular",
          unitsPerEm: baseFont.unitsPerEm || 1000,
          ascender: baseFont.ascender || 800,
          descender: baseFont.descender || -200,
          glyphs: glyphs,
        });

        const ttfBuffer = Buffer.from(font.toArrayBuffer());
        const woff2Buffer = ttf2woff2(ttfBuffer);

        this.emitFile({
          type: "asset",
          fileName: `${fontConfig.name}.ttf`,
          source: ttfBuffer,
        });

        this.emitFile({
          type: "asset",
          fileName: `${fontConfig.name}.woff2`,
          source: woff2Buffer,
        });

        const mapping: Record<string, string> = {};
        const reverseMapping: Record<string, string> = {};

        for (let i = 0; i < inputChars.length; i++) {
          mapping[inputChars[i]] = visibleChars[i];
          reverseMapping[visibleChars[i]] = inputChars[i];
        }

        this.emitFile({
          type: "asset",
          fileName: `${fontConfig.name}-mappings.json`,
          source: JSON.stringify(mapping, null, 2),
        });

        this.emitFile({
          type: "asset",
          fileName: `${fontConfig.name}-reverse-mappings.json`,
          source: JSON.stringify(reverseMapping, null, 2),
        });

        console.log(`✓ Generated obfuscated font: ${fontConfig.name}`);
      }

      this.emitFile({
        type: "asset",
        fileName: "ob-fonts.css",
        source: cssContent,
      });

      this.emitFile({
        type: "asset",
        fileName: "ob-fonts.js",
        source: runtime(),
      });

      console.log("✓ Generated obfuscated fonts CSS and JS runtime");
    },
  };
}
