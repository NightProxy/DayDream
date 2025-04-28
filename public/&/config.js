// See documentation for more information 

self.__dynamic$config = {
  prefix: '/&/daydream/',
  encoding: 'xor',
  mode: 'production', 
  logLevel: 3,
  tab: {
    title: 'Dynamic',
    icon: null,
    ua: null,
  },
  assets: {
    prefix: '/&/',
    files: {
      handler: 'handler.js',
      client: 'client.js',
      worker: 'worker.js',
      config: 'config.js',
      inject: null,
    }
  },
  block: [
  
  ]
};
