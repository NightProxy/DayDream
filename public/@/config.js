self.__uv$config = {
  prefix: "/@/daydream/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/@/handler.js",
  client: "/@/client.js",
  bundle: "/@/bundle.js",
  config: "/@/config.js",
  sw: "/@/sww.js",
};
