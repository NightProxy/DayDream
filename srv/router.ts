import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import path from "path";
import fastifyStatic from "@fastify/static";
import { APIRouter } from "./api/index";

const __dirname = process.cwd();

const frontendPath = path.join(__dirname, "dist");

async function router(fastify: FastifyInstance) {
  await fastify.register(fastifyStatic, {
    root: frontendPath,
    prefix: "/",
    index: ["index.html"],
    extensions: ["html"],
    setHeaders: (res, path) => {
      if (path.includes("/res/g/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  await APIRouter(fastify);

  fastify.setNotFoundHandler(
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply
        .status(404)
        .sendFile("error/index.html", path.join(__dirname, "dist/internal"));
    },
  );
}

export { router };
export default router;