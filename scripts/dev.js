import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    stdio: 'inherit',
    shell: true
});

const vite = spawn('npx', ['vite', '--port=3000', '--host=0.0.0.0'], {
    cwd: root,
    stdio: 'inherit',
    shell: true
});

process.on('SIGINT', () => {
    server.kill();
    vite.kill();
    process.exit();
});
