import { createServer, connect } from 'node:net';

const path = '\\\\.\\pipe\\glimpse-probe-pipe';

const server = createServer((socket) => {
  console.log('server: client connected');
  socket.on('data', (chunk) => {
    console.log('server: data', chunk.toString().trim());
    socket.write('ack\n');
  });
});

await new Promise((resolve, reject) => {
  server.listen(path, (err) => err ? reject(err) : resolve(null));
});
console.log('server: listening', path);

const client = connect(path, () => {
  console.log('client: connected');
  client.write('hello-from-client\n');
});

client.on('data', (chunk) => {
  console.log('client: data', chunk.toString().trim());
  client.end();
  server.close();
});

client.on('close', () => {
  console.log('client: closed');
  process.exit(0);
});

client.on('error', (err) => {
  console.error('client:error', err.message);
  process.exit(1);
});
