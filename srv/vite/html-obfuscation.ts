import type { Plugin } from "vite";

export function htmlObfuscationPlugin(): Plugin {
  let isProduction = false;

  return {
    name: "vite-plugin-html-obfuscation",
    enforce: "post",
    apply: "build",
    configResolved(config) {
      isProduction =
        config.mode === "production" || process.env.NODE_ENV === "production";
    },
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string, ctx: any) {
        if (!isProduction) {
          return html;
        }

        console.log(
          `✓ HTML obfuscation disabled (scripts need to execute): ${ctx.filename || "unknown"}`,
        );

        return html;
      },
    },
  };
}
