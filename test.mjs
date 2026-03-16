import { open, prompt } from './src/glimpse.mjs';

console.log('🧪 Glimpse Windows 测试开始...\n');

// 测试 1: 简单对话框
console.log('测试 1: 打开对话框...');
const result = await prompt(`
<body style="font-family: system-ui; padding: 24px; background: white;">
  <h2 style="margin-top: 0; color: #333;">🧪 Glimpse Windows 测试</h2>
  <p style="color: #666;">如果你看到这个窗口，说明 Glimpse 在 Windows 上工作正常。</p>
  <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
    <button onclick="window.glimpse.send({action: 'cancel'})" style="padding: 10px 20px; background: #eee; border: none; border-radius: 6px; cursor: pointer;">
      取消
    </button>
    <button onclick="window.glimpse.send({action: 'ok'})" autofocus style="padding: 10px 20px; background: #4299e1; color: white; border: none; border-radius: 6px; cursor: pointer;">
      确认 ✓
    </button>
  </div>
</body>
`, { width: 400, height: 220, title: 'Glimpse 测试' });

console.log('用户响应:', result);

if (result?.action === 'ok') {
  console.log('\n✅ 测试通过！Glimpse 在 Windows 上工作正常。');
} else {
  console.log('\n⚠️ 用户取消了测试。');
}
