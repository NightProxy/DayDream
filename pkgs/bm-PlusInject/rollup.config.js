import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";
import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { execSync } from "child_process";

import pkg from "./package.json" with { type: "json" };

const commonPlugins = () => [
  nodeResolve({
    browser: true,
    preferBuiltins: false,
  }),
  commonjs(),
  typescript(),
  terser(),
  replace({
    preventAssignment: true,
    "self.BARE_MUX_VERSION": JSON.stringify(pkg.version),
    "self.BARE_MUX_COMMITHASH": (() => {
      try {
        let hash = JSON.stringify(
          execSync("git rev-parse --short HEAD", {
            encoding: "utf-8",
          }).replace(/\r?\n|\r/g, ""),
        );

        return hash;
      } catch (e) {
        return "unknown";
      }
    })(),
  }),
];

const configs = [
  {
    input: "./src/worker.ts",
    output: {
      file: "dist/worker.js",
      format: "iife",
      sourcemap: true,
      exports: "none",
    },
    plugins: commonPlugins(),
  },
];

export default configs;
