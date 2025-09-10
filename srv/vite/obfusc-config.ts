import { routePaths } from "./copy";

export const obfuscationConfig = {
  enable: process.env.NODE_ENV === "production" && true,
  autoExcludeNodeModules: true,
  threadPool: true,
  options: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: process.env.NODE_ENV === "production",
    identifierNamesGenerator: "hexadecimal" as any,
    selfDefending: true,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayEncoding: [],
    stringArrayCallsTransform: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    ignoreImports: true,
  },
  exclude: [
    "**/node_modules/**",
    `**/${routePaths.scramjet}/**`,
    `**/${routePaths.uv}/**`,
    `**/${routePaths.epoxy}/**`,
    `**/${routePaths.libcurl}/**`,
    `**/${routePaths.baremux}/**`,
    `**/core/inspect.js`,
  ],
};
