import { build } from "esbuild";

const makeAllPackagesExternalPlugin = {
	name: 'make-all-packages-external',
	setup(build) {
		let filter = /^[^.\/]|^\.[^.\/]|^\.\.[^\/]/
		build.onResolve({ filter }, args => ({ path: args.path, external: true }))
	},
};

build({
	bundle: true,
	format: "esm",
	entryPoints: [`./src/index.ts`],
	outfile: `./dist/index.mjs`,
	plugins: [],
	external: ["@nightnetwork/enigma"],
	logLevel: "info",
	minify: true,
	sourcemap: true,
	treeShaking: true,
	platform: "browser",
	target: "es2020"
}).catch(() => process.exit(1));

build({
	bundle: true,
	format: "cjs",
	entryPoints: [`./src/index.ts`],
	outfile: `./dist/index.js`,
	plugins: [],
	external: ["@nightnetwork/enigma"],
	logLevel: "info",
	minify: true,
	sourcemap: true,
	treeShaking: true,
	platform: "browser",
	target: "es2020"
}).catch(() => process.exit(1));

build({
	bundle: true,
	format: "esm",
	entryPoints: [`./src/enigma-module.ts`],
	outfile: `./dist/module.mjs`,
	plugins: [],
	external: ["@nightnetwork/enigma"],
	logLevel: "info",
	minify: true,
	sourcemap: true,
	treeShaking: true,
	platform: "browser",
	target: "es2020"
}).catch(() => process.exit(1));

console.log('Build complete');
