declare global {
  var __ddxBase: string | undefined;
}

export const basePath: string = globalThis.__ddxBase || "/";

export function resolvePath(path: string): string {
  return basePath + path.replace(/^\//, "");
}
