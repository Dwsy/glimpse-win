import { connect } from 'node:net';
import { getCompanionSocketPath } from '../pi-extension/socket-path.mjs';

const sock = connect(getCompanionSocketPath(), () => {
  const sequence = [
    { id: 'alpha', project: 'alpha', contextPercent: 41, status: 'reading', detail: 'src/glimpse.mjs' },
    { id: 'beta', project: 'beta', contextPercent: 56, status: 'running', detail: 'npm test' },
    { id: 'gamma', project: 'gamma', contextPercent: 12, status: 'error', detail: 'build failed' },
    { id: 'alpha', project: 'alpha', contextPercent: 42, status: 'done', detail: 'ready' },
    { id: 'beta', project: 'beta', contextPercent: 59, status: 'done', detail: 'tests green' },
    { id: 'gamma', project: 'gamma', contextPercent: 12, status: 'running', detail: 'retrying' },
  ];

  let index = 0;
  const timer = setInterval(() => {
    if (index >= sequence.length) {
      clearInterval(timer);
      setTimeout(() => {
        sock.write(JSON.stringify({ id: 'alpha', type: 'remove' }) + '\n');
        sock.write(JSON.stringify({ id: 'beta', type: 'remove' }) + '\n');
        sock.write(JSON.stringify({ id: 'gamma', type: 'remove' }) + '\n');
        sock.end();
      }, 3500);
      return;
    }

    sock.write(JSON.stringify(sequence[index++]) + '\n');
  }, 1000);
});

sock.on('error', (err) => {
  console.error(err.message);
  process.exit(1);
});
