function ContentInsertionPlugin() {
  return {
    name: "advanced-obfuscation",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        if (process.env.NODE_ENV !== "production") return html;

        const decoyContent = [
          "<!-- Educational content loading... -->",
          "<!-- Document management system -->",
          "<!-- Text editor interface -->",
          "<!-- Student workspace portal -->",
        ];

        const randomDecoy =
          decoyContent[Math.floor(Math.random() * decoyContent.length)];

        return html
          .replace(/<title>([^<]*)<\/title>/, (match, title) => {
            const obfuscatedTitle = title
              .split("")
              .map((char, i) =>
                i > 0 && i % 3 === 0 ? char + "&#8203;" : char,
              )
              .join("");
            return `<title>${obfuscatedTitle}</title>`;
          })
          .replace(/<\/head>/, `    ${randomDecoy}\n</head>`)
          .replace(
            /<body[^>]*>/,
            (match) => `${match}\n    <!-- Student portal interface -->`,
          );
      },
    },
    generateBundle(options: any, bundle: any) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if ((file as any).type === "asset" && fileName.endsWith(".css")) {
          const obfuscatedName = `styles-${Math.random().toString(36).substring(2, 10)}.css`;
          bundle[obfuscatedName] = file;
          delete bundle[fileName];
        }
      }
    },
  };
}

export { ContentInsertionPlugin };
