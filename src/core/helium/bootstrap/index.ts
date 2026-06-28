export { buildEntryHtml, injectBootstrapIntoBackgroundPage } from './entryHtml';
export { serializeCtxForMeta, parseCtxFromMeta } from './ctx-encode';
export { ExtensionBridgeChannel } from './channel';
export { bootstrapSrc } from './dist-loader';
export {
  subscribeEvent,
  unsubscribeEvent,
  findOpaqueId,
  listenerCount as eventListenerCount,
} from './event-rpc';
