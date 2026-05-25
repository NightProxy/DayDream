import { createServer } from 'vite';
import { stdout } from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import chalk from 'chalk';
import { build, watch } from 'rolldown';
import sjConfig from './src/core/SJ/config/rolldown.config.ts';
import swConfig from './src/core/sw/rolldown.config.ts';
import obscuraConfig from './src/pkgs/Obscura/rolldown.config.ts';
import obscuraIifeConfig from './src/pkgs/Obscura/rolldown.iife.config.ts';
import controllerApiConfig from './src/core/SJ/controller/rolldown.api.config.ts';
import controllerSwConfig from './src/core/SJ/controller/rolldown.sw.config.ts';
import controllerInjectConfig from './src/core/SJ/controller/rolldown.inject.config.ts';

export function black() {
	return chalk.bgHex('000001');
}

let successCount = 0;
let lastSuccessCollapsed = false;

export function resetSuccessLog() {
	successCount = 0;
	lastSuccessCollapsed = false;
}

export function logSuccess() {
	successCount += 1;
	const suffix = successCount > 1 ? chalk.dim(` (x${successCount})`) : '';
	if (lastSuccessCollapsed && stdout.isTTY) {
		stdout.moveCursor(0, -1);
		stdout.clearLine(0);
		stdout.cursorTo(0);
	}
	stdout.write(`${chalk.green('Compiled successfully.')}${suffix}\n`);
	lastSuccessCollapsed = true;
}

/*export function runRspack(rspackConfig: any) {
    const compiler = rspack(rspackConfig);
    compiler.watch({}, (err, stats) => {
        if (err) {
            resetSuccessLog();
            stdout.write(chalk.red("Build failed:\n"));
            stdout.write(err.message + "\n");
            return;
        }
        if (!stats) return;

        const statList = Array.isArray((stats as any).stats)
            ? (stats as any).stats
            : [stats];

        for (const stat of statList) {
            const text = stat.toString({ colors: false, modules: false });
            if (text.includes("compiled successfully")) {
                logSuccess();
            } else {
                resetSuccessLog();
                console.log(text);
            }
        }
    });
}*/

function watchAndRebuildBundle(name: string, config: any) {
	const watcher = watch(config);

	watcher.on('event', async event => {
		if (event.code === 'ERROR') {
			resetSuccessLog();
			console.log(chalk.red(`${name} bundle failed:\n`));
			console.log(event.error);
			return;
		}

		if (event.code !== 'BUNDLE_END') {
			return;
		}

		try {
			await build(config);
			console.log(chalk.green(`${name} bundle updated.`));
		} catch (error) {
			resetSuccessLog();
			console.log(chalk.red(`${name} rebuild failed:\n`));
			console.log(error);
		}
	});

	return watcher;
}

const bundleWatchers = [
	watchAndRebuildBundle('SJ Config', sjConfig),
	watchAndRebuildBundle('Service worker', swConfig),
	watchAndRebuildBundle('Obscura', obscuraConfig),
	watchAndRebuildBundle('Obscura (IIFE)', obscuraIifeConfig),
	watchAndRebuildBundle('Controller (api)', controllerApiConfig),
	watchAndRebuildBundle('Controller (sw)', controllerSwConfig),
	watchAndRebuildBundle('Controller (inject)', controllerInjectConfig)
];

let backendProcess: ChildProcess | null = null;

function startBackendServer() {
	console.log(chalk.blue('Starting backend server on port 8080...'));
	backendProcess = spawn('tsx', ['index.ts'], {
		//stdio: 'inherit', log to console
		stdio: 'ignore', // don't log to console, we'll handle output manually
		env: process.env
	});
	console.log('Core Backend Started');

	backendProcess.on('exit', (code, signal) => {
		if (signal) {
			console.log(
				chalk.yellow(`Backend process exited from signal ${signal}.`)
			);
			return;
		}
		if (code !== 0) {
			console.log(chalk.red(`Backend process exited with code ${code}.`));
		}
	});
}

function shutdown() {
	if (backendProcess && !backendProcess.killed) {
		backendProcess.kill('SIGTERM');
	}
}

startBackendServer();

console.log(chalk.blue('Starting Vite dev server...'));

const server = await createServer({
	configFile: './vite.config.ts',
	server: {
		port: process.env.DEVPORT ? parseInt(process.env.DEVPORT) : 5173,
		strictPort: true,
		host: process.env.HOST || 'localhost'
	}
});

await server.listen();

let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;
	console.log(chalk.yellow(`Shutting down dev environment (${signal})...`));

	for (const watcher of bundleWatchers) {
		try {
			await watcher.close();
		} catch {
			// ignore watcher close errors during shutdown
		}
	}

	try {
		await server.close();
	} catch {
		// ignore server close errors during shutdown
	}

	shutdown();
	setTimeout(() => process.exit(0), 50);
}

process.once('SIGINT', () => {
	void gracefulShutdown('SIGINT');
});
process.once('SIGTERM', () => {
	void gracefulShutdown('SIGTERM');
});

const serverInfo = server.httpServer?.address();
const port =
	typeof serverInfo === 'object' && serverInfo !== null
		? serverInfo.port
		: 5173;

console.log(chalk.green(`Vite dev server running at http://localhost:${port}`));
console.log(chalk.blue('Watching and rebuilding bundles...'));

//runRspack(rspackConfig);

console.log(chalk.green('Dev environment ready!'));
console.log(chalk.dim('- Backend server runs from index.ts on :8080'));
console.log(chalk.dim('- Vite will hot-reload demo changes'));
console.log(chalk.dim('- Bundles will rebuild when their files change'));
