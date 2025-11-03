import { routePaths } from "./copy";

// Heavy obfuscation :o
export const obfuscationConfig = {
  enable: process.env.NODE_ENV === "production",
  autoExcludeNodeModules: true,
  threadPool: true, // CRITICAL: Enable parallel processing
  log: false, // Disable logging for faster builds
  options: {
    // Core obfuscation settings
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.3, // Reduced from 0.5 for speed

    // Dead code injection for stealth (minimal threshold)
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.1, // Reduced from 0.2 for speed

    // Debug protection
    debugProtection: false,
    debugProtectionInterval: 0,

    // Console output control
    disableConsoleOutput: process.env.NODE_ENV === "production",

    // Identifier obfuscation
    identifierNamesGenerator: "hexadecimal" as const,

    // Self-defending code
    selfDefending: true,

    // Code simplification
    simplify: true,

    // String obfuscation (optimized for speed)
    splitStrings: true,
    splitStringsChunkLength: 15, // Increased from 10 for faster processing
    stringArray: true,
    stringArrayCallsTransform: false, // DISABLED - very expensive
    stringArrayCallsTransformThreshold: 0,
    stringArrayEncoding: [], // DISABLED - encoding is expensive
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: false,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: "variable" as const,
    stringArrayThreshold: 0.6, // Reduced from 0.75

    // Object keys transformation
    transformObjectKeys: false, // DISABLED - expensive, moderate benefit

    // Unicode escape sequences
    unicodeEscapeSequence: false,

    // Additional settings
    ignoreImports: true,
    numbersToExpressions: false, // DISABLED - expensive
    renameGlobals: false,
    renameProperties: false,
    seed: Math.floor(Math.random() * 100000),
    sourceMap: false,
    target: "browser" as const,
  },
  exclude: [
    "**/node_modules/**",
    `**/${routePaths.scramjet}/**`,
    `**/${routePaths.uv}/**`,
    `**/${routePaths.epoxy}/**`,
    `**/${routePaths.libcurl}/**`,
    `**/${routePaths.baremux}/**`,
    `**/${routePaths.reflux}/**`,
    `**/core/inspect.js`,
    // Exclude font obfuscation files to prevent double-obfuscation
    "**/ob-fonts.js",
    "**/poppins-obf*.json",
    // Exclude vendor chunks for faster builds (already minified)
    "**/vendor-*.js",
    "**/chunks/vendor*.js",
    // Exclude CSS and assets
    "**/*.css",
    "**/*.json",
    "**/*.woff2",
    "**/*.ttf",
    "**/*.png",
    "**/*.jpg",
    "**/*.svg",
    "**/*.gif",
    "**/*.webp",
    "**/*.mp4",
    "**/*.webm",
    "**/*.ogg",
    "**/*.mp3",
    "**/*.wav",
    "**/*.flac",
    "**/*.aac",
    "**/*.eot",
    "**/*.otf",
    "**/*.woff",
    "**/*.ico",
    "**/*.pdf",
  ],
};
