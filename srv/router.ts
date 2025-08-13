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
  });

  fastify.get(
    "/results/:query",
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

  fastify.get(
    "/internal/icons/*",
    async (
      request: FastifyRequest<{
        Params: { "*": string };
      }>,
      reply: FastifyReply,
    ) => {
      let url = request.params["*"];

      url = url.replace(/https?:\/?/g, "");

      let proxiedUrl: string;

      try {
        proxiedUrl = "https://icon.horse/icon/" + url;
      } catch (err) {
        console.error(
          `Failed to decode or decrypt URL: ${err}` + `URL: ${url}`,
        );
        return reply.status(400).send("Invalid URL");
      }

      try {
        const assetUrl = new URL(proxiedUrl);
        const assetResponse = await axios.get(assetUrl.toString(), {
          responseType: "arraybuffer",
        });

        const contentTypeHeader = assetResponse.headers["content-type"];
        const parsedContentType = contentTypeHeader
          ? contentType.parse(contentTypeHeader).type
          : "application/octet-stream";

        reply.header("Content-Type", parsedContentType);
        return reply.send(Buffer.from(assetResponse.data));
      } catch (err) {
        console.error(`Failed to fetch proxied URL: ${err}`);
        return reply.status(500).send("Failed to fetch proxied URL");
      }
    },
  );

  // 404 handler
  fastify.setNotFoundHandler(
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply
        .status(404)
        .sendFile("error/index.html", path.join(__dirname, "dist/internal"));
    },
  );
}
