import { connect } from 'node:net';
import { getCompanionSocketPath } from '../pi-extension/socket-path.mjs';

const socketPath = getCompanionSocketPath();
const socket = connect(socketPath, () => {
  console.log('connected', socketPath);
  socket.write(JSON.stringify({
    id: 'manual-probe',
    project: 'glimpse-win',
    status: 'running',
    detail: 'manual probe',
    contextPercent: 50,
  }) + '\n');
  setTimeout(() => {
    socket.write(JSON.stringify({ id: 'manual-probe', type: 'remove' }) + '\n');
    socket.end();
  }, 1500);
});

socket.on('error', (err) => {
  console.error('connect-error', err.message);
  process.exit(1);
});

socket.on('close', () => {
  console.log('closed');
  process.exit(0);
});
