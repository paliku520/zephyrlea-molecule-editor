#!/usr/bin/env node
/**
 * 把 `apps/web-local/public/favicon.svg` 栅格化成 Windows 图标 `build/green/icon.ico`。
 *
 * 必须用 Electron 运行（Chromium 负责渲染 SVG，仓库因此不需要 svg→png 的额外依赖）：
 *
 *   node_modules/electron/dist/electron.exe scripts/build-icon.mjs
 *
 * `scripts/build-green.mjs` 会在图标比 SVG 旧时自动调用它，产物同时喂给
 * - PyInstaller 的 `--icon`（后端 exe）
 * - Electron 的 exe 资源改写（绿色版主程序）
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app } from 'electron';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'apps', 'web-local', 'public', 'favicon.svg');
const OUTPUT = join(root, 'build', 'green', 'icon.ico');
/** 16/24/32/48 给任务栏与列表，64/128/256 给资源管理器的大图标视图。 */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Vista 之后的 ICO 允许每帧直接存 PNG，比 BMP 帧小得多。
 * 头 6 字节 + 每帧 16 字节目录项，然后是各帧数据。
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length + frames.length * 16;
  const entries = frames.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    // 256 及以上的宽高字段写 0，Windows 会按 256 解释。
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // 调色板颜色数
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
}

/** 在隐藏窗口里把 SVG 画到各尺寸的画布上，取回 base64 PNG。 */
async function rasterize() {
  const source = readFileSync(SOURCE, 'utf8');
  const window = new BrowserWindow({ show: false, width: 256, height: 256 });

  try {
    await window.loadURL('about:blank');
    const encoded = await window.webContents.executeJavaScript(`(async () => {
      const source = ${JSON.stringify(source)};
      const dataUrl = (text) => 'data:image/svg+xml;base64,' + btoa(text);

      // 小尺寸下内圈会糊成一团：去掉它，并把骨架整体放大一圈，16px 才认得出形状。
      const smallVariant = (() => {
        const document_ = new DOMParser().parseFromString(source, 'image/svg+xml');
        const svg = document_.documentElement;
        const ring = svg && svg.localName === 'svg' ? svg.querySelector('circle') : null;
        if (!ring) return source;
        ring.remove();
        for (const group of svg.querySelectorAll('g')) {
          group.setAttribute('transform', 'translate(32 32) scale(1.2) translate(-32 -32)');
        }
        return new XMLSerializer().serializeToString(svg);
      })();

      const load = async (text) => {
        const image = new Image();
        image.src = dataUrl(text);
        await image.decode();
        return image;
      };
      const large = await load(source);
      const small = await load(smallVariant);

      const out = {};
      for (const size of ${JSON.stringify(SIZES)}) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, size, size);
        context.drawImage(size < 32 ? small : large, 0, 0, size, size);
        out[size] = canvas.toDataURL('image/png').split(',')[1];
      }
      return out;
    })()`);

    return SIZES.map((size) => ({ size, data: Buffer.from(encoded[size], 'base64') }));
  } finally {
    window.destroy();
  }
}

app.whenReady().then(async () => {
  try {
    const ico = buildIco(await rasterize());
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, ico);
    console.log(`[icon] build/green/icon.ico（${SIZES.length} 帧，${(ico.length / 1024).toFixed(1)} KB）`);
    app.exit(0);
  } catch (error) {
    console.error(`[icon] 生成图标失败：${error instanceof Error ? error.stack : String(error)}`);
    app.exit(1);
  }
});
