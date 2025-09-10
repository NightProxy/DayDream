import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

function plusAPI(app: FastifyInstance) {
  // Proxy all requests to the external auth service
  app.all(
    "/api/plus/*",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const targetUrl = `https://jwtauth-srv-api.night-x.com${request.url.replace("/api/plus", "")}`;

      const headers: Record<string, string> = {
        Host: "auth.night-x.com",
        "User-Agent": request.headers["user-agent"] || "FastifyProxy/1.0",
      };

      // Forward relevant headers
      const headersToForward = [
        "authorization",
        "content-type",
        "accept",
        "x-forwarded-for",
      ];
      headersToForward.forEach((header) => {
        if (request.headers[header]) {
          headers[header] = request.headers[header] as string;
        }
      });

      try {
        const response = await fetch(targetUrl, {
          method: request.method,
          headers,
          body:
            request.method !== "GET" && request.method !== "HEAD"
              ? JSON.stringify(request.body)
              : undefined,
        });

        const data = await response.text();

        reply
          .code(response.status)
          .headers(Object.fromEntries(response.headers.entries()))
          .send(data);
      } catch (error) {
        reply.code(500).send({ error: "Proxy request failed" });
      }
    },
  );
}

export { plusAPI };
