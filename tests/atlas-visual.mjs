import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL('file://' + path.join(root, 'design/atlas-preview.html'));
const browser = await chromium.launch({ headless: true });
const targets = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'compact-mobile', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small-mobile', width: 320, height: 700 },
  { name: 'short-mobile', width: 320, height: 568 },
  { name: 'landscape-mobile', width: 667, height: 375 }
];
const errors = [];
await mkdir(path.join(root, 'atlas-screenshots'), { recursive: true });
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(target.name + ': ' + error.message));
    await page.goto(url.href);
    const lightOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (lightOverflow) errors.push(target.name + ': horizontal overflow in light theme');
    await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Тёмная тема' }).click();
    const theme = await page.locator('html').getAttribute('data-bs-theme');
    if (theme !== 'dark') errors.push(target.name + ': theme did not switch');
    const darkOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (darkOverflow) errors.push(target.name + ': horizontal overflow in dark theme');
    await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-dark.png'), fullPage: true });
    // Offline, deterministic long-form fixture exercises the production Atlas dialog CSS.
    const dialog = await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'atlas-dialog-fixture';
      fixture.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.4)';
      const fields = Array.from({ length: 18 }, (_, i) => `<label class="preview-field">Поле ${i + 1}<input class="form-control" value="Длинное значение для проверки формы"></label>`).join('');
      fixture.innerHTML = `<div class="modal-dialog modal-dialog-centered" style="width:min(700px,100%)">
        <div class="modal-content"><div class="modal-header"><h3 class="modal-title">Длинная форма</h3></div>
        <div class="modal-body">${fields}</div>
        <div class="modal-footer"><button class="btn btn-secondary">Отменить</button><button class="btn btn-premium">Сохранить</button></div>
        </div></div>`;
      document.body.append(fixture);
      const content = fixture.querySelector('.modal-content');
      const body = fixture.querySelector('.modal-body');
      const footer = fixture.querySelector('.modal-footer');
      const firstInput = body.querySelector('input');
      const lastInput = body.querySelector('label:last-child input');
      firstInput.focus();
      body.scrollTop = 0;
      lastInput.focus();
      const inputBounds = lastInput.getBoundingClientRect();
      const bodyBounds = body.getBoundingClientRect();
      const lastInputReachable = inputBounds.top >= bodyBounds.top - 1 && inputBounds.bottom <= bodyBounds.bottom + 1;
      body.scrollTop = body.scrollHeight;
      const bounds = content.getBoundingClientRect();
      const footerBounds = footer.getBoundingClientRect();
      const result = {
        top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right,
        footerTop: footerBounds.top, footerBottom: footerBounds.bottom,
        bodyScrolled: body.scrollTop > 0,
        bodyScrollable: body.scrollHeight > body.clientHeight,
        lastInputReachable,
        footerVisible: getComputedStyle(footer).display !== 'none'
      };
      return result;
    });
    if (dialog.left < -1 || dialog.right > target.width + 1 || dialog.top < -1 || dialog.bottom > target.height + 1) {
      errors.push(target.name + ': long dialog extends beyond viewport');
    }
    if (!dialog.bodyScrollable || !dialog.bodyScrolled || !dialog.lastInputReachable || !dialog.footerVisible || dialog.footerBottom > target.height + 1) {
      errors.push(target.name + ': long dialog body or actions inaccessible');
    }
    if (target.name === 'short-mobile' || target.name === 'landscape-mobile') {
      await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-dialog.png') });
    }
    await page.locator('#atlas-dialog-fixture').evaluate(node => node.remove());
    const touchTargets = await page.evaluate(() => {
      const selectors = ['#themeSwitch', '[data-preview-action="new-travel"]',
        '[data-preview-action="profile"]', '.preview-profile [role="tab"]',
        '#previewTravelForm button[type="submit"]'];
      return selectors.map(selector => {
        const node = document.querySelector(selector);
        const box = node?.getBoundingClientRect();
        return { selector, width: box?.width ?? 0, height: box?.height ?? 0 };
      });
    });
    for (const targetBox of touchTargets) {
      if (targetBox.width < 40 || targetBox.height < 40) {
        errors.push(target.name + ': undersized target ' + targetBox.selector);
      }
    }
    // Keyboard navigation must expose a visible focus ring in dark mode.
    await page.keyboard.press('Tab');
    const focusVisibility = await page.evaluate(() => {
      const active = document.activeElement;
      return active && active !== document.body && getComputedStyle(active).outlineStyle !== 'none';
    });
    if (!focusVisibility) errors.push(target.name + ': keyboard focus is not visible');
    await page.getByRole('button', { name: 'Мой профиль' }).click();
    await page.getByRole('tab', { name: 'Достижения' }).click();
    await page.getByRole('heading', { name: '🏆 Первые открытия' }).waitFor();
    await page.getByRole('tab', { name: 'Обзор' }).click();
    await page.getByRole('textbox', { name: 'Название' }).fill('Проверка интерфейса');
    await page.getByRole('button', { name: 'Добавить в макет' }).click();
    await page.getByRole('heading', { name: 'Проверка интерфейса' }).waitFor();
    if (target.name === 'desktop' || target.name === 'small-mobile') {
      await page.screenshot({ path: path.join(root, 'atlas-screenshots', target.name + '-interaction.png'), fullPage: true });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) errors.push(target.name + ': horizontal overflow after interaction');
    await page.close();
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
