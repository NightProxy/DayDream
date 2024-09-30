import express from "express";
import http from "node:http";
import cors from "cors";
import path from "node:path";
import { hostname } from "node:os";
import chalk from "chalk";
import routes from "./src/routes.js";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";

const server = http.createServer();
const app = express();
const __dirname = process.cwd();
const bareServer = createBareServer("/bare/");

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
// app.use(cors());
app.use("/epoxy/", express.static(epoxyPath));
app.use("/@/", express.static(uvPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremod/", express.static(bareModulePath));
app.use("/baremux/", express.static(baremuxPath));

app.use("/", routes);

wisp.options.dns_servers = ["1.1.1.3", "1.0.0.3"];

server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  }

  if (req.url.endsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  }
});
/*
privateBareServer(server, sysConfig.bare);
privateWispServer(server, sysConfig.wisp.paths);
*/
server.on("listening", () => {
  console.log(chalk.green(`Server is running on http://${hostname()}:${PORT}`));
});

server.listen({ port: PORT });

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.setMaxListeners(0);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    bareServer.close(() => {
      console.log("Bare server closed");
      process.exit(0);
    });
  });
}
