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
- 单键 / 双键 / 三键 / 楔形键 / 配位键 / 未知立体键、正负电荷、元素原子、R 基团以及各类环模板。
- 通过 `Kekule.IO.saveFormatData(model, 'smi')` 导出 SMILES，结果保存在 React state 中并复制到剪贴板。
- 支持载入 SMILES 并生成高质量 2D 坐标，同时提供 **整理（Clean Up）**。由于 Kekule 1.0.4 只自带 SMILES 写入器、没有读取器和坐标生成器，这里按需懒加载 OpenChemLib 作为辅助。
- 整理只重排坐标：保持当前缩放级别、滚动位置与键长不变，结构不会突然放大或跳动。
- 支持打开 `.mol`、`.sdf`、`.cml`、`.rxn`、`.kcj`、`.json`、`.smi` 文件。
- 撤销 / 重做、缩放、重置缩放、清空画布，以及键盘快捷键。
- Kekule 暗色渲染主题（原子与化学键为浅色），并通过抗锯齿与 2 倍超采样让线条更平滑。

## 目录结构

```text
public/vendor/kekule/       Kekule.js 1.0.4 官方 dist 包与主题 CSS 的本地副本（MIT）
src/components/             React 外壳：顶栏、工具栏、元素条、编辑器
src/components/icons/       自定义 SVG 化学图标
src/lib/editorBridge.ts     Kekule Composer 生命周期、工具切换、SMILES 读写、自适应视图
src/lib/moleculeLayout.ts   无坐标结构的纯 JS 兜底布局算法
src/index.css               Tailwind 入口 + Kekule 暗色外壳样式覆盖
```

## 关于 Kekule.js

- Kekule 使用官方 npm `dist` 包（`kekule.min.js` 1.0.4）的本地副本加载，而非实时 CDN，因此编辑器可离线使用，且版本固定。
- Kekule 1.0.4 的编辑器默认通过 **Canvas2D** 渲染桥绘制（也可使用 Raphael/SVG，但那不是编辑器的默认路径）。为了线条平滑，这里开启了渲染器的 `antialias` 与 2 倍 `overSamplingRatio`，并将 `bondLineWidth` 设为 1.5。
- 原生 Kekule 界面通过两层方式移除：清空 Composer 的工具按钮数组，并用 CSS 隐藏顶部/左侧/底部区域与高级面板。
- 编辑器的 `change` 事件用于驱动 React 侧的「空画布提示」，Kekule 不管理宿主容器之外的任何 DOM。

## 键盘快捷键

- `Ctrl/⌘ + Z` —— 撤销
- `Ctrl/⌘ + Shift + Z` —— 重做
- `Enter` —— 载入顶栏中的 SMILES
