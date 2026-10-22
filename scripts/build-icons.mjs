/** Render the project's own vector mark into installable home-screen icons. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const assets = new URL('apps/web/public/', root);
const mark = await readFile(new URL('openduet-mark.svg', assets), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  async function render(width, height, background, inset = 0) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      `<style>*{box-sizing:border-box}body{margin:0;background:${background};display:grid;place-items:center;height:100vh}svg{width:${width - inset * 2}px;max-height:100%}</style>${mark}`,
    );
    return page.screenshot({ omitBackground: background === 'transparent' });
  }
  const logo = await render(400, 172, 'transparent');
  for (const path of [
    'apps/web/public/openduet-logo.png',
    'apps/tryit/public/openduet-logo.png',
    'apps/web/docs/design/assets/openduet-logo.png',
  ])
    await writeFile(new URL(path, root), logo);
  await mkdir(new URL('icons/', assets), { recursive: true });
  for (const [name, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ])
    await writeFile(
      new URL(`icons/${name}`, assets),
      await render(size, size, '#f4f3ef', Math.round(size * 0.16)),
    );
  const icon = await render(32, 32, '#f4f3ef', 4);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(icon.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(new URL('favicon.ico', assets), Buffer.concat([header, icon]));
  await writeFile(
    new URL('favicon.svg', assets),
    mark.replace('viewBox="0 0 96 42"', 'viewBox="-16 -43 128 128"'),
  );
} finally {
  await browser.close();
}
