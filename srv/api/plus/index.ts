import { FastifyInstance } from "fastify";
import { authHandler } from "./authHandler";
import { jwtHandler } from "./jwtHandler";

function plusAPI(app: FastifyInstance) {
  // /api/plus/* → Night+ auth backend (jwtauth-srv-api.night-x.com).
  //
  // Captcha endpoints are NOT proxied through this server. They live on
  // `https://nightplus.night-x.com/v1/captcha/*` and are called from the
  // host page directly via `window.proxy.fetch` (which tunnels through
  // the active Wisp transport, bypassing CORS). This matches Daylight's
  // architecture 1:1 — see `src/apis/captcha/backend.ts` for the client
  // side and `Daylight/src/lib/turnstile/widgetSolver.ts` for the
  // upstream reference.
  app.all("/api/plus/*", jwtHandler);

  app.all("/auth", authHandler);
  app.all("/auth/*", authHandler);
}

export { plusAPI };
