// src/types/raw-imports.d.ts
//
// Vite/rolldown support importing any file as a raw string via the
// `?raw` query suffix. TypeScript needs this declaration for the
// import to type-check. Used by src/core/helium/bootstrap/dist-loader.ts
// to inline the helium-bootstrap.js IIFE bundle.

declare module '*?raw' {
  const content: string;
  export default content;
}
