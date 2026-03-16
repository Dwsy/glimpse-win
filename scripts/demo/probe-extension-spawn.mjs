import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';
import { getCompanionSocketPath } from '../pi-extension/socket-path.mjs';

const companionPath = join(fileURLToPath(new URL('../pi-extension/', import.meta.url)), 'companion.mjs');
const sockPath = getCompanionSocketPath();

function tryConnect() {
  return new Promise((resolve) => {
    const sock = connect(sockPath, () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

const child = spawn('node', [companionPath], {
  detached: true,
  stdio: 'ignore',
  windowsHide: process.platform === 'win32',
});
child.unref();
console.log(`spawned pid=${child.pid}`);

let ok = false;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 150));
  ok = await tryConnect();
  if (ok) break;
}

console.log(`connect=${ok}`);
process.exit(ok ? 0 : 1);
