import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import path from "path";
import axios from "axios";
import { URL } from "url";
import contentType from "content-type";
import fastifyStatic from "@fastify/static";

const __dirname = process.cwd();

const frontendPath = path.join(__dirname, "dist");

export default async function routes(fastify: FastifyInstance) {
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

  // Server detection endpoint for static build detection
  fastify.get(
    "/api/detect",
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply
        .status(200)
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .send({ server: true });
    },
  );

  fastify.get(
    "/api/results/:query",
    async (
      request: FastifyRequest<{
        Params: { query: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { query } = request.params;

      try {
        const response = await fetch(
          `http://api.duckduckgo.com/ac?q=${query}&format=json`,
        );
        const data = await response.json();
        return reply.send(data);
      } catch (error) {
        console.error("Error fetching search results:", error);
        return reply.status(500).send("Failed to fetch search results");
      }
    },
  );

  fastify.setNotFoundHandler(
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply
        .status(404)
        .sendFile("error/index.html", path.join(__dirname, "dist/internal"));
    },
  );
}
