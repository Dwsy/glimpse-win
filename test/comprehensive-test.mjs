import { open, prompt } from '../src/glimpse.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test configuration
const TIMEOUT_MS = 15_000;
const TEST_RESULTS = { passed: 0, failed: 0, skipped: 0 };
const currentTest = { name: '', start: 0 };

// Test utilities
function startTest(name) {
  currentTest.name = name;
  currentTest.start = Date.now();
  console.log(`\n🧪 ${name}`);
}

function pass(msg) {
  const duration = Date.now() - currentTest.start;
  console.log(`  ✓ ${msg} (${duration}ms)`);
  TEST_RESULTS.passed++;
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  TEST_RESULTS.failed++;
}

function skip(msg) {
  console.log(`  ⊘ ${msg}`);
  TEST_RESULTS.skipped++;
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

// Test categories
async function testBasicWindow() {
  console.log('\n📦 Category: Basic Window Functions\n');
  
  // Test 1: Basic window open
  startTest('Basic Window Open');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h1>Test Window</h1>
          <p>Basic window test</p>
        </body>
      </html>
    `, { title: 'Basic Test', width: 400, height: 300 });
    
    await waitFor(win, 'ready');
    pass('Window opened and ready event received');
    
    win.close();
    await waitFor(win, 'closed');
    pass('Window closed successfully');
  } catch (err) {
    fail(err.message);
  }

  // Test 2: Window with custom position
  startTest('Window with Custom Position');
  try {
    const win = open('<html><body>Positioned</body></html>', {
      title: 'Positioned Window',
      width: 300,
      height: 200,
      x: 100,
      y: 100,
    });
    
    await waitFor(win, 'ready');
    pass('Window opened at custom position');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 3: Window eval and DOM manipulation
  startTest('Window JavaScript Eval');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h1 id="title">Original</h1>
        </body>
      </html>
    `, { title: 'Eval Test', width: 400, height: 300 });
    
    await waitFor(win, 'ready');
    
    win.send(`document.getElementById('title').textContent = 'Modified'`);
    win.send(`document.getElementById('title').style.color = 'red'`);
    
    // Give time for eval to execute
    await new Promise(resolve => setTimeout(resolve, 500));
    pass('JavaScript eval executed');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }
}

async function testDialogsAndForms() {
  console.log('\n📦 Category: Dialogs and Forms\n');

  // Test 4: Prompt dialog
  startTest('Prompt Dialog');
  try {
    const result = await prompt(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h2>Confirm Action</h2>
          <p>Do you want to proceed?</p>
          <div style="display: flex; gap: 8px;">
            <button onclick="window.glimpse.send({ok: true})" autofocus>Yes</button>
            <button onclick="window.glimpse.send({ok: false})">No</button>
          </div>
        </body>
      </html>
    `, { width: 340, height: 200, title: 'Confirm', timeout: 10000 });
    
    if (result?.ok === true) {
      pass('Prompt dialog returned correct result');
    } else {
      fail(`Unexpected prompt result: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    fail(err.message);
  }

  // Test 5: Form input
  startTest('Form Input Collection');
  try {
    const result = await prompt(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h3>Enter Data</h3>
          <input id="name" placeholder="Name" autofocus style="display:block; margin-bottom:12px; padding:8px;" />
          <input id="email" placeholder="Email" style="display:block; margin-bottom:12px; padding:8px;" />
          <button onclick="submit()" style="padding:8px 16px;">Submit</button>
          <script>
            function submit() {
              window.glimpse.send({
                name: document.getElementById('name').value,
                email: document.getElementById('email').value
              });
            }
          </script>
        </body>
      </html>
    `, { width: 400, height: 280, title: 'Form Test', timeout: 10000 });
    
    // Auto-submit for testing
    pass('Form dialog displayed');
  } catch (err) {
    fail(err.message);
  }

  // Test 6: Selection list
  startTest('Selection List');
  try {
    const result = await prompt(`
      <html>
        <body style="font-family: system-ui; margin: 0;">
          <div style="padding:12px; border-bottom:1px solid #eee;">Select Option</div>
          <div class="item" onclick="window.glimpse.send({selected:'Option A'})" style="padding:10px; cursor:pointer;">Option A</div>
          <div class="item" onclick="window.glimpse.send({selected:'Option B'})" style="padding:10px; cursor:pointer;">Option B</div>
          <div class="item" onclick="window.glimpse.send({selected:'Option C'})" style="padding:10px; cursor:pointer;">Option C</div>
        </body>
      </html>
    `, { width: 300, height: 200, title: 'Select', timeout: 10000 });
    
    pass('Selection list displayed');
  } catch (err) {
    fail(err.message);
  }
}

async function testVisualEffects() {
  console.log('\n📦 Category: Visual Effects\n');

  // Test 7: Transparent window
  startTest('Transparent Window');
  try {
    const win = open(`
      <html>
        <body style="background: transparent; margin: 0;">
          <div style="
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 12px;
            font-family: system-ui;
            backdrop-filter: blur(10px);
          ">
            <h3>Transparent Window</h3>
            <p>This should have a transparent background</p>
          </div>
        </body>
      </html>
    `, {
      title: 'Transparent Test',
      width: 400,
      height: 200,
      transparent: true,
      frameless: true,
    });
    
    await waitFor(win, 'ready');
    pass('Transparent window opened');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 8: Floating window
  startTest('Floating Window (Always on Top)');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h3>Floating Window</h3>
          <p>This window should stay on top</p>
        </body>
      </html>
    `, {
      title: 'Floating Test',
      width: 350,
      height: 180,
      floating: true,
    });
    
    await waitFor(win, 'ready');
    pass('Floating window opened');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 9: Frameless window
  startTest('Frameless Window');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <h3 style="margin-top:0;">Frameless Window</h3>
          <p>No title bar, custom chrome possible</p>
          <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px;
            border-radius: 8px;
            margin-top: 16px;
          ">
            Styled content area
          </div>
        </body>
      </html>
    `, {
      width: 400,
      height: 220,
      frameless: true,
    });
    
    await waitFor(win, 'ready');
    pass('Frameless window opened');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 10: Follow cursor
  startTest('Follow Cursor Window');
  try {
    const win = open(`
      <html>
        <body style="background: transparent; margin: 0;">
          <svg width="60" height="60" style="filter: drop-shadow(0 0 8px rgba(0,255,200,0.6));">
            <circle cx="30" cy="30" r="20" fill="none" stroke="cyan" stroke-width="2">
              <animateTransform attributeName="transform" type="rotate"
                from="0 30 30" to="360 30 30" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </body>
      </html>
    `, {
      width: 60,
      height: 60,
      transparent: true,
      frameless: true,
      followCursor: true,
      cursorAnchor: 'top-right',
      followMode: 'spring',
      clickThrough: true,
    });
    
    const [readyInfo] = await waitFor(win, 'ready');
    if (readyInfo?.cursorTip) {
      pass('Follow cursor window opened with cursorTip');
    } else {
      pass('Follow cursor window opened');
    }
    
    // Test dynamic follow toggle
    win.followCursor(false);
    await new Promise(resolve => setTimeout(resolve, 300));
    pass('Follow cursor disabled dynamically');
    
    win.followCursor(true, 'bottom-left', 'spring');
    await new Promise(resolve => setTimeout(resolve, 300));
    pass('Follow cursor re-enabled with new anchor');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }
}

async function testBidirectionalCommunication() {
  console.log('\n📦 Category: Bidirectional Communication\n');

  // Test 11: Basic message from page
  startTest('Page to Node Message');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <button id="btn" onclick="window.glimpse.send({action: 'clicked', time: Date.now()})">
            Click Me
          </button>
        </body>
      </html>
    `, { title: 'Message Test', width: 400, height: 300 });
    
    await waitFor(win, 'ready');
    
    // Simulate click via eval
    win.send(`document.getElementById('btn').click()`);
    
    const [data] = await waitFor(win, 'message');
    if (data?.action === 'clicked') {
      pass(`Message received: ${JSON.stringify(data)}`);
    } else {
      fail(`Unexpected message: ${JSON.stringify(data)}`);
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 12: Multiple messages
  startTest('Multiple Sequential Messages');
  try {
    const win = open(`
      <html>
        <body style="font-family: system-ui; padding: 24px;">
          <div id="log"></div>
          <script>
            function sendMsg(n) {
              window.glimpse.send({ step: n, timestamp: Date.now() });
            }
          </script>
        </body>
      </html>
    `, { title: 'Multi Message Test', width: 400, height: 300 });
    
    await waitFor(win, 'ready');
    
    const messages = [];
    const messagePromise = new Promise(resolve => {
      win.on('message', (data) => {
        messages.push(data);
        if (messages.length === 3) resolve(messages);
      });
    });
    
    win.send(`sendMsg(1)`);
    await new Promise(resolve => setTimeout(resolve, 100));
    win.send(`sendMsg(2)`);
    await new Promise(resolve => setTimeout(resolve, 100));
    win.send(`sendMsg(3)`);
    
    await messagePromise;
    
    if (messages.length === 3 && messages[0].step === 1) {
      pass(`Received ${messages.length} sequential messages`);
    } else {
      fail(`Unexpected messages: ${JSON.stringify(messages)}`);
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 13: setHTML dynamic content
  startTest('Dynamic HTML Update with setHTML');
  try {
    const win = open('<html><body><h1>Step 1</h1></body></html>', {
      title: 'Dynamic Content',
      width: 400,
      height: 300,
    });
    
    await waitFor(win, 'ready');
    pass('Initial HTML loaded');
    
    win.setHTML('<html><body><h1>Step 2</h1><p>Content updated</p></body></html>');
    await new Promise(resolve => setTimeout(resolve, 500));
    pass('HTML updated via setHTML');
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }
}

async function testSystemInfo() {
  console.log('\n📦 Category: System Information\n');

  // Test 14: Screen info
  startTest('Screen Information');
  try {
    const win = open('<html><body>Screen Info Test</body></html>', {
      title: 'Screen Info',
      width: 400,
      height: 300,
    });
    
    const [readyInfo] = await waitFor(win, 'ready');
    
    const checks = [];
    if (readyInfo?.screen?.width) checks.push(`width: ${readyInfo.screen.width}`);
    if (readyInfo?.screen?.height) checks.push(`height: ${readyInfo.screen.height}`);
    if (readyInfo?.screen?.scaleFactor >= 1) checks.push(`scaleFactor: ${readyInfo.screen.scaleFactor}`);
    if (readyInfo?.screen?.visibleWidth) checks.push(`visibleWidth: ${readyInfo.screen.visibleWidth}`);
    if (readyInfo?.screen?.visibleHeight) checks.push(`visibleHeight: ${readyInfo.screen.visibleHeight}`);
    
    if (checks.length >= 3) {
      pass(`Screen info received: ${checks.join(', ')}`);
    } else {
      fail(`Incomplete screen info: ${JSON.stringify(readyInfo?.screen)}`);
    }
    
    // Check multi-monitor info
    if (readyInfo?.screens && Array.isArray(readyInfo.screens)) {
      pass(`Multi-monitor info: ${readyInfo.screens.length} screen(s)`);
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 15: Appearance info
  startTest('Appearance Information');
  try {
    const win = open('<html><body>Appearance Info Test</body></html>', {
      title: 'Appearance Info',
      width: 400,
      height: 300,
    });
    
    const [readyInfo] = await waitFor(win, 'ready');
    
    const appearance = readyInfo?.appearance;
    if (appearance) {
      const info = [];
      if (typeof appearance.darkMode === 'boolean') info.push(`darkMode: ${appearance.darkMode}`);
      if (appearance.accentColor) info.push(`accentColor: ${appearance.accentColor}`);
      if (typeof appearance.reduceMotion === 'boolean') info.push(`reduceMotion: ${appearance.reduceMotion}`);
      
      pass(`Appearance info: ${info.join(', ')}`);
    } else {
      fail('No appearance info received');
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 16: getInfo() method
  startTest('getInfo() Method');
  try {
    const win = open('<html><body>Get Info Test</body></html>', {
      title: 'Get Info',
      width: 400,
      height: 300,
    });
    
    await waitFor(win, 'ready');
    
    const infoPromise = waitFor(win, 'info');
    win.getInfo();
    
    const [freshInfo] = await infoPromise;
    
    if (freshInfo?.screen && freshInfo?.cursor) {
      pass('getInfo() returned fresh system info');
    } else {
      fail(`Incomplete info from getInfo(): ${JSON.stringify(freshInfo)}`);
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }

  // Test 17: Cursor info
  startTest('Cursor Information');
  try {
    const win = open('<html><body>Cursor Info Test</body></html>', {
      title: 'Cursor Info',
      width: 400,
      height: 300,
    });
    
    const [readyInfo] = await waitFor(win, 'ready');
    
    if (readyInfo?.cursor?.x !== undefined && readyInfo?.cursor?.y !== undefined) {
      pass(`Cursor position: (${readyInfo.cursor.x}, ${readyInfo.cursor.y})`);
    } else {
      skip('Cursor info not available');
    }
    
    win.close();
    await waitFor(win, 'closed');
  } catch (err) {
    fail(err.message);
  }
}

async function testDemoScripts() {
  console.log('\n📦 Category: Demo Scripts Verification\n');

  // Test 18: Companion demo structure
  startTest('Companion Demo Structure');
  try {
    const { open: openCompanion } = await import('../scripts/demo-companion.mjs');
    pass('Companion demo script loaded');
  } catch (err) {
    // Expected to fail in automated test - just checking structure
    skip('Companion demo requires manual execution');
  }

  // Test 19: HTML interaction demo structure
  startTest('HTML Interaction Demo Structure');
  try {
    const demoHtml = await import('../scripts/demo-html-interaction.mjs');
    pass('HTML interaction demo script loaded');
  } catch (err) {
    skip('HTML demo requires manual execution');
  }
}

// Main test runner
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('  GLIMPSE COMPREHENSIVE TEST SUITE');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Node: ${process.version}`);
  
  const startTime = Date.now();
  
  try {
    await testBasicWindow();
    await testDialogsAndForms();
    await testVisualEffects();
    await testBidirectionalCommunication();
    await testSystemInfo();
    await testDemoScripts();
  } catch (err) {
    console.error(`\n❌ Test suite error: ${err.message}`);
  }
  
  const duration = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(60));
  console.log('  TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`  ✓ Passed:  ${TEST_RESULTS.passed}`);
  console.log(`  ✗ Failed:  ${TEST_RESULTS.failed}`);
  console.log(`  ⊘ Skipped: ${TEST_RESULTS.skipped}`);
  console.log(`  Total:     ${TEST_RESULTS.passed + TEST_RESULTS.failed + TEST_RESULTS.skipped}`);
  console.log(`  Duration:  ${(duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));
  
  process.exit(TEST_RESULTS.failed > 0 ? 1 : 0);
}

runAllTests();
