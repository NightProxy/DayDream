import http, { Server } from "node:http";
import type { AddressInfo } from "node:net";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
// @ts-ignore
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import chalk from "chalk";
import Fastify from "fastify";
import gradient from "gradient-string";
import { version } from "./package.json";
import { getPlatform } from "./srv/platform.ts";
import routes from "./srv/router.ts";

const server = Fastify({
  logger: false,
  routerOptions: {
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
  },
  serverFactory: (handler) => {
    const srv = http.createServer();
    logging.set_level(logging.ERROR);
    wisp.options.dns_method = "resolve";
    wisp.options.dns_servers = ["1.1.1.1", "1.0.0.1"];
    wisp.options.dns_result_order = "ipv4first";
    wisp.options.wisp_version = 2;
    wisp.options.wisp_motd = "WISP server";
    srv.on("request", (req, res) => {
      handler(req, res);
    });
    srv.on("upgrade", (req, socket, head) => {
      if (req.url?.endsWith("/wisp/")) {
        wisp.routeRequest(req, socket as any, head);
      } else {
        socket.destroy();
      }
    });
    return srv;
  },
});

await server.register(fastifyCompress, {
  encodings: ["br", "gzip", "deflate"],
});

await server.register(fastifyHelmet, {
  xPoweredBy: false,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  contentSecurityPolicy: false,
});

server.register(routes);

const PORT: number = Number(process.env.PORT) || 8080;
const HOST: string = process.env.HOST || "127.0.0.1";

try {
  await server.listen({ port: PORT, host: HOST });
  const serverInstance = server.server as Server;
  const address = serverInstance.address() as AddressInfo;
  const theme = chalk.hex("#630aba").bold;
  const ddx = {
    1: "#8b0ab8",
    2: "#630aba",
    3: "#665e72",
    4: "#1c1724",
  };
  const host = chalk.hex("#4a4c7f").bold;

  const startupText = `
██████╗  █████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ █████╗ ███╗   ███╗    ██╗  ██╗
██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗ ████║    ╚██╗██╔╝
██║  ██║███████║ ╚████╔╝ ██║  ██║██████╔╝█████╗  ███████║██╔████╔██║     ╚███╔╝
██║  ██║██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══╝  ██╔══██║██║╚██╔╝██║     ██╔██╗
██████╔╝██║  ██║   ██║   ██████╔╝██║  ██║███████╗██║  ██║██║ ╚═╝ ██║    ██╔╝ ██╗
╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝  ╚═╝
`;

  console.log(gradient(Object.values(ddx)).multiline(startupText));

  console.log(theme("Version: "), chalk.whiteBright("v" + version));
  const platformUrl = getPlatform(PORT);
  const deploymentMethod = platformUrl ? "Platform" : "Self-Hosted";
  console.log(
    theme("🌐 Deployment Method: "),
    chalk.whiteBright(deploymentMethod),
  );
  console.log(host("🔗 Deployment Entrypoints: "));
  console.log(
    `  ${chalk.bold(host("Local System IPv4:"))}            http://${address.address}:${PORT}`,
  );

  if (platformUrl)
    console.log(
      `  ${chalk.bold(host("Platform:"))}                     ${platformUrl}`,
    );
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
