//@ts-expect-error
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { scramjetPath } from "@mercuryworkshop/scramjet";
// import { refluxPath } from "@nightnetwork/reflux";

export const routePaths = {
  epoxy: "epoxy",
  scramjet: "assets",
  libcurl: "libcurl",
  baremux: "baremux",
  uv: "data",
};

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

  // Add additional targets
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
