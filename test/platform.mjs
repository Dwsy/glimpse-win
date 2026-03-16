import assert from 'node:assert/strict';
import { getNativeHostInfo } from '../src/glimpse.mjs';
import { getCompanionSocketPath, usesNamedPipe } from '../pi-extension/socket-path.mjs';

const host = getNativeHostInfo();
const socketPath = getCompanionSocketPath();

if (process.platform === 'win32') {
  assert.equal(host.platform, 'win32');
  assert.match(host.path, /native[\\/]windows[\\/]bin[\\/]glimpse\.exe$/i);
  assert.equal(usesNamedPipe(socketPath), true);
  assert.equal(socketPath, '\\\\.\\pipe\\pi-companion');
} else if (process.platform === 'darwin') {
  assert.equal(host.platform, 'darwin');
  assert.match(host.path, /src[\\/]glimpse$/);
  assert.equal(usesNamedPipe(socketPath), false);
  assert.match(socketPath, /pi-companion\.sock$/);
} else {
  assert.throws(() => getNativeHostInfo(), /Unsupported platform/);
}

console.log('platform checks passed');
