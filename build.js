import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = process.cwd();
const buildScript = path.join(__dirname, 'src/RH/src/build.js');
const setupScript = path.join(__dirname, 'src/RH/src/setup.js');

async function runScripts() {
    try {
        console.log("Installing root dependencies...");
        const { stdout: rootInstall } = await execAsync('npm install');
        console.log(rootInstall);

        console.log("Installing `src/RH` dependencies...");
        const { stdout: rhInstall } = await execAsync('cd src/RH && npm install');
        console.log(rhInstall);

        console.log("Running build script...");
        const { stdout: buildOutput } = await execAsync(`node ${buildScript}`);
        console.log(buildOutput);

        console.log("Running setup script...");
        const { stdout: setupOutput } = await execAsync(`node ${setupScript}`);
        console.log(setupOutput);
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

runScripts();
