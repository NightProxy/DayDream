import http, { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "url";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
//@ts-ignore
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import chalk from "chalk";
import Fastify from "fastify";
import gradient from "gradient-string";
import { version } from "./package.json";
import { getPlatform } from "./srv/platform.ts";
import routes from "./srv/router.ts";
import Git from "./srv/git.js";
import { execSync } from "child_process";

let git_url = "https://github.com/NightProxy/DayDreamX";
let commit = "Unable to get this information.";

try {
    git_url = execSync("git config --get remote.origin.url").toString().trim();
} catch (e) {
    console.log("Unable to get current repo url; using default");
}

try {
    commit = execSync("git rev-parse HEAD").toString().trim();
} catch (e) {
    console.log("Unable to get commit info");
}

const git = new Git(git_url);

const server = Fastify({
    logger: false,
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
    serverFactory: (handler) => {
        const srv = http.createServer();
        logging.set_level(logging.ERROR);
        wisp.options.dns_method = "resolve";
        wisp.options.dns_servers = ["1.1.1.3", "1.0.0.3"];
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
    }
});

await server.register(fastifyCompress, {
    encodings: ["br", "gzip", "deflate"]
});

await server.register(fastifyHelmet, {
    xPoweredBy: false,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    contentSecurityPolicy: false // Disabled because of issues with Astro SSR
});

server.register(routes);

const PORT: number = Number(process.env.PORT) || 8080;

server.listen({ port: PORT, host: "0.0.0.0" }, async (error) => {
    if (error) {
        server.log.error(error);
        process.exit(1);
    }
    const serverInstance = server.server as Server;
    const address = serverInstance.address() as AddressInfo;
    const theme = chalk.hex("#630aba").bold;
    const ddx = {
        1: "#8b0ab8",
        2: "#630aba",
        3: "#665e72",
        4: "#1c1724",
    };
    const gitColor = chalk.hex("#00ff95");
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
    console.log(
          gitColor("Last Updated on: "),
          chalk.whiteBright((await git.fetchLastCommitDate()) + " "),
          gitColor("Commit:"),
          chalk.whiteBright(await git.fetchLastCommitID()),
          gitColor("Up to Date:"),
          chalk.whiteBright(
            commit === (await git.fetchLastCommitID()) ? "✅" : "❌",
          ),
        );
    console.log(theme("Version: "), chalk.whiteBright("v" + version));
    const hostingInfo = getPlatform(PORT);
    console.log(theme("🌐 Deployment Method: "), chalk.whiteBright(hostingInfo.method));
    console.log(host("🔗 Deployment Entrypoints: "));
    console.log(
        `  ${chalk.bold(host("Local System IPv4:"))}            http://${address.address}:${PORT}`
    );

    if (hostingInfo.selfHosted !== true)
        console.log(
            `  ${chalk.bold(host(hostingInfo.method + ":"))}           ${hostingInfo.extLink}`
        );
});
