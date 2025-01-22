import express from "express";
import http from "node:http";
import cors from "cors";
import path from "node:path";
import chalk from "chalk";
import routes from "./src/routes.js";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

const server = http.createServer();
const app = express();
const __dirname = process.cwd();

const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public/static/")));
app.use(cors());
app.use("/epoxy/", express.static(epoxyPath));
app.use("/@/", express.static(uvPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));

app.use("/", routes);

server.on("request", (req, res) => {
  app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url.endsWith("/wisp/")) {
    wisp.routeRequest(req, socket, head);
  }
});

server.on("listening", () => {
  const address = server.address();
  const theme = chalk.hex("#8F00FF");
  const host = chalk.hex("0d52bd");
  console.log(
    chalk.bold(
      theme(`
        
██████╗  █████╗ ██╗   ██╗██████╗ ██████╗ ███████╗ █████╗ ███╗   ███╗    ██╗  ██╗
██╔══██╗██╔══██╗╚██╗ ██╔╝██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗ ████║    ╚██╗██╔╝
██║  ██║███████║ ╚████╔╝ ██║  ██║██████╔╝█████╗  ███████║██╔████╔██║     ╚███╔╝ 
██║  ██║██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══╝  ██╔══██║██║╚██╔╝██║     ██╔██╗ 
██████╔╝██║  ██║   ██║   ██████╔╝██║  ██║███████╗██║  ██║██║ ╚═╝ ██║    ██╔╝ ██╗
╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝  ╚═╝
                                                                                
`)
    )
  );
  console.log(theme("ℹ️  Info:"))
  console.log(theme("Version: "), chalk.whiteBright(packageJson.version))

  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    var method = "Replit"
  } else if (process.env.HOSTNAME && process.env.GITPOD_WORKSPACE_CLUSTER_HOST) {
    var method = "Gitpod"
  } else if (
    process.env.CODESPACE_NAME &&
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ) {
    var method = "GitHub Codespaces"
  } else if (process.env.GITPOD_WORKSPACE_CLUSTER_HOST && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    var method = "Gitpod"
  } else if (process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    var method = "Vercel"
  } else if (process.env.RENDER && process.env.RENDER_EXTERNAL_HOSTNAME) {
    var method = "Render"
  } else if (process.env.KOYEB_APP_NAME && process.env.KOYEB_PUBLIC_DOMAIN) {
    var method = "Koyeb"
  } else {
    var method = "Custom (DNS Deploy?)"
  }
  console.log(theme("♦️ Deployment Method: "), chalk.whiteBright(method))
  console.log(host("♦️ Deployment Entrypoints: "))
  console.log(
    `  ${chalk.bold(host('Local System:'))}            http://localhost:${PORT}`
  );
  console.log(
    `  ${chalk.bold(host('Local System IPv6:'))}            http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}${address.port === 80 ? '' : ':' + chalk.bold(address.port)}`
  );

  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    console.log(
      `  ${chalk.bold(host('Replit:'))}           https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    );
  }

  if (
    process.env.RENDER_EXTERNAL_HOSTNAME && process.env.RENDER
  ) {
    console.log(
      `  ${chalk.bold(host('Render:'))}           https://${RENDER_EXTERNAL_HOSTNAME}`
    );
  }

  if (
    process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL
  ) {
    console.log(
      `  ${chalk.bold(host('Vercel:'))}           https://${VERCEL_PROJECT_PRODUCTION_URL}`
    );
  }

  if (
    process.env.KOYEB_PUBLIC_DOMAIN && process.env.KOYEB_APP_NAME
  ) {
    console.log(
      `  ${chalk.bold(host('Koyeb:'))}           https://${KOYEB_PUBLIC_DOMAIN}`
    );
  }

  if (process.env.HOSTNAME && process.env.GITPOD_WORKSPACE_CLUSTER_HOST) {
    console.log(
      `  ${chalk.bold(host('Gitpod:'))}           https://${PORT}-${process.env.HOSTNAME}.${process.env.GITPOD_WORKSPACE_CLUSTER_HOST}`
    );
  }

  if (
    process.env.CODESPACE_NAME &&
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ) {
    console.log(
      `  ${chalk.bold(host('Github Codespaces:'))}           https://${process.env.CODESPACE_NAME}-${address.port === 80 ? '' : address.port}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    );
  }
});

server.listen({ port: PORT });

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.setMaxListeners(0);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
}
