# Zephyrlea · 分子结构编辑器

一个以画布为核心的暗色分子编辑器外壳，基于 **React 19 + Tailwind CSS 4** 与 **Kekule.js 1.0.4** 构建。

[English](./README.en.md)

本次为第一阶段交付：完整的编辑器布局、可用的 Kekule 编辑器实例、绘制工具、SMILES 导入/导出与结构整理。3D 视图按计划留待下一阶段实现。

## 快速开始

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 已实现功能

- 由 React 挂载的全屏 Kekule `Composer`，并隐藏 Kekule 自带的全部工具栏。
- 使用 React + Tailwind 自绘顶栏、元素快捷条与左侧垂直工具栏。
- 通过 Kekule 的交互控制器 API 切换绘制模式（`MolBondIaController`、`MolRingIaController`、`MolNodeChargeIaController`、`SelectIaController` 等），而不是重新实现绘图逻辑。
- 单键 / 双键 / 三键 / 楔形键（向上）/ 虚楔键（向下）/ 配位键 / 未知立体键、正负电荷（圆圈内加减号图标）、元素原子、R 基团以及各类环模板。
- 通过 `Kekule.IO.saveFormatData(model, 'smi')` 导出 SMILES，结果保存在 React state 中并复制到剪贴板。
- 支持载入 SMILES 并生成高质量 2D 坐标，同时提供 **整理（Clean Up）**。由于 Kekule 1.0.4 只自带 SMILES 写入器、没有读取器和坐标生成器，这里按需懒加载 OpenChemLib 作为辅助。
- 整理只重排坐标：保持当前缩放级别、滚动位置与键长不变，结构不会突然放大或跳动。
- 支持打开 `.mol`、`.sdf`、`.cml`、`.rxn`、`.kcj`、`.json`、`.smi` 文件。
- 撤销 / 重做、缩放、重置缩放、清空画布，以及键盘快捷键。
- 近乎无限的画布：绘制面远大于视口，靠近边界时自动把结构整体挪回中央，可以一直向任意方向平移，且结构始终留在画布内。
- 主题色统一由 `src/index.css` 里的 `--color-accent`（`#89B5FA`）控制，用于导出按钮、输入框聚焦环、提示图标与 R 基团按钮。
- Kekule 暗色渲染主题（原子与化学键为浅色），并通过抗锯齿与 2 倍超采样让线条更平滑。
- 原子标签按元素着色：N 蓝、O 红、S 黄、P 橙、卤素绿/紫等，与顶部元素条共用同一套配色；碳骨架保持浅灰，悬停与选中标记使用主题色。
- 化学键线宽、多重键间距均按键长等比缩放：放大后线条不会变细。
- 双键样式区分环内与链上：环内双键的第二根线始终画在环内侧并缩短至 72%，不会与相邻键并线或超出顶点；非环状（链状）双键保持原有样式，两根等长平行线完整贯穿两个原子。

## 目录结构

```text
public/vendor/kekule/       Kekule.js 1.0.4 官方 dist 包与主题 CSS 的本地副本（MIT）
src/components/             React 外壳：顶栏、工具栏、元素条、编辑器
src/components/icons/       自定义 SVG 化学图标
src/lib/editorBridge.ts     Kekule Composer 生命周期、工具切换、SMILES 读写、自适应视图
src/lib/editorBoard.ts      绘制面尺寸、无限平移（内容重定位）与缩放后的重新居中
src/lib/kekuleSpace.ts      Kekule 化学空间查询工具（分子、包围盒、滚动容器、坐标比例）
src/lib/kekuleBondStyle.ts  化学键线宽 / 双键间距 / 环内双键朝向的渲染补丁
src/lib/moleculeLayout.ts   无坐标结构的纯 JS 兜底布局算法
src/index.css               Tailwind 入口 + Kekule 暗色外壳样式覆盖
```

## 关于 Kekule.js

- Kekule 使用官方 npm `dist` 包（`kekule.min.js` 1.0.4）的本地副本加载，而非实时 CDN，因此编辑器可离线使用，且版本固定。
- Kekule 1.0.4 的编辑器默认通过 **Canvas2D** 渲染桥绘制（也可使用 Raphael/SVG，但那不是编辑器的默认路径）。为了线条平滑，这里开启了渲染器的 `antialias` 与 2 倍 `overSamplingRatio`，并将 `bondLineWidth` 设为 1.5。
- 原生 Kekule 界面通过两层方式移除：清空 Composer 的工具按钮数组，并用 CSS 隐藏顶部/左侧/底部区域与高级面板。
- Kekule 自带的 CPK 调色板是为白底设计的（碳为纯黑、氮为深蓝），这里替换成暗色专用调色板（见 `src/lib/elementColors.ts`）。另外 Kekule 以整行行高居中原子标签，大写字母会因此偏上、与化学键端点错开，所以把文本绘制位置下移 0.15em（`src/lib/kekuleLabelStyle.ts`）。
- 启动和清空画布时，视图居中于绘制面；同时自动扩大绘制面以覆盖整个视口，保证任意方向都能平移，不会卡在边缘。窗口尺寸变化时保留当前滚动位置。
- 「无限画布」：绘制面本身按视口的 4 倍展开（不小于 2600 渲染像素，单边最多 4608 渲染像素，避免多层 canvas 占用过多内存）。当平移靠近绘制面边界时，会把整幅结构整体挪回中央，并同步补偿滚动量，所以画面看起来完全不动，但可以一直朝任意方向平移；移动范围由结构本身兜底，结构永远不会被画到画布之外（多余空间会先自动扩大绘制面，达到上限后平移停在该方向）。
- 缩放、双击缩放或手势缩放后，会把结构重新放回绘制面中央（同样补偿滚动），因此在任何缩放级别都能向上下左右继续平移。绘制面尺寸始终跟随缩放级别调整，既不会越界，也不会随缩放无限膨胀。
- 编辑器的 `change` 事件用于驱动 React 侧的「空画布提示」，Kekule 不管理宿主容器之外的任何 DOM。

## 键盘快捷键

- `Ctrl/⌘ + Z` —— 撤销
- `Ctrl/⌘ + Shift + Z` —— 重做
- `Enter` —— 载入顶栏中的 SMILES
