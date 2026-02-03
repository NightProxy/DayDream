//@ts-ignore
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { refluxPath } from "@nightnetwork/reflux";
//@ts-ignore
import { enigmaPath } from "@nightnetwork/enigma/path";
import path from "path";

export const routePaths = {
  epoxy: "epoxy",
  scramjet: "assets",
  libcurl: "libcurl",
  baremux: "baremux",
  uv: "data",
  reflux: "reflux",
  enigma: "enigma",
  auth: "",
  bmworker: "bmworker",
  plusClient: "plus",
  eruda: "core/i/eruda",
  chii: "core/i/chii",
  liveInject: "core/inject",
};

const authPath = path.resolve(
  "node_modules/@nightnetwork/night-auth/dist/login",
);
const plusClientPath = path.resolve("pkgs/plusClient/dist");
const bmworkerPath = path.resolve("pkgs/bm-PlusInject/dist");
const erudaPath = path.resolve("node_modules/eruda");
const chiiPath = path.resolve("node_modules/chii/public");
const liveInjectPath = path.resolve("pkgs/codeInject/dist");

const copyMap = {
  epoxy: {
    path: epoxyPath,
    files: ["*"],
    dest: routePaths.epoxy,
  },
  uv: {
    path: uvPath,
    files: [
      { name: "uv.bundle.js", rename: "bundle.js" },
      { name: "uv.handler.js", rename: "handler.js" },
      { name: "uv.client.js", rename: "client.js" },
      { name: "uv.sw.js", rename: "worker.js" },
    ],
    dest: routePaths.uv,
  },
  scramjet: {
    path: scramjetPath,
    files: [
      { name: "scramjet.all.js", rename: "all.js" },
      { name: "scramjet.sync.js", rename: "sync.js" },
      { name: "scramjet.wasm.wasm", rename: "wasm.wasm" },
    ],
    dest: routePaths.scramjet,
  },
  libcurl: {
    path: libcurlPath,
    files: ["*"],
    dest: routePaths.libcurl,
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
  liveInject: {
    path: liveInjectPath,
    files: ["*"],
    dest: routePaths.liveInject,
  },
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
