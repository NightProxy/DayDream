importScripts('/&/config.js');
importScripts('/&/worker.js');

const dynamic = new Dynamic();

self.dynamic = dynamic;

async function handleRequest(event) {
    if (event.request.url.startsWith(location.origin + self.__dynamic$config.prefix)) {
        return await dynamic.fetch(event);
    }
    
    return await fetch(event.request)
}

self.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event));
});