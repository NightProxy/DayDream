// src/apis/nyxBridge/tabResolver-helpers.ts
//
// Re-export of group-id helpers from tabResolver. Carved out so per-namespace
// handler files can import without pulling in the full TabResolver class.

export { hashGroupId, getDdxGroupId } from './tabResolver';
