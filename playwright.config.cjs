const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  reporter: 'list',
  use: {
    // 使用本机 Chrome，避免测试时额外下载浏览器。
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
});
