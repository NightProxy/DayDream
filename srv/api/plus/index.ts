import { FastifyInstance } from "fastify";
import { authHandler } from "./authHandler";
import { jwtHandler } from "./jwtHandler";

function plusAPI(app: FastifyInstance) {
  app.all("/api/plus/*", jwtHandler);
  app.all("/auth", authHandler);
  app.all("/auth/*", authHandler);
}

export { plusAPI };
