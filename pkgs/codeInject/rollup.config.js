import typescript from "rollup-plugin-typescript2";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: "src/main.ts",
    output: [
      {
        file: "dist/codeInject.js",
        format: "umd",
        name: "CodeInject",
        sourcemap: true,
      },
      {
        file: "dist/codeInject.esm.js",
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        useTsconfigDeclarationDir: true,
      }),
      terser(),
    ],
  },
  {
    input: "src/iframeClient.ts",
    output: [
      {
        file: "dist/iframeClient.js",
        format: "umd",
        name: "IframeClient",
        sourcemap: true,
      },
      {
        file: "dist/iframeClient.esm.js",
        format: "es",
        sourcemap: true,
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.json",
        useTsconfigDeclarationDir: true,
      }),
      terser(),
    ],
  },
];
