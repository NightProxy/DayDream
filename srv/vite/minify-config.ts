export const minifyConfig = {
  removeComments: true,
  collapseWhitespace: true,
  conservativeCollapse: false,
  preserveLineBreaks: false,
  collapseBooleanAttributes: true,
  removeAttributeQuotes: true,
  removeRedundantAttributes: true,
  preventAttributesEscaping: true,
  useShortDoctype: true,
  removeEmptyAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  removeOptionalTags: true,
  removeEmptyElements: false,
  minifyCSS: true,
  minifyJS: {
    mangle: {
      toplevel: true,
      properties: false,
      keep_fnames: false,
    },
    compress: {
      drop_console: process.env.NODE_ENV === "production",
      drop_debugger: true,
      pure_funcs: ["console.log", "console.info", "console.debug"],
      passes: 3,
    },
  },
};

/* All of these havent caused issues yet, but we should keep an eye out incase something weird happens with certain custom things
 * removeRedundantAttributes
 * removeEmptyAttributes
 * removeScriptTypeAttributes
 * removeStyleLinkTypeAttributes
 * removeOptionalTags
 */
