# Zephyrlea · 分子结构编辑器

一个面向中学化学的轻量化小分子结构编辑器，基于 **React 19 + Tailwind CSS 4** 与 **Kekule.js 1.0.4** 构建。逐笔绘制结构、粘贴 SMILES、RDKit 实时分析价键、切到 3D 查看构象，并能导出 SMILES 文本与透明背景的 PNG / SVG 图片 —— 化学计算由随应用运行的本地 Python 服务完成，不上传任何数据。

> 本项目**只提供中文文档**，不再维护英文版本。
>
> 使用、部署或分发前请先阅读 [免责声明](DISCLAIMER.md)：仅供教学与学习，禁止任何非法或危险用途。

## 快速开始

仓库采用 npm workspaces 单仓结构：

| 目录 | 说明 |
| --- | --- |
| `apps/web-local/` | React + Vite 前端，同时是桌面版的渲染层；化学计算全部走本地后端 |
| `apps/desktop/` | Electron 外壳，负责窗口、IPC 与原生另存 |
| `apps/backend/` | Python（FastAPI + 原生 RDKit）本地计算服务，化学计算全在这里 |
| `scripts/` | 版本号同步与纯静态版构建脚本 |

> 前端不再内置任何 WebAssembly 计算引擎：分子分析、2D 坐标与 3D 构象都向本地后端请求。没有后端的纯静态页面会提示「未连接本地计算引擎，请确保软件已正确安装运行」。

单独跑前端（需要同时启动本地服务）：

```bash
npm install
npm run dev:backend    # 终端 A：本地计算服务，固定 8765
npm run dev:web        # 终端 B：前端
```

生产构建与本地预览：

```bash
npm run build:web
npm run preview --workspace=apps/web-local
```

### 桌面版（Electron）

首次运行前准备 Python 环境（Windows）：

```bash
python -m venv apps/backend/.venv
apps/backend/.venv/Scripts/python.exe -m pip install -r apps/backend/requirements.txt
```

然后启动或构建：

```bash
npm run dev:desktop     # 开发模式，窗口 + 本地计算服务热更新
npm run build:desktop   # 构建到 apps/desktop/out
npm run smoke:desktop   # 端到端冒烟：preload → IPC → Python → 分析面板
```

桌面版在启动时会自动拉起 `apps/backend/main.py`（随机端口 + 每次启动生成的一次性 token，只监听 `127.0.0.1`），窗口关闭时一并退出。需要指定其他解释器时设置环境变量 `ZEPHYRLEA_PYTHON`。图片导出改为系统「另存为」对话框，由主进程直接写盘。

本地服务提供四个接口：`/health`、`/analyze`（分子分析 + 价键校验）、`/api/layout2d`（RDKit 2D 坐标）、`/api/embed3d`（RDKit ETKDG + MMFF 构象）。桌面版全部经 IPC 访问；前端没有后端桥时不会退回任何 WASM 引擎，而是直接提示「未连接本地计算引擎」。想用浏览器直连本地服务调试时，先 `npm run dev:backend`（固定 8765 端口），再在页面控制台设置 `window.__zephyrleaBackendUrl = 'http://127.0.0.1:8765'`（或构建期提供 `VITE_ZEPHYRLEA_BACKEND`）。

发版时用脚本统一改版本号（同时写入 `apps/desktop/package.json`、`apps/web-local/package.json` 与 `apps/web-local/src/lib/version.ts`）：

```bash
python scripts/bump_version.py 0.2.0      # 指定版本
python scripts/bump_version.py --bump patch   # 0.1.0 -> 0.1.1
python scripts/bump_version.py --check    # 版本不一致时退出码 1
```

## 功能速览

- **绘制**：元素原子、单 / 双 / 三键、楔形键、虚楔键、配位键、正负电荷、R 基团与各类环模板；元素工具既能插入也能就地替换已有原子，全部操作可撤销 / 重做。
- **交互外壳**：React + Tailwind 自绘页眉、元素条、绘图工具栏与操作栏，工具栏默认置底、可切到顶部；深色 / 浅色主题同时作用于画布与弹窗。
- **自绘窗口**（桌面版）：无边框窗口，系统标题栏与最小化 / 最大化 / 关闭按钮全部由界面自绘（含悬停配色与最大化后的还原图标），页眉空白处即可拖动、双击最大化；日志窗口同一套标题栏，图标取自浏览器 favicon。
- **元素与标签**：自绘 118 元素周期表，原子标签按元素着色，离子显示为 `CH₃⁺` / `O⁻` 等带电荷标签；双击原子或 R 基团即可改名，隐藏碳 / 氢时按骨架式绘制。
- **选择与变换**：矩形选择与自由套索两种工具，选中后画布顶部中央固定一条操作栏，可旋转 15°、水平 / 垂直镜像或删除。
- **分子分析（RDKit）**：自动计算分子式、相对 / 精确质量、原子与键数量、环数、可旋转键、氢键供体 / 受体、TPSA、cLogP 与规范 SMILES。
- **结构校验（RDKit）**：检出价键异常时列出中文说明、在画布上标红问题原子，并禁用「整理结构」与「在 3D 中查看」。
- **3D 视图**：本地 RDKit（ETKDG + 力场优化）生成构象、3Dmol.js 渲染，支持球棍 / 空间填充 / 棍状 / 线框四种样式、氢原子显示开关、芳香环大 π 键（可切回单双键交替）、拖拽方式切换、重置视图、截图与最大化。
- **导入导出**：SMILES 粘贴导入并生成 2D 坐标；可打开 `.mol`、`.sdf`、`.cml`、`.rxn`、`.kcj`、`.json`、`.smi`，导出 SMILES 文本或透明背景的 2× PNG / 矢量 SVG。
- **视图整理**：一键把散落的结构排成整齐的行列（整理视图），或由本地 RDKit 重算规范 2D 坐标（整理结构）。
- **画布**：近乎无限平移，缩放限制在 20%–800%，空画布提示与快捷键齐备。
- **持久化**：结构、相对位置、缩放与视口自动保存在 `localStorage`，刷新后原样恢复；「清空画布」同时删除存档。
- **系统日志**：独立窗口集中显示 Python 后端、Electron 主进程与界面的日志，带时间戳与级别配色，支持级别筛选、自动滚动开关、清空与一键复制（最多保留 1000 条）。

逐条的功能细节、界面行为与已知取舍见 [功能详解](docs/FEATURES.md)，目录结构与实现说明见 [实现要点](docs/IMPLEMENTATION.md)。

## 键盘快捷键

- `Ctrl/⌘ + Z` —— 撤销
- `Ctrl/⌘ + Shift + Z` —— 重做
- `Enter` —— 载入顶栏中的 SMILES
- `Ctrl/⌘ + Shift + L` —— 打开（或聚焦）系统日志窗口

## 部署与托管

当前 `main` 分支只发布**桌面版**：前端的化学计算全部依赖随应用启动的本地 Python 服务，`apps/web-local/dist/` 单独部署时没有计算引擎（界面会提示「未连接本地计算引擎」）。

需要对外的纯静态网页版固定在 `v0.1.0` tag 上，它是一份完整独立的前端工程（自带 RDKit / OpenChemLib / sci-form 三套 WASM 引擎，产物约 20 MB）。一条命令即可从 tag 构建出来：

```bash
npm run build:web:static
# 结果在 dist-static/，临时 worktree 会自动清理
```

脚本做的事：确认 `v0.1.0` 存在（本地缺失时先 `git fetch` 该 tag；CI 浅克隆取不到时退回直接浅克隆该 tag）→ 检出到 `.temp-static/` → 在临时目录 `npm ci && npm run build` → 把产物复制到 `dist-static/` → 删除临时目录。`.temp-static/` 与 `dist-static/` 都已加入 `.gitignore`。

- **Cloudflare Pages**：构建命令 `npm run build:web:static`，输出目录 `dist-static`。Cloudflare 的克隆是浅克隆、不带 tag，脚本会自行从远端把 `v0.1.0` 取回来，无需额外配置，但构建环境需要能访问 GitHub。
- **Vercel / Netlify**：同上，或用 `v0.1.0` tag 直接构建（命令 `npm run build`，输出 `dist`）。
- **GitHub Pages**：项目站点挂在 `/<仓库名>/` 下，构建要带路径：`npm run build -- --base=/zephyrlea-molecule-editor/`（自定义域名或用户主页站点用默认的 `--base=/`）。
- **自建服务器**：`npm run build -- --base=/molecule/`，把产物放进对应子目录，并让 `.wasm` 以 `application/wasm` 返回、开启 gzip / Brotli。
- 注意：剪贴板 API 需要 HTTPS（或 localhost）；画板存档在浏览器 `localStorage` 中、按域名隔离；没有前端路由，因此不需要 `404.html` 回退。

部署者需自行承担实例的运营、合规与安全责任，详见 [免责声明](DISCLAIMER.md)。

## 文档

- [功能详解](docs/FEATURES.md) —— 每一项功能的完整行为说明
- [实现要点](docs/IMPLEMENTATION.md) —— 目录结构、Kekule / RDKit / 3D / 导出等实现细节
- [免责声明](DISCLAIMER.md) —— 使用范围、禁止用途与责任划分

## 开源协议

本项目基于 [MIT 协议](LICENSE) 发布。

Copyright (c) 2026 paliku520（云野风云ZephyrLea.）
