import { FastifyRequest, FastifyReply } from "fastify";

const jwtHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const targetUrl = `https://jwtauth-srv-api.night-x.com${request.url.replace("/api/plus", "")}`;

  const headers: Record<string, string> = {
    Host: "auth.night-x.com", // dont chnage this, we fucked up the jwt server to only allow this url, so yea
    "User-Agent": request.headers["user-agent"] || "DDXProxy/2.0",
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
      .header(
        "content-type",
        response.headers.get("content-type") || "application/json",
      )
      .send(data);
  } catch (error) {
    console.error("Plus API proxy error:", error);
    reply.code(500).send({ error: "Proxy request failed" });
  }
};

export { jwtHandler };
export default jwtHandler;
