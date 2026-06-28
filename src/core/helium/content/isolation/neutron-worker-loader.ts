// src/core/helium/content/isolation/neutron-worker-loader.ts
//
// Inlines the neutron-worker.js IIFE bundle as a raw string so the
// host can pass it to a Worker via a Blob URL.

import neutronWorkerSrc from '../dist/neutron-worker.js?raw';
export { neutronWorkerSrc };
