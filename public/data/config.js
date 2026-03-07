var _b = self.__ddxBase || "/";

self.__uv$config = {
  prefix: _b + "data/int/",

  encodeUrl: function encode(str) {
    if (!str) return str;
    return encodeURIComponent(
      str
        .toString()
        .split("")
        .map((char, ind) =>
          ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 3) : char,
        )
        .join(""),
    );
  },
  decodeUrl: function decode(str) {
    if (!str) return str;
    let [input, ...search] = str.split("?");

    return (
      decodeURIComponent(input)
        .split("")
        .map((char, ind) =>
          ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char,
        )
        .join("") + (search.length ? "?" + search.join("?") : "")
    );
  },
  handler: _b + "data/handler.js",
  client: _b + "data/client.js",
  bundle: _b + "data/bundle.js",
  config: _b + "data/config.js",
  sw: _b + "data/worker.js",
};
