

self.__scramjet$config = {
  prefix: "/assets/res/",
  files: {
    wasm: "/assets/wasm.wasm",
    all: "/assets/all.js",
    sync: "/assets/sync.js",
  },
  siteFlags: {
		"https://discord.com/.*": {
			naiiveRewriter: false,
		},
	},
  flags: {
    captureErrors: false,
    cleanErrors: true,
    naiiveRewriter: false,
    rewriterLogs: false,
    scramitize: false,
    serviceworkers: false,
    sourcemaps: true,
    strictRewrites: true,
    syncxhr: false,
  },
  codec: {
    encode: (url) => {
      if (!url) return url;
      return encodeURIComponent(
        url
          .toString()
          .split("")
          .map((char, ind) =>
            ind % 2 ? String.fromCharCode(char.charCodeAt() ^ 3) : char,
          )
          .join(""),
      );
    },

    decode: (url) => {
      if (!url) return url;
      let [input, ...search] = url.split("?");

      return (
        decodeURIComponent(input)
          .split("")
          .map((char, ind) =>
            ind % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 3) : char,
          )
          .join("") + (search.length ? "?" + search.join("?") : "")
      );
    },
  },
};
