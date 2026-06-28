// src/core/helium/content/mini-chrome-loader.ts
//
// Inlines the helium-mini-chrome.js IIFE bundle as a raw string so
// the injector can register it as a scriptInjection entry. Built by
// npm run mini-chrome:build (wired into npm run build).

import miniChromeSrc from './dist/mini-chrome.js?raw';
export { miniChromeSrc };
