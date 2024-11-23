// @ts-expect-error pure JS lib lmao
import { default as crh } from './src/server/index.js';

/**
 * @typedef {Object} Options
 * @property {string} [logLevel] - The log level, e.g., "debug", "info", etc.
 * @property {boolean} [reverseProxy] - Enable or disable reverse proxy.
 * @property {boolean} [disableLocalStorageSync] - Disable local storage synchronization.
 * @property {boolean} [disableHttp2] - Disable HTTP/2 support.
 */

const scopes = [
    '/rammerhead.js',
    '/hammerhead.js',
    '/transport-worker.js',
    '/task.js',
    '/iframe-task.js',
    '/worker-hammerhead.js',
    '/messaging',
    '/sessionexists',
    '/deletesession',
    '/newsession',
    '/editsession',
    '/needpassword',
    '/syncLocalStorage',
    '/api/shuffleDict',
    '/mainport'
];

const rammerheadSession = /^\/[a-z0-9]{32}/;

/**
 * Determines if the request should route through Rammerhead.
 * @param {Object} req - The HTTP request object.
 * @returns {boolean} Whether the request should be routed through Rammerhead.
 */
function shouldRouteRh(req) {
    const url = new URL(req.url, 'http://0.0.0.0'); // Default base URL for relative URLs
    return scopes.includes(url.pathname) || rammerheadSession.test(url.pathname);
}

/**
 * Routes a Rammerhead request.
 * @param {Object} rh - The Rammerhead server instance.
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object.
 */
function routeRhRequest(rh, req, res) {
    console.log(req)
    rh.emit('request', req, res);
}

/**
 * Handles a Rammerhead WebSocket upgrade.
 * @param {Object} rh - The Rammerhead server instance.
 * @param {Object} req - The HTTP request object.
 * @param {Object} socket - The network socket.
 * @param {Object} head - The initial data packet.
 */
function routeRhUpgrade(rh, req, socket, head) {
    rh.emit('upgrade', req, socket, head);
}

/**
 * Creates a new Rammerhead server instance.
 * @param {Options} options - The configuration options for Rammerhead.
 * @returns {Object} The Rammerhead server instance.
 */
function createRammerhead(options = {}) {
    return crh({
        logLevel: options.logLevel || "debug",
        reverseProxy: options.reverseProxy || false,
        disableLocalStorageSync: options.disableLocalStorageSync || false,
        disableHttp2: options.disableHttp2 || false,
    });
}

const rammerhead = {
    shouldRouteRh,
    routeRhRequest,
    routeRhUpgrade,
    createRammerhead
};

export default rammerhead;
export { createRammerhead, shouldRouteRh, routeRhRequest, routeRhUpgrade };
