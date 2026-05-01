import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { refluxPath } from "@nightnetwork/reflux";
//@ts-ignore
import { enigmaPath } from "@nightnetwork/enigma/path";
import { baremuxPath as bmworkerPath } from "@nightnetwork/bm-plusworker/path";
import {tfsPath} from "@terbiumos/tfs";
import path from "path";

export const routePaths = {
  epoxy: "epoxy",
  scramjet: "assets",
  libcurl: "libcurl",
  baremux: "baremux",
  reflux: "reflux",
  enigma: "enigma",
  auth: "",
  bmworker: "bmworker",
  plusClient: "plus",
  eruda: "core/i/eruda",
  chii: "core/i/chii",
  tfs: "core/fs",
  obscura: "core/o",
  sw: "",
};

const authPath = path.resolve(
  "node_modules/@nightnetwork/night-auth/dist/login",
);
const plusClientPath = path.resolve(
  "node_modules/@nightnetwork/plus-client/dist",
);
const erudaPath = path.resolve("node_modules/eruda");
const chiiPath = path.resolve("node_modules/chii/public");
const obscuraPath = path.resolve("src/pkgs/Obscura/pkg");
const swPath = path.resolve("src/core/sw/dist");
const sjConfigPath = path.resolve("src/core/sjConfig/dist");
const sjControllerPath = path.resolve("node_modules/@mercuryworkshop/scramjet-controller/dist");
const copyMap = {
  scramjet: {
    path: scramjetPath,
    files: [
      { name: "scramjet.js", rename: "s.js" },
      { name: "scramjet.wasm", rename: "s.wasm" },
      { name: "scramjet_bundled.js", rename: "bundled.js" },
    ],
    dest: routePaths.scramjet,
  },
  baremux: {
    path: baremuxPath,
    files: ["*"],
    dest: routePaths.baremux,
  },
  reflux: {
    path: refluxPath,
    files: ["*"],
    dest: routePaths.reflux,
  },
  enigma: {
    path: enigmaPath,
    files: ["*"],
    dest: routePaths.enigma,
  },
  auth: {
    path: authPath,
    files: [
      "assets/nightloginflow.css",
      "night-login-frame.umd.js",
      "night-login.umd.js",
      "night-login.es.js.map",
      "vite.svg",
      "nightlogo.png",
      "nightloginflow.css",
      "bg_alt.jpeg",
      "nightplus.png",
      "nightplusheader.png",
      "nightplus_icon.png",
      "night-login-frame.es.js",
      "night-login.umd.js.map",
      "night-login-frame.es.js.map",
      "night-login-frame.umd.js.map",
      "night-login.es.js",
      "bg.png",
      "bg_alt_2.png",
    ],
    dest: routePaths.auth,
  },
  plusClient: {
    path: plusClientPath,
    files: ["*"],
    dest: routePaths.plusClient,
  },
  bmworker: {
    path: bmworkerPath,
    files: ["*"],
    dest: routePaths.bmworker,
  },
  eruda: {
    path: erudaPath,
    files: ["eruda.js"],
    dest: routePaths.eruda,
  },
  chii: {
    path: chiiPath,
    files: ["*"],
    dest: routePaths.chii,
  },
  tfs: {
    path: tfsPath,
    files: ["*"],
    dest: routePaths.tfs,
  },
  obscura: {
    path: obscuraPath,
    files: ["*"],
    dest: routePaths.obscura,
  },
  sw: {
    path: swPath,
    files: ["*"],
    dest: routePaths.sw,
  },
  sjConfig: {
    path: sjConfigPath,
    files: ["*"],
    dest: routePaths.scramjet,
  },
  sjController: {
    path: sjControllerPath,
    files: [
      { name: "controller.api.js", rename: "api.js" },
      { name: "controller.sw.js", rename: "sw.js" },
      {name: "controller.inject.js", rename: "inject.js"},
    ],
    dest: routePaths.scramjet,
  }
};

function generateStaticCopyTargets(map: typeof copyMap) {
  const targets: any[] = [];

  for (const key in map) {
    const entry = map[key as keyof typeof copyMap];
    const basePath = entry.path;
    const files = entry.files;

    for (const file of files) {
      if (typeof file === "string") {
        targets.push({
          src: `${basePath}/${file}`,
          dest: entry.dest,
        });
      } else {
        targets.push({
          src: `${basePath}/${file.name}`,
          dest: entry.dest,
          rename: file.rename,
        });
      }
    }
  }

  targets.push({
    src: `node_modules/eruda/eruda.js`,
    dest: "core",
    rename: "inspect.js",
  });

  return targets;
}

export function copyRoutes() {
  return {
    targets: generateStaticCopyTargets(copyMap),
  };
}
