import { open } from '../src/glimpse.mjs';

const html = `<!doctype html>
<html>
  <body style="margin:0; background:transparent; overflow:hidden; font-family:Segoe UI, system-ui, sans-serif;">
    <div style="display:flex; align-items:center; justify-content:flex-end; width:100vw; height:100vh; padding:12px; box-sizing:border-box;">
      <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; border-radius:999px; background:rgba(12,18,28,0.78); color:white; box-shadow:0 14px 30px rgba(0,0,0,0.28); border:1px solid rgba(255,255,255,0.12); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);">
        <div style="width:10px; height:10px; border-radius:999px; background:#4ade80; box-shadow:0 0 12px rgba(74,222,128,0.8);"></div>
        <div style="font-size:12px; font-weight:700; letter-spacing:0.02em;">Glimpse Companion</div>
        <div id="status" style="font-size:11px; color:rgba(255,255,255,0.72)">following cursor</div>
      </div>
    </div>
    <script>
      let flip = false;
      setInterval(() => {
        flip = !flip;
        document.getElementById('status').textContent = flip ? 'following cursor' : 'spring mode active';
      }, 900);
    </script>
  </body>
</html>`;

const win = open(html, {
  width: 280,
  height: 72,
  frameless: true,
  floating: true,
  transparent: true,
  clickThrough: true,
  followCursor: true,
  followMode: 'spring',
  cursorAnchor: 'top-right',
});

win.on('ready', (info) => {
  console.log('ready', JSON.stringify(info));
});

win.on('closed', () => {
  console.log('closed');
  process.exit(0);
});

win.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
