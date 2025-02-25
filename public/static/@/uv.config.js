self.__uv$config = {
  prefix: "/@/daydream/",
  encodeUrl: Ultraviolet.codec.base64.encode,
  decodeUrl: Ultraviolet.codec.base64.decode,
  handler: "/@/uv.handler.js",
  client: "/@/uv.client.js",
  bundle: "/@/uv.bundle.js",
  config: "/@/uv.config.js",
  sw: "/@/uv.sw.js",
};
