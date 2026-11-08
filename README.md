# Zephyrlea · 分子结构编辑器

一个以画布为核心的暗色分子编辑器外壳，基于 **React 19 + Tailwind CSS 4** 与 **Kekule.js 1.0.4** 构建。

[English](./README.en.md)

本次为第一阶段交付：完整的编辑器布局、可用的 Kekule 编辑器实例、绘制工具、SMILES 导入/导出、结构整理与本地 3D 构象预览。

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
- 元素工具既能插入也能替换：选中元素后点击空白处插入新原子，点击画布上已有的原子则**就地替换该原子的元素**（化学键与相邻原子保持不变，可撤销）。
- 通过 `Kekule.IO.saveFormatData(model, 'smi')` 导出 SMILES，结果保存在 React state 中并复制到剪贴板。
- **结构校验（RDKit）**：每次编辑后用 RDKit（`@rdkit/rdkit` 的 WebAssembly 构建）检查画布上的每个结构，右侧「结构校验」面板实时显示结果（可收起为窄条）。出现价键异常（例如五价碳）时，面板列出中文说明与 RDKit 原始报错，画布上用红圈标出问题原子，同时禁用「整理」与「在 3D 中查看」，结构修正后自动恢复；非价键类的提示列在「其他提示」中，不会禁用按钮。
- **3D 视图**：顶栏「在 3D 中查看」打开模态窗口，用本地 WASM 引擎（`sci-form-wasm`）从当前画布的 SMILES 现场生成 3D 构象（固定 seed，同一结构结果一致），再用 3Dmol.js 渲染；双键 / 三键按两条 / 三条平行柱绘制，芳香环画成「实线 + 环内虚线」的大 π 键。窗口底部是一条统一工具栏，装着**模型样式切换**（球棍 / 空间填充 / 棍状 / 线框）、**重置视图**与**最大化**，默认**居中**，可在设置里改为靠左 / 靠右；最大化后按 `Esc` 先还原窗口，再按一次才关闭弹窗。显示方式也可在设置弹窗里改，两处同步。背景随主题切换（深色 `#171717` / 浅色 `#ffffff`），可拖拽旋转、滚轮缩放，角落标注「当前 3D 构象由本地算法生成，仅供参考」；关闭窗口时销毁 viewer，反复开关不会累积 canvas 或泄漏显存。存在价键错误或画布为空时不会打开。当前版本不访问 PubChem 等外部接口，全部计算在浏览器内完成。
- 支持载入 SMILES 并生成高质量 2D 坐标，同时提供 **整理（Clean Up）**。由于 Kekule 1.0.4 只自带 SMILES 写入器、没有读取器和坐标生成器，这里按需懒加载 OpenChemLib 作为辅助。
- 整理（Clean Up）会重排每个结构的坐标，并把画布上零散的结构**搬动**到屏幕中央：按原位置从上到下、从左到右排成整齐的行（多行时自动均衡行宽、行内垂直居中，间距一致），以当前视口中心为基准重排；缩放级别保持不变，只有排完仍放不下时才会缩小。单个结构已在屏幕内时不移动任何东西，只修正键角。
- 支持打开 `.mol`、`.sdf`、`.cml`、`.rxn`、`.kcj`、`.json`、`.smi` 文件。
- 撤销 / 重做、缩放、重置缩放、清空画布，以及键盘快捷键。
- 画布缩放限制在 40%–400%（Kekule 本身没有上下限）：到达边界后继续点击不会再有变化，顶栏对应的「放大 / 缩小」按钮自动禁用；按钮、滚轮 / 手势等所有缩放路径共用同一个限制。「适应画布 / 重置缩放」也在该范围内取最佳比例。
- 近乎无限的画布：绘制面远大于视口，靠近边界时自动把结构整体挪回中央，可以一直向任意方向平移，且结构始终留在画布内。
- **画板持久化**：画布上的结构、相对位置、缩放级别与平移位置自动保存在 `localStorage`（`zephyrlea.board`），刷新或重新打开页面后原样恢复，连缩放比例与视口位置都与刷新前一致；点「清空画布」会同时删除存档，刷新后不会复活。
- 主题色统一由 `src/index.css` 里的 `--color-accent`（`#89B5FA`）控制，用于导出按钮、输入框聚焦环、提示图标与 R 基团按钮。
- 「设置」按钮打开设置弹窗（模态窗口），五项设置都保持一行：**深色 / 浅色**主题、**工具栏位置**（底部 / 顶部，默认**底部**）、**3D 模型样式**（球棍 / 空间填充 / 棍状 / 线框，默认**球棍**）、**3D 工具栏位置**（靠左 / 居中 / 靠右，默认**居中**）、**是否隐藏碳/氢原子**。说明文字只留一句，详细解释放在悬停提示里；两个 3D 相关设置都用图标按钮表示，鼠标悬停显示名称。主题同时作用于整个界面、Kekule 画布的原子/键配色与双击弹出的选择面板；隐藏碳/氢原子开启时按骨架式绘制（碳不标注、氢仅在需要时显示），关闭后显示全部碳原子与氢的数量。设置保存在 `localStorage`，刷新后保持。
- 工具栏默认**置底**：画布贴近窗口顶部，向下依次是元素条（C / H / N / O…，下拉菜单向上弹出）、绘图工具栏（横排，窄窗口自动换行）与操作栏（SMILES / 整理 / 缩放 / 导出 / 设置），在大屏幕上鼠标移动距离更短；切到「顶部」则恢复「顶部操作栏 + 左侧竖直工具栏」的经典布局。浮动操作栏与提示会自动避让底部控制区。
- Kekule 暗色渲染主题（原子与化学键为浅色），并通过抗锯齿与 2 倍超采样让线条更平滑。
- 双击原子弹出的「原子 / 基团」选择面板与标签输入框也重绘为暗色（标签页、元素按钮、下拉箭头、滚动条）；「基团」页的预置取代基补上了中文名（`Me 甲基`、`Ph 苯基`、`OTs 对甲苯磺酰氧基`……，悬停提示为中文），选中后会把基团**展开成真实结构**（而不是只显示 `Ph`、`NO2` 之类的缩写），可以继续双击其中的原子继续替换；双击时不会再顺带选中原子，浮动操作栏不会挡住弹窗。
- 双击唤起该面板只在**选择 / 套索**工具下生效；使用加电荷、元素、化学键、橡皮擦等工具时，快速连续点击同一个原子只会重复该操作（例如连点两下得到 `2+`），不会弹出替换面板。
- 原子标签按元素着色：N 蓝、O 红、S 黄、P 橙、卤素绿/紫等，与顶部元素条共用同一套配色；碳骨架保持浅灰，悬停与选中标记使用主题色。
- 带电原子（离子）显示为「元素符号 + 上标电荷」（`C⁺`、`CH₃⁺`、`NH₂⁺`、`O⁻`），而不是一个悬空在原子旁边的电荷符号：电荷与自由基并入原子标签、标签固定水平排列，平时不标注的碳在带电后也会显示元素符号。
- 化学键线宽、多重键间距均按键长等比缩放：放大后线条不会变细。
- 双键样式区分环内与链上：环内双键的第二根线始终画在环内侧并缩短至 72%，不会与相邻键并线或超出顶点；非环状（链状）双键保持原有样式，两根等长平行线完整贯穿两个原子。
- 选择与套索是两个不同的工具：**选择**用矩形框选（单击可直接点选单个原子或化学键，按住 Shift 追加），**套索**用自由多边形勾选。两者共用 `SelectIaController`，只切换 `SelectMode`（`RECT` / `POLYGON`）。
- 选中后画布上方浮出一条操作栏，显示选中数量，并提供逆时针/顺时针旋转 15°、水平镜像、垂直镜像、删除。
- 选中框**不支持拉伸与对角缩放**（会破坏键长与键角），只保留拖动平移与在框外的旋转手柄；触摸双指缩放对选中的结构同样禁用。缩放视图请改用顶栏的缩放按钮。

## 目录结构

```text
public/vendor/kekule/       Kekule.js 1.0.4 官方 dist 包与主题 CSS 的本地副本（MIT）
src/components/             React 外壳：顶栏、工具栏、元素条、编辑器
src/components/icons/       自定义 SVG 化学图标
src/lib/editorBridge.ts     Kekule Composer 生命周期、工具切换、SMILES 读写、自适应视图
src/lib/editorBoard.ts      绘制面尺寸、无限平移（内容重定位）与缩放后的重新居中
src/lib/kekuleSpace.ts      Kekule 化学空间查询工具（分子、包围盒、滚动容器、坐标比例）
src/lib/kekuleBondStyle.ts  化学键线宽 / 双键间距 / 环内双键朝向的渲染补丁
src/lib/kekuleElectronLabel.ts  把电荷 / 自由基并入原子标签的渲染补丁（离子显示）
src/lib/elementColors.ts    深色 / 浅色两套元素配色（界面与画布共用）
src/lib/settings.ts         设置模型、localStorage 持久化与主题应用
src/lib/boardPersistence.ts 画板自动保存 / 恢复（结构 molblock、原子坐标、缩放与视口位置）
src/lib/rdkit.ts            RDKit WASM 加载、化学问题检测与开发模式自检入口
src/lib/structureValidation.ts  校验结果模型、价键错误归类与中文说明
src/lib/conformer3d.ts      sci-form-wasm 引擎加载、3D 构象生成与 molblock 序列化
src/components/SettingsModal.tsx  设置弹窗（主题切换、3D 模型样式、隐藏碳/氢原子）
src/components/Model3DSwitch.tsx  3D 模型样式选择器（图标按钮，设置弹窗用）
src/components/Viewer3DToolbar.tsx  3D 窗口底部工具栏（模型样式 + 重置视图 + 最大化）
src/components/ui/IconRadioGroup.tsx  图标单选组与边框容器（两处 3D 设置共用）
src/components/Viewer3DModal.tsx  3D 视图弹窗（3Dmol.js 球棍 / 空间填充 / 棍状 / 线框渲染）
src/components/ValidationPanel.tsx  右侧「结构校验」面板
src/components/ValidationOverlay.tsx  画布上标记问题原子的红圈层
src/lib/moleculeLayout.ts   无坐标结构的纯 JS 兜底布局算法
src/index.css               Tailwind 入口 + Kekule 暗色外壳样式覆盖
```

## 关于 Kekule.js

- Kekule 使用官方 npm `dist` 包（`kekule.min.js` 1.0.4）的本地副本加载，而非实时 CDN，因此编辑器可离线使用，且版本固定。
- Kekule 1.0.4 的编辑器默认通过 **Canvas2D** 渲染桥绘制（也可使用 Raphael/SVG，但那不是编辑器的默认路径）。为了线条平滑，这里开启了渲染器的 `antialias` 与 2 倍 `overSamplingRatio`，并将 `bondLineWidth` 设为 1.5。
- 原生 Kekule 界面通过两层方式移除：清空 Composer 的工具按钮数组，并用 CSS 隐藏顶部/左侧/底部区域与高级面板。
- 两套主题由 `<html data-theme="dark|light">` 驱动一套 `--shell-*` CSS 变量，`src/index.css` 用 `@theme inline` 把它们映射成 Tailwind 颜色（`bg-panel`、`text-ink`、`border-line`…），因此切换主题不需要改任何组件代码。`index.html` 在首屏渲染前读取 `localStorage` 设置，避免闪白。
- 主题切换时 `editorBridge.applySettings()` 会重写 Kekule 的渲染配置（原子/键/字形颜色、元素调色板、选中标记色）并重绘；碳/氢的显示则由 `defMoleculeDisplayType`（`SKELETAL` / `CONDENSED`）与 `defHydrogenDisplayLevel`（`DEFAULT` / `ALL`）控制。
- Kekule 的 `BaseEditorIaController` 会在任何工具下响应双击、弹出内联的原子/标签编辑器。这里覆写该方法，只在 `SelectIaController`（选择 / 套索）下放行，其它工具的双击保留给工具本身（例如连点加电荷）。
- Kekule 自带的 CPK 调色板是为白底设计的（碳为纯黑、氮为深蓝），这里替换成暗色专用调色板（见 `src/lib/elementColors.ts`）。另外 Kekule 以整行行高居中原子标签，大写字母会因此偏上、与化学键端点错开，所以把文本绘制位置下移 0.15em（`src/lib/kekuleLabelStyle.ts`）。
- Kekule 会把形式电荷/自由基画成独立的 `ChemMarker` 对象、停在原子四周「最空」的方向，同时让未标注的碳不显示元素符号——于是阳离子只剩下一个悬空的「+」。`src/lib/kekuleElectronLabel.ts` 关闭这种自动生成的标记，把电荷/自由基并入原子标签作为上标（氢写在电荷之前，显示 `CH₃⁺` 而不是 `C⁺H₃`），对带电原子强制绘制并水平排布标签，并屏蔽已经由标签表达的标记，避免重复绘制。
- 启动和清空画布时，视图居中于绘制面；同时自动扩大绘制面以覆盖整个视口，保证任意方向都能平移，不会卡在边缘。窗口尺寸变化时保留当前滚动位置。
- 「无限画布」：绘制面本身按视口的 4 倍展开（不小于 2600 渲染像素，单边最多 4608 渲染像素，避免多层 canvas 占用过多内存）。当平移靠近绘制面边界时，会把整幅结构整体挪回中央，并同步补偿滚动量，所以画面看起来完全不动，但可以一直朝任意方向平移；移动范围由结构本身兜底，结构永远不会被画到画布之外（多余空间会先自动扩大绘制面，达到上限后平移停在该方向）。
- 缩放、双击缩放或手势缩放后，会把结构重新放回绘制面中央（同样补偿滚动），因此在任何缩放级别都能向上下左右继续平移。绘制面尺寸始终跟随缩放级别调整，既不会越界，也不会随缩放无限膨胀。
- 缩放上下限写在 `src/lib/editorBoard.ts`（`MIN_ZOOM` / `MAX_ZOOM`），通过对 `editor.zoomTo` 的包装统一钳制，因此按钮、滚轮、手势、双击与程序化适配（整理 / 适应画布）都走同一套边界。
- 编辑器的 `change` 事件用于驱动 React 侧的「空画布提示」，Kekule 不管理宿主容器之外的任何 DOM。

## 关于画板持久化

- 存档写在 `localStorage` 的 `zephyrlea.board` 下（`src/lib/boardPersistence.ts`），与设置项（`zephyrlea.settings`）分开。内容变化、缩放、页面隐藏（`pagehide` / `visibilitychange`）或编辑器销毁时都会写入；编辑过程中防抖 600ms，避免每画一笔就序列化一次。
- 每个结构保存为 **V2000 molblock**（`Kekule.IO.saveFormatData(mol, 'mol')`），另外附上每个原子的**绝对坐标**：molblock 只保留原子间的相对位置，而编辑器移动的是整个结构（`_shiftChemSpaceChildCoord` 改的是结构自身坐标），两者结合才能在恢复后保住结构之间的相对排布。恢复时用 `K.IO.loadFormatData` 解析 molblock，把结构自身偏移归零后写回原子坐标，再追加到化学空间。
- 视图保存的是**视口中心相对结构包围盒中心的偏移量**，而不是绝对坐标：编辑器布局时会整体挪动结构（重新居中、扩大绘制面），绝对坐标会随之失效，相对偏移则不受影响。恢复时先还原缩放，再按当前包围盒算出目标中心，并在 140 / 400 / 800ms 后重复校正——Kekule 会在布局结束后异步重置滚动位置。
- 载入结构时 Kekule 会按该结构的键长自动缩放绘制面（`objScreenLengthRatio` = `defAutoScaleRefLength` / `defBondLength`）。只恢复结构会退回默认比例，画面比刷新前放大约 1.9 倍，因此存档里同时记下这两个数值，恢复时写回并重新计算绘制面尺寸。
- 恢复发生在首帧布局（`composer.resized()`）之后：先追加结构、再恢复比例与缩放、最后校正视口；没有存档时仍走原来的空画布居中逻辑。

## 关于 RDKit 校验

- 校验引擎是 `@rdkit/rdkit`（RDKit MinimalLib 的 WebAssembly 构建，7.4 MB）。wasm 通过 `import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url'` 交给 Vite 打包，并在 `locateFile` 中指回该地址，因此开发与生产构建都能离线运行。
- 结构先用 `RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }))` 载入：开启 sanitize 时 RDKit 会直接拒绝非法结构并返回 `null`，拿不到可检查的对象。SMILES 解析失败时退回 molblock 再试一次。
- `@rdkit/rdkit` 2026.9.2 的类型定义（`dist/RDKit_minimal.d.ts`）与 wasm 绑定中**没有** `detect_chemistry_problems`（`Mol` 原型上没有该方法，wasm 里也没有该符号）。因此这里改用 `RDKit.set_log_capture('rdApp.error')` 捕获 sanitizer 输出的原始异常文本（`Explicit valence for atom # 0 C, 5, is greater than permitted`），再归类为 `AtomValenceException`；如果将来的版本提供了该方法，代码会优先调用 `mol.detect_chemistry_problems()`。
- 问题原子的定位使用同一结构的 **molblock**（`Kekule.IO.saveFormatData(mol, 'mol')`）：Kekule 写出的 molblock 原子顺序与画布节点顺序一致，RDKit 报错里的原子序号可以直接映射到画布节点；而 SMILES 是按遍历顺序写出的，序号与节点顺序不同，无法用来定位。
- 每次校验都在 `finally` 中调用 `mol.delete()`（包括临时用来触发 sanitize 的对象），避免 WASM 堆内存泄漏；多次校验通过一条 Promise 队列串行执行，避免日志捕获互相干扰。
- 校验在编辑事件的下一帧之后再防抖 220ms 触发；`editorBridge` 的 `onContentChange` 会带上递增的 `revision`，React 侧据此决定是否重跑 RDKit。
- 红圈是一层 `pointer-events-none` 的 SVG 覆盖层，逐帧读取 `editor.objCoordToScreen()`，因此缩放、平移、整理、拖动原子时都会跟随；圆圈半径按相邻键长的一半缩放。
- 开发模式下可在浏览器控制台调用 `__zephyrleaDetectChemistryProblems({ smiles, molfile })`，或 `__zephyrleaRunDetectionSelfTest()`（用 `C` 与 `C(C)(C)(C)(C)(C)` 打印检测结果）来复现检测逻辑。

## 关于 3D 视图

- 3D 构象由 `sci-form-wasm` 在浏览器内计算（不访问 PubChem 等外部接口）：先 `await init()` 初始化 WASM 模块，再 `JSON.parse(embed(smiles, 42))` 拿到 `{ num_atoms, coords, elements, bonds }`。`elements` 是原子序数数组，`coords` 是扁平化的 `x,y,z` 序列，`bonds` 是 `[起, 止, "SINGLE" | "DOUBLE" | "TRIPLE" | "AROMATIC"]` 三元组。
- 结果被拼成 **V2000 molblock**（保留键级），交给 `viewer.addModel(molblock, 'sdf')`。只用 XYZ 的话格式里没有键信息，3Dmol 只能按距离猜键、并全部画成单键；molblock 带上了键级，3Dmol 就会自己把双键 / 三键画成两条 / 三条平行圆柱，芳香键则画成「实线 + 环内虚线」的大 π 键（`aromaticStyle: 'dashed'`，即默认样式）。
- 渲染样式由 `MODEL_STYLE_SPECS` 决定，分四种：**球棍**（`stick` + `sphere: { scale: 0.3 }`，默认）、**空间填充**（仅 `sphere: { scale: 1 }`，按范德华半径铺满）、**棍状**（仅 `stick`）、**线框**（半径 0.05 的细棍）。球棍与棍状用的是半径 0.15 的细棍（3Dmol 默认 0.25），单键更轻；同时把多重键比例提高到 `doubleBondScaling: 0.55` / `tripleBondScaling: 0.45`，细棍下双键 / 三键仍清晰可辨。线框没有用 3Dmol 的 `line` 样式，是因为 WebGL 的 `lineWidth` 在主流浏览器上被限制为 1px，在暗色背景上几乎看不见。
- 切换样式只调用 `viewer.setStyle()` 再重新适配视图，不会重建模型，所以当前旋转角度保持不变；重新适配（`zoomTo()` + 空间填充时额外拉远 25%）是为了让更大的球体仍留在画面内。样式存在 `settings.model3DStyle`（`localStorage`），设置弹窗与 3D 窗口底部工具栏共用同一份 `Model3DSwitch` 选项定义，两处改动互相同步。
- 底部工具栏把模型样式、重置视图、最大化放在同一个药丸形容器里（`pointer-events-none` 的外层负责定位，内层恢复交互），对齐方式由 `settings.viewer3DToolbarAlign` 决定：`justify-start` / `justify-center` / `justify-end`，默认居中。提示文字因此移到画布左上角，避免与靠左的工具栏重叠。
- 重置视图不是 3Dmol 自带的 API：它把 `setView()` 的平移归零、旋转四元数设为单位四元数（`[0,0,0,z,0,0,0,1]`），再按当前样式重新 `zoomTo()`，所以「重置」后的画面与刚打开弹窗时完全一致。
- 最大化只是切换弹窗容器尺寸（`h-full w-full max-w-none` + 外层内边距 `p-2`），canvas 由 `ResizeObserver` 触发 `viewer.resize()` 重排，模型不被重建；`Esc` 在最大化时只还原窗口，再按一次才关闭。
- `sci-form-wasm` 的 `exports` 只暴露了 `.`、`./alpha`、`./beta`，wasm 二进制无法用子路径导入。`vite.config.ts` 里把 `sci-form-wasm/wasm` 别名到真实的 `sci_form_wasm_bg.wasm`，代码再用 `import wasmUrl from 'sci-form-wasm/wasm?url'` 取得资源地址并显式传给 `init({ module_or_path })`，开发与生产构建行为一致。
- `embed()` 是同步 WASM 调用，会阻塞主线程；调用前先让出一帧（`requestAnimationFrame`），保证弹窗先画出「正在计算 3D 构象…」的加载态。
- 3Dmol（约 570 KB）通过动态 `import('3dmol')` 懒加载，不进首屏包。它本身是 webpack 的 UMD 产物，导入时对 `default` 与命名空间两种互操作形态都做了兼容。
- 关闭弹窗（或切换结构、点重试）时执行 `viewer.clear()` 并移除 canvas，viewer 引用置空，因此重复开关不会累积 canvas，也不会因为 WebGL 上下文过多而被浏览器回收。
- `smiles`、`theme` 与 `modelStyle` 的处理方式不同：`smiles` 变化会重建模型，主题变化只调用一次 `setBackgroundColor()`，样式变化只调用 `setStyle()`，因此切换主题或显示方式都不会丢掉用户已经拖好的视角。

## 键盘快捷键

- `Ctrl/⌘ + Z` —— 撤销
- `Ctrl/⌘ + Shift + Z` —— 重做
- `Enter` —— 载入顶栏中的 SMILES

## 开源协议

本项目基于 [MIT 协议](LICENSE) 发布。

Copyright (c) 2026 paliku520（云野风云ZephyrLea.）
