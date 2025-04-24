viteStaticCopy({
      targets: [
        {
          src: normalizePath(`${libcurlPath}/**/*.mjs`),
          dest: 'libcurl',
          overwrite: false,
        },
        {
          src: normalizePath(`${epoxyPath}/**/*.mjs`),
          dest: 'epoxy',
          overwrite: false,
        },
        {
          src: normalizePath(`${baremuxPath}/**/*.js`),
          dest: 'baremux',
          overwrite: false,
        },
        {
          src: normalizePath(`${uvPath}/uv.bundle.js`),
          dest: '@/bundle.js',
          overwrite: false,
        },
      ],
    }),
    {
      name: 'viteserver',
      configureServer(server) {
        server.httpServer?.on('upgrade', (req, socket, head) => {
          if (req.url?.startsWith('/wisp/')) {
            wisp.routeRequest(req, socket, head);
          }
        });
      },
    },