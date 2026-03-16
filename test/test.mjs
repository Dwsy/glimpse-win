import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, prompt } from '../src/glimpse.mjs';

const TIMEOUT_MS = 10_000;

const HTML = `<!DOCTYPE html>
<html>
  <body>
    <button id="btn" onclick="window.glimpse.send({action:'clicked'})">Click</button>
  </body>
</html>`;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
}

function waitFor(emitter, event, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for '${event}' after ${timeoutMs}ms`));
    }, timeoutMs);

    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });

    emitter.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

console.log('glimpse integration test\n');

let win;
let hiddenWin;
let fileWin;
let followWin;
let tempDir;
try {
  win = open(HTML, { title: 'Glimpse Test', width: 400, height: 300 });
  pass('Window opened');

  const [readyInfo] = await waitFor(win, 'ready');
  if (!readyInfo?.screen || !readyInfo?.appearance) {
    fail(`Expected ready info to include screen and appearance, got: ${JSON.stringify(readyInfo)}`);
  }
  if (!(readyInfo.screen.scaleFactor >= 1)) {
    fail(`Expected screen.scaleFactor >= 1, got: ${JSON.stringify(readyInfo)}`);
  }
  pass('ready event received');

  win.send(`document.getElementById('btn').click()`);
  pass('Sent eval: btn.click()');

  const [data] = await waitFor(win, 'message');
  if (data?.action !== 'clicked') {
    fail(`Expected data.action === 'clicked', got: ${JSON.stringify(data)}`);
  }
  pass(`message received: ${JSON.stringify(data)}`);

  win.close();
  pass('Sent close');

  await waitFor(win, 'closed');
  pass('closed event received');

  hiddenWin = open('<html><body><h2 id="title">Hidden Ready</h2></body></html>', {
    title: 'Hidden Test',
    width: 360,
    height: 220,
    hidden: true,
  });
  pass('Hidden window opened');

  const [hiddenReadyInfo] = await waitFor(hiddenWin, 'ready');
  if (!hiddenReadyInfo?.screen) {
    fail(`Expected hidden ready info to include screen, got: ${JSON.stringify(hiddenReadyInfo)}`);
  }
  pass('hidden window ready received');

  hiddenWin.show({ title: 'Shown Hidden Test' });
  pass('Sent show for hidden window');

  hiddenWin.getInfo();
  const [freshInfo] = await waitFor(hiddenWin, 'info');
  if (!freshInfo?.cursor || !freshInfo?.screen) {
    fail(`Expected info event to include cursor and screen, got: ${JSON.stringify(freshInfo)}`);
  }
  pass('info event received after getInfo()');

  hiddenWin.close();
  await waitFor(hiddenWin, 'closed');
  pass('hidden window closed event received');

  tempDir = mkdtempSync(join(tmpdir(), 'glimpse-test-'));
  const filePath = join(tempDir, 'page.html');
  writeFileSync(filePath, '<!doctype html><html><body><button id="file-btn" onclick="window.glimpse.send({action:\'from-file\'})">File Button</button></body></html>');

  fileWin = open('<html><body>placeholder</body></html>', {
    title: 'File Test',
    width: 360,
    height: 220,
  });
  pass('File-backed window opened');

  await waitFor(fileWin, 'ready');
  fileWin.loadFile(filePath);
  pass('Sent loadFile()');

  await waitFor(fileWin, 'ready');
  pass('file-backed ready event received');

  fileWin.send(`document.getElementById('file-btn').click()`);
  const [fileData] = await waitFor(fileWin, 'message');
  if (fileData?.action !== 'from-file') {
    fail(`Expected file-backed action === 'from-file', got: ${JSON.stringify(fileData)}`);
  }
  pass(`file-backed message received: ${JSON.stringify(fileData)}`);

  fileWin.close();
  await waitFor(fileWin, 'closed');
  pass('file-backed window closed event received');

  followWin = open('<html><body><h3>Follow Cursor</h3></body></html>', {
    title: 'Follow Cursor Test',
    width: 220,
    height: 140,
    followCursor: true,
    cursorAnchor: 'top-right',
    followMode: 'spring',
  });
  pass('follow-cursor window opened');

  const [followReadyInfo] = await waitFor(followWin, 'ready');
  if (!followReadyInfo?.cursorTip) {
    fail(`Expected follow-cursor ready info to include cursorTip, got: ${JSON.stringify(followReadyInfo)}`);
  }
  if (!followWin.info?.cursorTip) {
    fail(`Expected win.info.cursorTip to be cached, got: ${JSON.stringify(followWin.info)}`);
  }
  pass('follow-cursor ready includes cursorTip');

  followWin.followCursor(false);
  followWin.getInfo();
  const [followInfo] = await waitFor(followWin, 'info');
  if (followInfo?.cursorTip != null) {
    fail(`Expected cursorTip to become null after disabling followCursor, got: ${JSON.stringify(followInfo)}`);
  }
  if (followWin.info?.cursorTip != null) {
    fail(`Expected cached win.info.cursorTip to become null after disabling followCursor, got: ${JSON.stringify(followWin.info)}`);
  }
  pass('follow-cursor info reflects runtime disable');

  followWin.followCursor(true, 'bottom-left', 'spring');
  followWin.getInfo();
  const [followInfo2] = await waitFor(followWin, 'info');
  if (!followInfo2?.cursorTip) {
    fail(`Expected cursorTip to return after re-enabling followCursor, got: ${JSON.stringify(followInfo2)}`);
  }
  pass('follow-cursor info reflects runtime re-enable');

  followWin.close();
  await waitFor(followWin, 'closed');
  pass('follow-cursor window closed event received');

  const answer = await prompt(`
    <button onclick="window.glimpse.send({ok:true})">Go</button>
    <script>setTimeout(() => window.glimpse.send({ok:true}), 50)</script>
  `, {
    width: 240,
    height: 140,
    title: 'Prompt Test',
    timeout: 5_000,
  });
  if (!answer?.ok) {
    fail(`Expected prompt() to resolve with { ok: true }, got: ${JSON.stringify(answer)}`);
  }
  pass('prompt() autoClose path received first message');

  console.log('\nAll tests passed');
  process.exit(0);
} catch (err) {
  console.error(`\n  ✗ ${err.message}`);
  win?.close();
  hiddenWin?.close();
  fileWin?.close();
  followWin?.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}
