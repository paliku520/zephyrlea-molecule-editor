# 实现要点

本文件收录目录结构与实现细节，供二次开发参考。本项目文档只提供中文版本。

## 目录结构

仓库使用 npm workspaces：渲染层位于 `apps/web-local/`，桌面外壳位于 `apps/desktop/`，本地计算服务位于 `apps/backend/`。下表中 `src/`、`public/`、`index.html`、`vite.config.ts` 等路径均相对 `apps/web-local/`。

```text
scripts/bump_version.py      同步三处版本号
scripts/build-static.mjs     从 v0.1.0 tag 构建纯静态版到 dist-static/
apps/backend/main.py        本地计算服务入口（FastAPI + 原生 RDKit）
apps/backend/zephyrlea_backend/chem.py    结构分析 / 2D 布局 / 3D 构象
apps/backend/zephyrlea_backend/app.py     HTTP 路由、token 校验与 CORS
apps/backend/requirements.txt              Python 依赖（rdkit / fastapi / uvicorn）
apps/desktop/src/main/index.ts            Electron 主进程：窗口、IPC、原生另存
apps/desktop/src/main/backend.ts          Python 子进程生命周期与 HTTP 客户端
apps/desktop/src/main/self-test.ts        `--self-test` 端到端冒烟
apps/desktop/src/preload/index.ts         contextBridge：window.zephyrlea
apps/desktop/electron.vite.config.ts      主进程 / preload / 渲染层（root 指向 apps/web-local）
apps/web-local/vite.shared.ts                   两个构建共用的插件与静默日志
apps/web-local/src/lib/desktop.ts               桌面桥接口与探测
apps/web-local/src/lib/chemistryTypes.ts        分析 / 2D / 3D 的数据契约（桥与后端共用）
apps/web-local/src/lib/chemistryBackend.ts      唯一的化学计算入口（本地服务，无 WASM 兜底）
apps/web-local/public/vendor/kekule/       Kekule.js 1.0.4 官方 dist 包与主题 CSS 的本地副本（MIT）
src/components/             React 外壳：顶栏、工具栏、元素条、编辑器
src/components/AppHeader.tsx  页眉：标题、关于入口与 GitHub 仓库跳转
src/components/AboutModal.tsx 关于弹窗：简介、技术栈、MIT 协议全文与作者（`LICENSE?raw` 内联）
src/components/icons/       自定义 SVG 化学图标
src/lib/editorBridge.ts     Kekule Composer 生命周期、工具切换、SMILES 读写、自适应视图
src/lib/editorBoard.ts      绘制面尺寸、无限平移（内容重定位）与缩放后的重新居中
src/lib/kekuleSpace.ts      Kekule 化学空间查询工具（分子、包围盒、滚动容器、坐标比例）
src/lib/kekuleBondStyle.ts  化学键线宽 / 双键间距 / 环内双键朝向的渲染补丁
src/lib/kekuleElectronLabel.ts  把电荷 / 自由基并入原子标签的渲染补丁（离子显示）
src/lib/kekuleNodeSetter.ts  R 基团的双击标签编辑（SubGroup 注册到原子编辑器）、仅原子选择面板与自绘周期表的接管
src/lib/periodicTable.ts    元素周期表的符号表与标准长式布局（118 种元素）
src/components/PeriodicTableModal.tsx  自绘元素周期表弹窗（元素条与双击标签框共用）
src/lib/elementColors.ts    深色 / 浅色两套元素配色（界面与画布共用）
src/lib/settings.ts         设置模型、localStorage 持久化与主题应用
src/lib/site.ts             页眉与关于弹窗共用的仓库链接、文档与免责声明入口
src/lib/version.ts          版本号唯一来源（页眉徽标、关于弹窗、浏览器标题共用）
src/lib/boardPersistence.ts 画板自动保存 / 恢复（结构 molblock、原子坐标、缩放与视口位置）
src/lib/structureValidation.ts  分析 + 校验结果模型、价键错误归类与中文说明
src/lib/conformer3d.ts      3D 构象（向本地后端请求，多结构已由后端排好）
src/components/SettingsModal.tsx  设置弹窗（主题切换、3D 模型样式、隐藏碳/氢原子）
src/components/Model3DSwitch.tsx  3D 模型样式选择器（图标按钮，设置弹窗用）
src/components/Viewer3DToolbar.tsx  3D 窗口底部工具栏（模型样式 + 拖拽方式 + 重置视图 + 最大化）
src/components/ui/IconRadioGroup.tsx  图标单选组与边框容器（两处 3D 设置共用）
src/components/Viewer3DModal.tsx  3D 视图弹窗（3Dmol.js 球棍 / 空间填充 / 棍状 / 线框渲染）
src/components/AnalysisPanel.tsx  右侧「分子分析」面板（可折叠卡片 + 结构校验）
src/components/ValidationOverlay.tsx  画布上标记问题原子的红圈层
src/lib/moleculeLayout.ts   无坐标结构的纯 JS 兜底布局算法
src/lib/moleculeExport.ts   画板导出：测量墨水包围盒、Kekule → SVG、再栅格化为 2× 透明 PNG
src/lib/download.ts         浏览器下载与导出文件名工具
src/types/svgcanvas.d.ts    svgcanvas 的最小类型声明
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
- R 基团在 Kekule 里是 `Kekule.SubGroup`（`RGroup` 只是它的别名），它有两个副作用：面板注册表里**没有**它的双击编辑器（双击无反应），而绘制 `SubGroup` 时只要被「展开」就会因为内部没有原子而完全不可见。`src/lib/kekuleNodeSetter.ts` 把原子的内联编辑器注册给 `SubGroup`，并把输入框的值（`R`、`R1`…）改写回 `abbr`，因此 R 基团既可双击改名，也可输入元素符号就地替换；`editorBridge.ts` 的 `expandCollapsedGroups()` 只展开**含有原子**的 `SubGroup`（预置缩写基团），R 基团保持收起状态才会画出 `R` 标签。双击面板中的预置取代基模板（`Ph`、`NO2`…）已移除，元素与 R 基团之外一律自行绘制。
- 双击面板的「…」（更多）按钮原本会弹出 Kekule 自带的周期表窗口，那套窗口不跟随应用的深色 / 浅色主题。`installPeriodicTablePicker()` 覆写 `StructureNodeSelectPanel._openPeriodicTableDialog`：普通元素选择改由 React 的自绘周期表接管（`PeriodicTableModal`），选中后仍走 Kekule 的 `doValueChanged()`，与原生流程一样落到 `applySetter`，因此就地替换、撤销都可以正常工作；只有「变量原子列表」（`isVarList` / `isVarNotList`）需要多选，继续沿用原生窗口。React 侧通过 `EditorBridgeCallbacks.onRequestElementPick` 拿到请求，没有监听者时自动回退原生窗口。
- 「无限画布」：绘制面本身按视口的 4 倍展开（不小于 2600 渲染像素，单边最多 4608 渲染像素，避免多层 canvas 占用过多内存）。当平移靠近绘制面边界时，会把整幅结构整体挪回中央，并同步补偿滚动量，所以画面看起来完全不动，但可以一直朝任意方向平移；移动范围由结构本身兜底，结构永远不会被画到画布之外（多余空间会先自动扩大绘制面，达到上限后平移停在该方向）。
- 缩放、双击缩放或手势缩放后，会把结构重新放回绘制面中央（同样补偿滚动），因此在任何缩放级别都能向上下左右继续平移。绘制面尺寸始终跟随缩放级别调整，既不会越界，也不会随缩放无限膨胀。
- 缩放上下限写在 `src/lib/editorBoard.ts`（`MIN_ZOOM` / `MAX_ZOOM`），通过对 `editor.zoomTo` 的包装统一钳制，因此按钮、滚轮、手势、双击与程序化适配（整理 / 适应画布）都走同一套边界。
- 编辑器的 `change` 事件用于驱动 React 侧的「空画布提示」，Kekule 不管理宿主容器之外的任何 DOM。
- 图片导出没有走「截屏」：`src/lib/moleculeExport.ts` 用 `ChemObjPainter2D` + `CanvasRendererBridge` 把整个 `ChemSpace` 根节点重新绘制一遍。先在临时画布上按 1× 渲染并扫描 alpha 得到真实墨水包围盒（Kekule 对 `ChemSpace` 根节点算不出 container box，因此边界由各分子的 `getContainerBox` 求并集给出，仅用于给测量画布定尺寸），再按同一偏移把绘制重放到裁好的画布上。SVG 借助 `svgcanvas` 把 Canvas2D 调用转译为 `<path>` / `<text>`；PNG 则由这份 SVG 以 2× 栅格化，两种格式因此完全一致。

## 关于画板持久化

- 存档写在 `localStorage` 的 `zephyrlea.board` 下（`src/lib/boardPersistence.ts`），与设置项（`zephyrlea.settings`）分开。内容变化、缩放、页面隐藏（`pagehide` / `visibilitychange`）或编辑器销毁时都会写入；编辑过程中防抖 600ms，避免每画一笔就序列化一次。
- 每个结构保存为 **V2000 molblock**（`Kekule.IO.saveFormatData(mol, 'mol')`），另外附上每个原子的**绝对坐标**：molblock 只保留原子间的相对位置，而编辑器移动的是整个结构（`_shiftChemSpaceChildCoord` 改的是结构自身坐标），两者结合才能在恢复后保住结构之间的相对排布。恢复时用 `K.IO.loadFormatData` 解析 molblock，把结构自身偏移归零后写回原子坐标，再追加到化学空间。
- 视图保存的是**视口中心相对结构包围盒中心的偏移量**，而不是绝对坐标：编辑器布局时会整体挪动结构（重新居中、扩大绘制面），绝对坐标会随之失效，相对偏移则不受影响。恢复时先还原缩放，再按当前包围盒算出目标中心，并在 140 / 400 / 800ms 后重复校正——Kekule 会在布局结束后异步重置滚动位置。
- 载入结构时 Kekule 会按该结构的键长自动缩放绘制面（`objScreenLengthRatio` = `defAutoScaleRefLength` / `defBondLength`）。只恢复结构会退回默认比例，画面比刷新前放大约 1.9 倍，因此存档里同时记下这两个数值，恢复时写回并重新计算绘制面尺寸。
- 恢复发生在首帧布局（`composer.resized()`）之后：先追加结构、再恢复比例与缩放、最后校正视口；没有存档时仍走原来的空画布居中逻辑。

## 关于 RDKit 分析与校验

- 化学计算只有一个来源：本地 Python 服务（原生 RDKit）。`src/lib/chemistryBackend.ts` 是唯一的入口，`prepareAnalysisEngine()` 启动时确认服务就绪，`inspectStructure()` 取回 `problems` + `info`；面板与 `structureValidation.ts` 只认这一份 `StructureInspection`。
- `apps/backend/zephyrlea_backend/chem.py` 的字段语义沿用过去 MinimalLib 版本的口径：分子式按「元素符号 + 隐式氢」拼 Hill 顺序；`heavyAtoms` 取 `CalcNumHeavyAtoms`，`totalAtoms` 取把隐式氢也算进去的 `GetNumAtoms(onlyExplicit=False)`（所以乙醇是 3 / 9）；描述符分别取 `Descriptors.MolWt`、`ExactMolWt`、`rdMolDescriptors.CalcNum*`、`CalcTPSA`、`Crippen.MolLogP`。
- 价键问题用 `Chem.DetectChemistryProblems()`：把 `AtomValenceException` 的原子序号、元素符号与显式价态填进同名字段。解析时 `removeHs=False` 且优先用 molblock，这样报告里的 `atomIndex` 与编辑器节点顺序一致，红圈能落在正确的原子上。
- 分析与校验合并成一次请求 `/analyze`：Python 侧先用 `sanitize=False` 的对象找价键问题，再用默认（开启 sanitize）的对象取分子式与描述符——无法 sanitize 的结构没有可靠的分子式，卡片显示「结构 N 无法解析」。
- 卡片折叠状态由面板本身持有（按结构序号），重新编辑结构、甚至把整块面板收起成窄条再展开，卡片都保持原来的折叠状态；画布清空后这份记录随之重置。
- 面板高度被钳制在画布行内（`min-h-0` 链 + 面板内部滚动），结构再多也只在面板里滚动，不会把底部的元素条 / 工具栏 / 操作栏挤出窗口。
- 问题原子的定位使用同一结构的 **molblock**（`Kekule.IO.saveFormatData(mol, 'mol')`）：Kekule 写出的 molblock 原子顺序与画布节点顺序一致，RDKit 报错里的原子序号可以直接映射到画布节点；而 SMILES 是按遍历顺序写出的，序号与节点顺序不同，无法用来定位。
- 校验在编辑事件的下一帧之后再防抖 220ms 触发；`editorBridge` 的 `onContentChange` 会带上递增的 `revision`，React 侧据此决定是否重跑分析。
- 红圈是一层 `pointer-events-none` 的 SVG 覆盖层，逐帧读取 `editor.objCoordToScreen()`，因此缩放、平移、整理、拖动原子时都会跟随；圆圈半径按相邻键长的一半缩放。
- 前端不再打包任何分析引擎：连不上本地服务时 `prepareAnalysisEngine()` 抛 `LocalEngineUnavailableError`，分析面板改为「本地计算服务不可用 / 未连接本地计算引擎，请确保软件已正确安装运行」并提供重新加载按钮。

## 关于桌面外壳与本地服务

- 渲染层只有一份：`apps/desktop/electron.vite.config.ts` 把 renderer 的 `root` 指向 `apps/web-local`，并把 `index.html` 显式列为入口（electron-vite 默认只在 `<package>/index.html` 或 `src/renderer` 里找），因此 `npm run dev:web` 与 `npm run dev:desktop` 跑的是同一套源码。共用插件放在 `apps/web-local/vite.shared.ts`，两个配置各自引用，避免分叉；electron-vite 默认不压缩 renderer，这里显式打开 `minify`，让打包体积与 Web 构建一致。
- 主进程用 `process.env.ELECTRON_RENDERER_URL` 判断开发 / 生产：前者 `loadURL` 指向 electron-vite 的开发服务器，后者 `loadFile('out/renderer/index.html')`。外部链接一律交给系统浏览器（`setWindowOpenHandler`），窗口开启 `contextIsolation` 与 `sandbox`，不开放 `nodeIntegration`。
- Python 服务由 `LocalBackend` 拉起：`apps/backend/main.py` 先自己 `bind` 一个端口（默认 `--port 0` 交给系统分配），在 stdout 打印唯一一行 `ZEPHYRLEA_BACKEND_READY <port>`，主进程解析这一行拿到端口，再用 `/health` 轮询到就绪。异常退出会把 `starting` 清空，下次调用会重新拉起。
- 认证用的 token 由主进程用 `randomBytes` 生成，通过环境变量 `ZEPHYRLEA_BACKEND_TOKEN` 传给子进程；服务端中间件校验 `x-zephyrlea-token`，缺失或不匹配一律 401。服务只监听 `127.0.0.1`，不暴露文档路由（`docs_url` / `openapi_url` 均为 `None`）。
- 子进程的 stdin 由主进程持有，并传 `--watch-stdin`：stdin 一旦关闭（Electron 退出、崩溃），服务立即 `os._exit(0)`，不会留下孤儿进程；`will-quit` 时也会主动结束子进程。
- IPC 共五条：`chemistry:analyze`（→ `/analyze`）、`chemistry:layout2d`（→ `/api/layout2d`）、`chemistry:embed3d`（→ `/api/embed3d`，超时放宽到 120s）、`backend:health`（→ `/health`）、`file:save`（原生另存）。渲染层通过 preload 暴露的 `window.zephyrlea` 调用；没有该对象时只能用 `window.__zephyrleaBackendUrl` / `VITE_ZEPHYRLEA_BACKEND` 指定的 HTTP 地址，两者都没有就统一报「未连接本地计算引擎」。
- 导出改为原生对话框：`saveExportedFile()` 在有桥时把 Blob 转成 `ArrayBuffer`、把 `data:` URL 解码成字节后经 `file:save` 交给主进程写盘，用户取消返回 `false`，界面不再提示「已导出」；浏览器版仍然走 `<a download>`。
- `apps/desktop/src/main/self-test.ts` 提供 `electron . --self-test`（`npm run smoke:desktop`）：依次断言 preload 已注入、`/health` 经 IPC 连通、五价碳能返回 `AtomValenceException`、`layout2d` 返回 13 个原子的 V2000 molblock、`embed3d` 双结构返回 9 原子 / 2 片段且 z 方向有展开、非法结构给出中文提示、界面载入 `CCO` 后显示 `C2H6O` 并完成「整理结构」且**没有**请求 `RDKit_minimal.wasm` / `openchemlib` 代码块、3D 弹窗能用后端构象渲染出模型，全过退出码 0，便于 CI 把关。
- 打包路径已按「先 PyInstaller、再安装包」预留：`app.isPackaged` 时主进程从 `process.resourcesPath/backend/zephyrlea-backend.exe` 启动服务，开发期则用 `apps/backend/.venv/Scripts/python.exe`，也可用 `ZEPHYRLEA_PYTHON` 指定解释器。
- Electron 固定 `31.7.7`：44 / 45 在这台 Windows 10 上启动即崩（`0xC0000005`），31.7.7 正常。electron-vite 需要在**仓库根**解析 `electron/package.json`（monorepo 下它按自身路径 `require.resolve`），所以 `electron` 声明在根 `package.json` 的 `devDependencies`，`allowScripts` 放行其 postinstall 以取得二进制。
- 本轮迁移了「分子分析 / 结构校验 / 2D 坐标生成 / 3D 构象生成」四条链路，并删除了前端全部 WASM 引擎；C++ 扩展与 PyInstaller 打包仍待后续。

## 关于 2D 布局与 3D 构象

- 两者都走 `apps/web-local/src/lib/chemistryBackend.ts`：存在 Electron preload 桥时经 IPC，否则用探测到的 HTTP 地址；**没有任何 WASM 兜底**。探测不到时抛 `LocalEngineUnavailableError`（文案见上），由各处的 catch 直接显示。
- 2D：`chem.generate_2d_molblock()` 解析结构（molblock 优先，保证原子顺序与编辑器节点一致）→ **清空所有原子坐标并删除构象** → `rdDepictor.Compute2DCoords()` → `Chem.WedgeMolBonds()` 补手性楔形键 → `MolToMolBlock()`。清坐标这一步不能省：编辑器传来的 molblock 一定带着当前画面的坐标，RDKit 在已有坐标时可能沿用它们，算出来的布局会歪。
- 2D 回填：`editorBridge.relayout()` 与 `importSmiles()` 只请求本地 molblock；`applyCleanedLayout()` 把新结构按原键长缩放、按原重心对齐后逐个原子写回 Kekule 节点，原子数量或元素顺序对不上时视为失败，退回纯 JS 的 `layoutMolecule()`（整理结构按钮不会因此失效）。
- 3D：`chem.embed_3d()` 解析 → 清坐标 → `AddHs()` → `EmbedMolecule(randomSeed=42)`；失败时用 `useRandomCoords=True, maxAttempts=50` 再试一次 → `MMFFOptimizeMolecule(maxIters=500)`（缺 MMFF 参数时退回 UFF，两者都没有参数就直接用嵌入坐标）→ `RemoveHs()` → 多片段沿 x 轴排开（间距 4 Å、整体居中）→ `MolToMolBlock()`。
- 嵌入失败（`EmbedMolecule` 返回 -1，例如 `C1CC2CC3CC4CC5CC1C2C3C45` 这类高张力笼状结构）不会让服务崩溃：`chem.ChemError` 携带 `code` + 中文说明，接口返回 422 `{"error": {"code", "message"}}`，主进程解析出 `error.message` 抛给渲染层，`chemistryBackend` 再剥掉 Electron 的 `Error invoking remote method '…'` 前缀，3D 弹窗直接显示这句话。
- 接口：`POST /api/layout2d` → `{"molfile": "…"}`（解析失败返回 422）；`POST /api/embed3d` → `{"sdf": "…", "atomCount", "bondCount", "fragmentCount", "elapsedMs"}`（多返回的计数直接用于 3D 窗口标题，省一次解析）。
- 浏览器直连本地服务调试时，在页面里设置 `window.__zephyrleaBackendUrl = 'http://127.0.0.1:8765'`（或构建期 `VITE_ZEPHYRLEA_BACKEND`），探测到 `/health` 可用后缓存结果；后端因此加了只放行 `localhost` / `127.0.0.1` 来源的 CORS 规则。Electron 走 IPC，不需要这条规则。
- 移除前后构建体积（`apps/desktop/out/renderer`，本机实测）：27.72 MB → 3.66 MB，其中 `sci_form_wasm_bg*.wasm`（12.6 MB）、`RDKit_minimal.wasm`（7.2 MB）与 `openchemlib` 代码块（1.37 MB）全部消失。

## 关于纯静态版与 Cloudflare Pages

- `main` 上的渲染层没有化学引擎，所以对外的静态站点仍由 `v0.1.0` tag 提供。`scripts/build-static.mjs`（`npm run build:web:static`）把这件事固化成一条命令：校验 tag 存在 → `git worktree add --detach .temp-static v0.1.0` → 在临时目录里 `npm ci`（没有锁文件时退回 `npm install`）→ `npm run build` → 复制 `dist/` 到根目录 `dist-static/` → `git worktree remove .temp-static --force` 并 `prune`。
- 临时目录与产物都写进 `.gitignore`，因此跑完之后 `git status` 依旧干净；`finally` 里无条件清理，构建中途失败也不会留下 worktree，脚本兜底再清一次并返回非零退出码。
- 实测产物 19.77 MB，含 `RDKit_minimal.wasm` 与 `sci_form_wasm_bg.wasm`；用 `python -m http.server` 直接托管 `dist-static/` 可以正常载入、分析阿司匹林（`C9H8O4`）且控制台无报错，可直接作为 Cloudflare Pages 的输出目录。
- 改用 `npm ci` 的原因：tag 自带 `package-lock.json`，可复现依赖版本；`npm install` 会把 lockfile 重写一遍，产物可能漂移。

## 关于 3D 视图

- 3D 构象由 `POST /api/embed3d` 返回的 **V2000 molblock** 直接交给 `viewer.addModel(molblock, 'sdf')`。只用 XYZ 的话格式里没有键信息，3Dmol 只能按距离猜键、并全部画成单键；molblock 带上了键级，3Dmol 就会自己把双键 / 三键画成两条 / 三条平行圆柱，芳香键则画成「实线 + 环内虚线」的大 π 键（`aromaticStyle: 'dashed'`，即默认样式）。多结构的画布由后端拆开、逐个嵌入再沿 x 轴排开，渲染层只负责画一个已经合并好的模型。
- 渲染样式由 `MODEL_STYLE_SPECS` 决定，分四种：**球棍**（`stick` + `sphere: { scale: 0.3 }`，默认）、**空间填充**（仅 `sphere: { scale: 1 }`，按范德华半径铺满）、**棍状**（仅 `stick`）、**线框**（半径 0.05 的细棍）。球棍与棍状用的是半径 0.15 的细棍（3Dmol 默认 0.25），单键更轻；同时把多重键比例提高到 `doubleBondScaling: 0.55` / `tripleBondScaling: 0.45`，细棍下双键 / 三键仍清晰可辨。线框没有用 3Dmol 的 `line` 样式，是因为 WebGL 的 `lineWidth` 在主流浏览器上被限制为 1px，在暗色背景上几乎看不见。
- 切换样式只调用 `viewer.setStyle()` 再重新适配视图，不会重建模型，所以当前旋转角度保持不变；重新适配（`zoomTo()` + 空间填充时额外拉远 25%）是为了让更大的球体仍留在画面内。样式存在 `settings.model3DStyle`（`localStorage`），设置弹窗与 3D 窗口底部工具栏共用同一份 `Model3DSwitch` 选项定义，两处改动互相同步。
- 底部工具栏把模型样式、拖拽方式、重置视图、最大化放在同一个药丸形容器里（`pointer-events-none` 的外层负责定位，内层恢复交互），对齐方式由 `settings.viewer3DToolbarAlign` 决定：`justify-start` / `justify-center` / `justify-end`，默认居中。提示文字因此移到画布左上角，避免与靠左的工具栏重叠。
- **拖拽方式**是两个互斥的图标按钮：`旋转结构`（默认，直接使用 3Dmol 的拖拽旋转）与 `移动摄像头`。后者在画布上盖一层透明层接管指针事件（避免 3Dmol 同时旋转），拖动时调用 `viewer.translate(dx, -dy)` —— 它移动的是相机 `lookingAt`，结构本身不动，所以看起来是「绕着结构平移视角」。3Dmol 的 `translate` 以画布中心为原点、y 轴朝上，因此纵向要取反，拖动方向才与手势一致。
- 滚轮缩放在两种拖拽方式下统一由容器上的原生 `wheel` 监听（捕获阶段 + `stopPropagation`，避免与 3Dmol 自带的滚轮缩放叠加）处理，并且**以鼠标位置为锚点**：先 `viewer.zoom(factor)`，再按 `-(factor-1)·指针偏移` 平移相机，使指针下的原子保持在指针下，因此缩放既能放大也能缩小，而且作用在注视的位置而不是只朝画布中心缩放。
- 重置视图不是 3Dmol 自带的 API：它把 `setView()` 的平移归零、旋转四元数设为单位四元数（`[0,0,0,z,0,0,0,1]`），再把相机 `lookingAt` 指回原点（`setView()` 不会撤销「移动摄像头」造成的相机偏移），最后按当前样式重新 `zoomTo()`，所以「重置」后的画面与刚打开弹窗时完全一致。
- 最大化只是切换弹窗容器尺寸（`h-full w-full max-w-none` + 外层内边距 `p-2`），canvas 由 `ResizeObserver` 触发 `viewer.resize()` 重排，模型不被重建；`Esc` 在最大化时只还原窗口，再按一次才关闭。
- 3Dmol（约 570 KB）通过动态 `import('3dmol')` 懒加载，不进首屏包。它本身是 webpack 的 UMD 产物，导入时对 `default` 与命名空间两种互操作形态都做了兼容。
- 关闭弹窗（或切换结构、点重试）时执行 `viewer.clear()` 并移除 canvas，viewer 引用置空，因此重复开关不会累积 canvas，也不会因为 WebGL 上下文过多而被浏览器回收。
- `smiles`、`theme` 与 `modelStyle` 的处理方式不同：`smiles` 变化会重建模型，主题变化只调用一次 `setBackgroundColor()`，样式变化只调用 `setStyle()`，因此切换主题或显示方式都不会丢掉用户已经拖好的视角。

