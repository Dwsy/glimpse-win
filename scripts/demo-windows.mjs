import { open } from '../src/glimpse.mjs';

const win = open(`
<!doctype html>
<html>
  <body style="margin:0; font-family:Segoe UI, system-ui, sans-serif; background:linear-gradient(135deg,#101826,#1a2740); color:white;">
    <div style="padding:28px; height:100vh; box-sizing:border-box; display:flex; flex-direction:column; gap:14px;">
      <div style="font-size:26px; font-weight:700;">Glimpse Windows Demo</div>
      <div style="color:#b9c7dd; line-height:1.6; max-width:42rem;">
        This is a visible manual verification window. You should see it pop up directly now.<br>
        Click the button below to send a message back via <code style='background:#24324f;padding:2px 6px;border-radius:6px;color:#fff'>window.glimpse.send()</code>.
      </div>
      <div id="status" style="padding:10px 12px; background:rgba(255,255,255,0.08); border-radius:10px; color:#9fd0ff; width:fit-content;">waiting for interaction…</div>
      <div style="display:flex; gap:12px; margin-top:auto;">
        <button onclick="window.glimpse.send({ action:'demo-click', at: Date.now() }); document.getElementById('status').textContent='message sent';" style="padding:12px 16px; border:0; border-radius:10px; background:#4f8cff; color:white; font-weight:700; cursor:pointer;">Send Message</button>
        <button onclick="window.glimpse.close()" style="padding:12px 16px; border:0; border-radius:10px; background:#2b3852; color:white; font-weight:700; cursor:pointer;">Close</button>
      </div>
    </div>
  </body>
</html>
`, {
  title: 'Glimpse Windows Demo',
  width: 760,
  height: 420,
  floating: true,
});

win.on('ready', (info) => {
  console.log('ready', JSON.stringify(info));
});

win.on('message', (data) => {
  console.log('message', JSON.stringify(data));
});

win.on('closed', () => {
  console.log('closed');
  process.exit(0);
});

win.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
