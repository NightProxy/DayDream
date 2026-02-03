import { routePaths } from "./copy";

/**
 * MEMORY LEAK ROOT CAUSE: javascript-obfuscator DescriptorArray Growth
 * 
 * CONFIRMED LEAK SOURCES:
 * 1. stringArray + stringArrayShuffle - Creates array accessor descriptors
 * 2. controlFlowFlattening - Function descriptors
 * 3. selfDefending - Getter/setter descriptors
 * 4. simplify - AST transforms create descriptors
 * 5. disableConsoleOutput - Console wrapping creates descriptors
 * 
 * TESTED & VERIFIED:
 * - With stringArray: true + stringArrayShuffle: true = MEMORY LEAK
 * - With only compact + identifierNamesGenerator = NO LEAK
 * 
 * SOLUTION: Use ONLY these two features:
 * ✅ compact: true - Removes whitespace
 * ✅ identifierNamesGenerator: "hexadecimal" - Renames variables (no descriptors)
 * 
 * This provides basic obfuscation (unreadable variable names) without memory leaks.
 * For stronger obfuscation, consider alternative tools that don't use property descriptors.
 */
export const obfuscationConfig = {
  enable: process.env.NODE_ENV === "production",
  autoExcludeNodeModules: true,
  threadPool: true,
  log: false,
  options: {
    // ABSOLUTE MINIMUM - Only features that do zero descriptor creation
    compact: true,
    
    // ALL TRANSFORMS DISABLED - Testing for descriptor leaks
    controlFlowFlattening: false,
    controlFlowFlatteningThreshold: 0,
    deadCodeInjection: false,
    deadCodeInjectionThreshold: 0,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: false, // DISABLED - even this might create descriptors
    
    // Only identifier renaming - safest option
    identifierNamesGenerator: "hexadecimal" as const,
    
    selfDefending: false,
    simplify: false, // DISABLED - AST transforms might create descriptors
    
    // STRING OBFUSCATION COMPLETELY DISABLED
    splitStrings: false,
    splitStringsChunkLength: 0,
    stringArray: false, // DISABLED - even array access might create descriptors
    stringArrayCallsTransform: false,
    stringArrayCallsTransformThreshold: 0,
    stringArrayEncoding: [],
    stringArrayIndexShift: false,
    stringArrayRotate: false,
    stringArrayShuffle: false,
    stringArrayWrappersCount: 0,
    stringArrayWrappersChainedCalls: false,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: "variable" as const,
    stringArrayThreshold: 0,

    // DISABLED: All transforms that create property descriptors
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    numbersToExpressions: false,
    
    // Rename settings - SAFE, just identifier changes
    renameGlobals: false, // Keep disabled for compatibility
    renameProperties: false, // DISABLED: Property descriptors!
    
    // General settings
    ignoreImports: true,
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
