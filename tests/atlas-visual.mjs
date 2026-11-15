import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL('file://' + path.join(root, 'design/atlas-preview.html'));
const browser = await chromium.launch({ headless: true });
const targets = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];
const errors = [];
await mkdir(path.join(root, 'atlas-screenshots'), { recursive: true });
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(target.name + ': ' + error.message));
    await page.goto(url.href);
    await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Тёмная тема' }).click();
    await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-dark.png'), fullPage: true });
    if (target.name === 'desktop') {
      await page.getByRole('textbox', { name: 'Название' }).fill('Проверка интерфейса');
      await page.getByRole('button', { name: 'Добавить в макет' }).click();
      await page.getByRole('heading', { name: 'Проверка интерфейса' }).waitFor();
      await page.screenshot({ path: path.join(root, 'atlas-screenshots', 'desktop-interaction.png'), fullPage: true });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(target.name + ': horizontal overflow');
    await page.close();
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
