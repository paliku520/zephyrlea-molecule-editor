#!/usr/bin/env node
/**
 * 绿色版（Windows 免安装便携包）打包脚本，产物都在 `dist-green/`：
 *
 *   - `Zephyrlea-Molecule-Editor-<版本>-win-x64/`    解压即用的 Electron 文件夹
 *   - `zephyrlea-backend.exe`                       单文件后端，可单独替换 / 更新
 *   - `Zephyrlea-Molecule-Editor-<版本>-win-x64.zip` 上面文件夹的压缩包
 *
 * 便携包里不放 Python 环境：后端只以 PyInstaller 冻结出的**单个 exe** 出现，
 * 主进程在打包态按 `process.resourcesPath/backend/zephyrlea-backend.exe` 拉起它
 * （见 `apps/desktop/src/main/backend.ts`）。
 *
 * 用法::
 *
 *   npm run build:green                 # 构建界面 + 冻结后端 + 组装 + 打 zip
 *   npm run build:green -- --skip-backend   # 复用 dist-green/zephyrlea-backend.exe
 *   npm run build:green -- --no-zip         # 只留文件夹，不生成 zip
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_EXE = 'Zephyrlea Molecule Editor.exe';
const BACKEND_EXE = 'zephyrlea-backend.exe';
/** Chromium 的界面语言包，只留中文和英文，其余删掉可省十几 MB。 */
const KEPT_LOCALES = new Set(['zh-CN.pak', 'en-US.pak', 'zh-TW.pak']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktopDir = join(root, 'apps/desktop');
const backendDir = join(root, 'apps/backend');
const electronDist = join(root, 'node_modules/electron/dist');
const electronExe = join(electronDist, 'electron.exe');
const outputRoot = join(root, 'dist-green');
/** 独立发布的单文件后端；也用来给 `--skip-backend` 复用。 */
const standaloneBackend = join(outputRoot, BACKEND_EXE);
/** 图标由 `scripts/build-icon.mjs` 从 favicon.svg 栅格化而来，前后端共用。 */
const iconSource = join(root, 'apps/web-local/public/favicon.svg');
const iconPath = join(root, 'build/green/icon.ico');
const iconScript = join(root, 'scripts/build-icon.mjs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const args = process.argv.slice(2);
const skipBackend = args.includes('--skip-backend');
const noZip = args.includes('--no-zip');

function log(message) {
  console.log(`[green] ${message}`);
}

function fail(message) {
  console.error(`[green] ${message}`);
  process.exit(1);
}

function sizeOf(target) {
  const stats = statSync(target);
  if (!stats.isDirectory()) return stats.size;

  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    total += sizeOf(join(target, entry.name));
  }
  return total;
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 以 shell 执行一条命令（npm / git 这类 `.cmd` 垫片在 Windows 上必须走 shell）。
 * 参数拼成单个字符串是刻意的：`shell: true` 搭配参数数组已被废弃。
 */
function run(command, commandArgs, cwd) {
  const line = [command, ...commandArgs].join(' ');
  const result = spawnSync(line, { cwd, stdio: 'inherit', shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${line} 失败（退出码 ${result.status}）`);
}

/** 直接执行可执行文件，参数按数组传递，路径里有空格也不用担心。 */
function runArgs(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${[command, ...commandArgs].join(' ')} 失败（退出码 ${result.status}）`);
  }
}

function appVersion() {
  const manifest = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));
  if (!manifest.version) fail('apps/desktop/package.json 里没有 version 字段。');
  return manifest.version;
}

/**
 * `favicon.svg` 是图标唯一的来源：它比 icon.ico 新（或 ico 还不存在）时，
 * 用 Electron 自带的 Chromium 栅格化成 16~256 的多帧 ico，前后端 exe 共用这一份。
 */
function ensureIcon() {
  const fresh =
    existsSync(iconPath) && statSync(iconPath).mtimeMs >= statSync(iconSource).mtimeMs;
  if (fresh) {
    log(`复用已有图标 build/green/icon.ico`);
    return;
  }

  log('从 apps/web-local/public/favicon.svg 生成图标…');
  runArgs(electronExe, [iconScript], root);
  if (!existsSync(iconPath)) fail('图标生成失败，请检查上面的输出。');
}

/** 用 PyInstaller 的 win32 资源写入器给 exe 换上图标（免去再装 rcedit）。 */
function applyExeIcon(exePath, python) {
  const patch = [
    'import sys',
    'from PyInstaller.utils.win32.icon import CopyIcons_FromIco',
    'CopyIcons_FromIco(sys.argv[1], [sys.argv[2]], id=1)',
  ].join('\n');

  log(`写入主程序图标：${APP_EXE}`);
  runArgs(python, ['-c', patch, exePath, iconPath], root);
}

/** 打包用的解释器：优先后端自己的虚拟环境。 */
function pythonExe() {
  const venv = join(backendDir, '.venv', 'Scripts', 'python.exe');
  if (existsSync(venv)) return venv;
  log('没有找到 apps/backend/.venv，退回全局 python。');
  return 'python';
}

function ensurePyInstaller(python) {
  const probe = spawnSync(python, ['-c', 'import PyInstaller'], { stdio: 'ignore' });
  if (probe.status === 0) return;

  log('虚拟环境里没有 PyInstaller，按 apps/backend/requirements-build.txt 安装…');
  runArgs(python, ['-m', 'pip', 'install', '-r', join(backendDir, 'requirements-build.txt')], root);
}

/**
 * 把 `apps/backend/main.py` 冻结成单个 exe。
 *
 * `--onefile` 意味着运行时先解压到临时目录，启动要多花几秒（实测首次就绪约 6 s，
 * 主进程留了 60 s 的超时）；换来的是便携包里没有一整份 Python 环境。
 * uvicorn 按字符串动态 import 协议实现，PyInstaller 静态分析看不到，所以显式声明。
 */
function freezeBackend(python) {
  ensurePyInstaller(python);

  const buildDir = join(backendDir, 'build', 'pyinstaller');
  const distDir = join(buildDir, 'dist');
  rmSync(buildDir, { recursive: true, force: true });

  log('冻结后端（PyInstaller --onefile），这一步通常需要 1~2 分钟…');
  runArgs(
    python,
    [
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onefile',
      '--console',
      '--name',
      'zephyrlea-backend',
      '--distpath',
      distDir,
      '--workpath',
      join(buildDir, 'work'),
      '--specpath',
      buildDir,
      '--paths',
      backendDir,
      '--collect-all',
      'rdkit',
      '--collect-submodules',
      'uvicorn',
      '--hidden-import',
      'uvicorn.logging',
      '--hidden-import',
      'uvicorn.loops.auto',
      '--hidden-import',
      'uvicorn.protocols.http.auto',
      '--hidden-import',
      'uvicorn.protocols.http.h11_impl',
      '--hidden-import',
      'uvicorn.protocols.websockets.auto',
      '--hidden-import',
      'uvicorn.lifespan.on',
      '--exclude-module',
      'tkinter',
      '--exclude-module',
      'matplotlib',
      '--exclude-module',
      'IPython',
      '--icon',
      iconPath,
      join(backendDir, 'main.py'),
    ],
    root,
  );

  const frozen = join(distDir, BACKEND_EXE);
  if (!existsSync(frozen)) fail('PyInstaller 结束但没找到 zephyrlea-backend.exe，请检查上面的日志。');

  mkdirSync(outputRoot, { recursive: true });
  cpSync(frozen, standaloneBackend);
  // 中间的 work/ + dist/ 有几百 MB，exe 已经复制出去了，直接清掉。
  rmSync(buildDir, { recursive: true, force: true });
  log(`后端已冻结：dist-green/${BACKEND_EXE}（${megabytes(sizeOf(standaloneBackend))}）`);
}

function buildRenderer() {
  log('构建桌面版界面（tsc + electron-vite build）…');
  run(npm, ['run', 'build:desktop'], root);
  const out = join(desktopDir, 'out');
  if (!existsSync(out)) fail('构建结束但没找到 apps/desktop/out，请检查上面的构建日志。');
  return out;
}

/**
 * 组装便携目录：Electron 运行时 + `resources/app`（界面产物）+ `resources/backend`
 * + 同级的 `data/`（绿色版的用户数据目录）。
 */
function stagePortable(outDir, stageDir) {
  log('组装便携目录…');
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  cpSync(electronDist, stageDir, { recursive: true });

  // Electron 自带的默认应用（未打包时会显示的那套欢迎页），装上自己的 app 后必须删掉。
  rmSync(join(stageDir, 'resources', 'default_app.asar'), { force: true });

  const locales = join(stageDir, 'locales');
  if (existsSync(locales)) {
    for (const name of readdirSync(locales)) {
      if (!KEPT_LOCALES.has(name)) rmSync(join(locales, name), { force: true });
    }
  }

  const appDir = join(stageDir, 'resources', 'app');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'zephyrlea-molecule-editor',
        productName: 'Zephyrlea Molecule Editor',
        version: appVersion(),
        description: '面向中学化学的轻量化小分子结构编辑器',
        main: 'out/main/index.js',
        license: 'MIT',
        author: 'paliku520',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  cpSync(outDir, join(appDir, 'out'), { recursive: true });

  const backendDest = join(stageDir, 'resources', 'backend');
  mkdirSync(backendDest, { recursive: true });
  cpSync(standaloneBackend, join(backendDest, BACKEND_EXE));

  // 存在 data/ 时主进程把用户数据写在这里（见 applyPortableDataDir），整个文件夹拷走即可。
  mkdirSync(join(stageDir, 'data'), { recursive: true });

  writeFileSync(
    join(stageDir, '使用说明.txt'),
    [
      `Zephyrlea · 分子结构编辑器 ${appVersion()} 绿色版`,
      '========================================',
      '',
      '1. 把整个文件夹解压到任意位置（路径可以带空格和中文），无需安装。',
      `2. 双击 "${APP_EXE}" 启动。`,
      '3. 设置、画板存档与缓存都保存在同级的 data 目录里，随文件夹一起拷走；',
      '   删掉整个文件夹就等于彻底卸载，不会在系统里留下任何东西。',
      '4. 化学计算由 resources\\backend\\zephyrlea-backend.exe 提供，首次分析需要',
      '   几秒解压启动（单文件后端），属于正常现象。',
      '5. 单独更新后端时，只替换 resources\\backend\\zephyrlea-backend.exe 即可。',
      '',
      '仅供教学与学习使用，详见 README.md 与 DISCLAIMER.md。',
      '',
    ].join('\r\n'),
    'utf8',
  );

  // 重命名运行时入口，任务栏与「打开方式」里显示的就是这个名字。
  renameSync(join(stageDir, 'electron.exe'), join(stageDir, APP_EXE));
}

/** Windows 自带的 bsdtar 按扩展名选格式（.zip → zip），比 Compress-Archive 快得多。 */
function zipStage(stageDir, zipPath) {
  const stageName = basename(stageDir);
  rmSync(zipPath, { force: true });
  log(`打包 zip：dist-green/${stageName}.zip`);
  runArgs('tar', ['-a', '-c', '-f', zipPath, stageName], outputRoot);
  if (!existsSync(zipPath)) fail('tar 结束但没找到 zip，请检查上面的日志。');
  return stageName;
}

function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        '用法：npm run build:green [-- --skip-backend] [--no-zip]',
        '',
        '  --skip-backend  复用 dist-green/zephyrlea-backend.exe，不重新冻结后端',
        '  --no-zip        只生成便携文件夹，不压缩成 zip',
      ].join('\n'),
    );
    return;
  }
  if (process.platform !== 'win32') {
    fail('绿色版只面向 Windows（后端固定为 zephyrlea-backend.exe），请在 Windows 上执行。');
  }
  if (!existsSync(join(electronDist, 'electron.exe'))) {
    fail('没找到 node_modules/electron/dist，请先在仓库根执行 npm install。');
  }

  const version = appVersion();
  const stageName = `Zephyrlea-Molecule-Editor-${version}-win-x64`;
  const stageDir = join(outputRoot, stageName);
  const zipPath = join(outputRoot, `${stageName}.zip`);
  log(`版本 ${version}`);

  const python = pythonExe();
  ensureIcon();
  // 冻结后端要用 PyInstaller，改主程序图标也要用它。
  ensurePyInstaller(python);

  const outDir = buildRenderer();

  if (skipBackend) {
    if (!existsSync(standaloneBackend)) {
      fail(`--skip-backend 需要已有的 dist-green/${BACKEND_EXE}，请先完整跑一次 npm run build:green。`);
    }
    log(`复用已有后端：dist-green/${BACKEND_EXE}`);
  } else {
    freezeBackend(python);
  }

  stagePortable(outDir, stageDir);
  applyExeIcon(join(stageDir, APP_EXE), python);

  log(`便携目录：dist-green/${stageName}/（${megabytes(sizeOf(stageDir))}）`);
  if (noZip) {
    const stale = existsSync(zipPath) ? '，旧 zip 保持不变' : '';
    log(`已跳过 zip（--no-zip）${stale}。`);
  } else {
    zipStage(stageDir, zipPath);
    log(`压缩包：dist-green/${stageName}.zip（${megabytes(sizeOf(zipPath))}）`);
  }
  log('绿色版打包完成，整个 dist-green/ 可直接分发。');
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
