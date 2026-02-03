import { FastifyRequest, FastifyReply } from "fastify";

const authHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const targetUrl = `https://demoplussrv.night-x.com${request.url}`;

  const headers: Record<string, string> = {
    "User-Agent": request.headers["user-agent"] || "DDXProxy/2.0",
  };

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
    console.error("Auth proxy error:", error);
    reply.code(500).send({ error: "Proxy request failed" });
  }
};

export { authHandler };
export default authHandler;
