# Zephyrlea · 分子结构编辑器

一个面向中学化学的轻量化小分子结构编辑器，基于 **React 19 + Tailwind CSS 4** 与 **Kekule.js 1.0.4** 构建。逐笔绘制结构、粘贴 SMILES、RDKit 实时分析价键、切到 3D 查看构象，并能导出 SMILES 文本与透明背景的 PNG / SVG 图片 —— 全部计算都在浏览器本地完成，没有后端。

> 本项目**只提供中文文档**，不再维护英文版本。
>
> 使用、部署或分发前请先阅读 [免责声明](DISCLAIMER.md)：仅供教学与学习，禁止任何非法或危险用途。

## 快速开始

仓库采用 npm workspaces 单仓结构：Web 端在 `apps/web/`，本地后端占位在 `apps/backend/`。

```bash
npm install
npm run dev:web
```

生产构建与本地预览：

```bash
npm run build:web
npm run preview --workspace=apps/web
```

## 功能速览

- **绘制**：元素原子、单 / 双 / 三键、楔形键、虚楔键、配位键、正负电荷、R 基团与各类环模板；元素工具既能插入也能就地替换已有原子，全部操作可撤销 / 重做。
- **交互外壳**：React + Tailwind 自绘页眉、元素条、绘图工具栏与操作栏，工具栏默认置底、可切到顶部；深色 / 浅色主题同时作用于画布与弹窗。
- **元素与标签**：自绘 118 元素周期表，原子标签按元素着色，离子显示为 `CH₃⁺` / `O⁻` 等带电荷标签；双击原子或 R 基团即可改名，隐藏碳 / 氢时按骨架式绘制。
- **选择与变换**：矩形选择与自由套索两种工具，选中后可旋转 15°、水平 / 垂直镜像或删除。
- **分子分析（RDKit）**：自动计算分子式、相对 / 精确质量、原子与键数量、环数、可旋转键、氢键供体 / 受体、TPSA、cLogP 与规范 SMILES。
- **结构校验（RDKit）**：检出价键异常时列出中文说明、在画布上标红问题原子，并禁用「整理结构」与「在 3D 中查看」。
- **3D 视图**：用本地 WASM 引擎生成构象、3Dmol.js 渲染，支持球棍 / 空间填充 / 棍状 / 线框四种样式、拖拽方式切换、重置视图、截图与最大化。
- **导入导出**：SMILES 粘贴导入并生成 2D 坐标；可打开 `.mol`、`.sdf`、`.cml`、`.rxn`、`.kcj`、`.json`、`.smi`，导出 SMILES 文本或透明背景的 2× PNG / 矢量 SVG。
- **视图整理**：一键把散落的结构排成整齐的行列（整理视图），或用 OpenChemLib 重算规范 2D 坐标（整理结构）。
- **画布**：近乎无限平移，缩放限制在 20%–800%，空画布提示与快捷键齐备。
- **持久化**：结构、相对位置、缩放与视口自动保存在 `localStorage`，刷新后原样恢复；「清空画布」同时删除存档。

逐条的功能细节、界面行为与已知取舍见 [功能详解](docs/FEATURES.md)，目录结构与实现说明见 [实现要点](docs/IMPLEMENTATION.md)。

## 键盘快捷键

- `Ctrl/⌘ + Z` —— 撤销
- `Ctrl/⌘ + Shift + Z` —— 重做
- `Enter` —— 载入顶栏中的 SMILES

## 部署与托管

Web 端构建产物是纯静态站点（`apps/web/dist/`），当前没有后端：`npm run build:web` 之后把 `apps/web/dist/` 交给任意静态托管即可。首次打开会按需下载约 16 MB 的 WebAssembly（RDKit + 三维构象引擎），其余全部在本地运行，不访问任何外部接口。

- **Vercel / Netlify / Cloudflare Pages**：导入仓库，构建命令 `npm run build:web`，输出目录 `apps/web/dist`，其余保持默认；部署在域名根目录时无需额外配置。
- **GitHub Pages**：Settings → Pages → Source 选 **GitHub Actions**，用官方 Pages 模板构建并上传 `apps/web/dist`。项目站点挂在 `/<仓库名>/` 下，所以构建要带路径：`npm run build --workspace=apps/web -- --base=/zephyrlea-molecule-editor/`（自定义域名或用户主页站点用默认的 `--base=/`）。也可以手动构建后把 `apps/web/dist/` 推到 `gh-pages` 分支。
- **自建服务器**：`npm run build --workspace=apps/web -- --base=/molecule/`，把 `apps/web/dist/` 放进对应子目录，并让 `.wasm` 以 `application/wasm` 返回、开启 gzip / Brotli。
- 注意：剪贴板 API 需要 HTTPS（或 localhost）；画板存档在浏览器 `localStorage` 中、按域名隔离；没有前端路由，因此不需要 `404.html` 回退。

部署者需自行承担实例的运营、合规与安全责任，详见 [免责声明](DISCLAIMER.md)。

## 文档

- [功能详解](docs/FEATURES.md) —— 每一项功能的完整行为说明
- [实现要点](docs/IMPLEMENTATION.md) —— 目录结构、Kekule / RDKit / 3D / 导出等实现细节
- [免责声明](DISCLAIMER.md) —— 使用范围、禁止用途与责任划分

## 开源协议

本项目基于 [MIT 协议](LICENSE) 发布。

Copyright (c) 2026 paliku520（云野风云ZephyrLea.）
