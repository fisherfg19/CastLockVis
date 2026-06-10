# TODO — CastLock-Vis 开发待办

> 本待办把 [`FEATURE_LIST.md`](./FEATURE_LIST.md) 的功能模块排成**可执行顺序**。
> 编号 `Fx.y` 直接对应 FEATURE_LIST 的功能项。
>
> **两阶段视觉兼容（关键约束）**：里程碑 S0–S5 全程处于 DESIGN_SYSTEM **第一阶段（骨架）**，
> 一律使用中性占位 token，专注「结构 + 交互 + 联动」；视觉只到「能区分、可读」为止。
> **第二阶段（完备视觉）= S6**，原则是**只改 `tokens.css` 与 `ViewPanel` 样式，不动任何视图逻辑**。
> 因此 S0–S5 的每个组件都必须满足「禁止硬编码颜色/间距，一律引用 CSS 变量」，否则 S6 无法无缝换肤。
>
> 进度标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 完成。

---

## 排序原则

1. **先骨架后视图，先静态后联动**：搭好壳与数据脊柱 → 各视图先用**全量数据**独立渲染 → 最后接联动。
2. **联动是评分核心**：联动链路（S4）优先级高于单视图的视觉精度；任何视图在 S2/S3 完成时就必须已保留联动所需标识符（actorId / seqIndex / tau / clusterId）。
3. **由简到繁排视图**：A（散点）、D（矩阵）结构简单先做并打通「最短联动闭环（A→D）」；B（流图+熵线）、C（对齐分叉）较复杂随后。
4. **粒度**：每个 checkbox 约为 0.5–1 天可验收的工作量；带 **(P1/P2)** 者为非阻塞增强，可延后。

---

## S0 · 开发环境（前置，已由配置任务交付）

> 详见 [`docs/contribution/config.md`](../contribution/config.md)。此里程碑为后续一切工作的前提。

- [x] 前端工程脚手架：Vite + React 18 + TS（`npm install` / `npm run dev` / `npm run build` 可跑通）
- [x] 代码质量基线：ESLint + Prettier + TS `strict`（F10.3）
- [x] 仓库 `.gitignore`（node_modules / dist / 原始 IMDb 数据 / Python 缓存）
- [x] 流水线复现说明与依赖（`pipeline/requirements.txt`）

## S1 · 应用骨架 + 数据脊柱（框架，P0 · 第一阶段）

> 目标：一个能启动、能加载全部数据、能渲染空白四面板栅格的可运行壳。

- [x] **F1.3** `styles/tokens.css`：照搬 DESIGN_SYSTEM §1.1 占位变量到 `:root`
- [x] **F1.2 / F1.4** `App.tsx` 布局壳 + `ViewPanel` 统一外框（标题/工具条位/图例位/内容/空·加载·错误态）
- [x] **F2.1** `data/types.ts`：6 份契约的 TS 类型（对齐已生成 JSON 的实际字段，见 FEATURE_LIST F0.8–F0.10）
- [x] **F2.2** `data/loadData.ts`：启动一次性 fetch 6 JSON + 轻量形状校验
- [x] **F2.3** 数据索引：`actorsById` / `filmsByActor` / `markovBy(cluster,stage)` / `alignmentByActor`
- [x] **F1.5** 全局加载/错误边界（`DataProvider` + `ViewPanel` 的 loading/empty/error 态）
- [x] **F2.4** `store/useVizStore.ts`：交互状态字段 + actions（brush/选择/stage/过滤器/详情）
- [x] **F2.5 / F2.6** `store/selectors.ts` + `lib/aggregate.ts`：派生数据脚手架（cohort 成员 / cohort 平均熵 / 过滤矩阵 / 重分层）

**验收**：`npm run dev` 显示 Header + 2×2 空面板；控制台确认 6 份 JSON 全部加载且类型校验通过。

## S2 · 静态视图 A 与 D + 最短联动闭环（视图，P0 · 第一阶段）

> 先做结构最简的两视图，并打通第一条联动（A→D），尽早验证「联动脊柱」可用。

- [x] **F3.1 / F3.2** ClusterView 静态散点：`projection` 坐标 + `dominantEarlyGenre` 着色 + 悬停 Tooltip（已增强：簇图标 + 凸包）
- [x] **F6.1 / F6.2 / F6.5** MarkovView 静态热力矩阵：色阶 + 行列标签 + 单元格 Tooltip + 对角线强调
- [x] **F6.3** MarkovView 阶段切换 Toggle（early/mid/late，写 `markovStage`）
- [x] **F3.3 / F3.4** ClusterView `BrushLayer` 框选 → 写 `brushedActorIds` + 选中/降明度视觉态（指针拖框矩形，空白点击清除）
- [x] **F8.1（A→D 部分）/ F6.4** 联动：selectors（`getDominantClusterId`→`getMarkovMatrixForCohort`）+ App 接线就绪，brush 触发端落地后 A→D 全闭环

**验收**：在 A 框选一个群落，D 立即切换为该群落矩阵；切换阶段 Toggle 矩阵随之更新；清除选区回到全局态。

## S3 · 静态视图 B 与 C（视图，P0 · 第一阶段）

> 两个定制图表，最耗时。完成后四视图均可独立渲染。

- [x] **F4.1** RiverView Streamgraph：横轴=作品序列 1..N、流厚度=滑动窗口类型比例
- [x] **F4.2** RiverView 叠加白色香农熵折线（`entropy.json`）
- [x] **F4.3** RiverView 每部电影圆点：评分/票数编码（位置或大小）
- [x] **F4.6** RiverView 单演员/群落两模式切换 + 空态：brush 空=单演员态、brush 非空=群落平均态（平均熵线 + 群落平均流带）
- [x] **F5.1** AlignmentView 对齐坐标系：`tau` 横轴 + T=0 竖轴标记（`alignment.json`）
- [x] **F5.2 / F5.5** AlignmentView 左侧低熵窄束 + 右侧绿/红分叉区（按 `outcome`）

**验收**：B 能渲染单演员河流+熵线、也能渲染群落平均态；C 能把全部对齐演员按 τ 对齐并按 outcome 分绿/红。

## S4 · 完整联动链路（联动，P0 · 第一阶段 · 评分核心）

> 把四视图焊成一个分析闭环。本里程碑权重最高。

- [x] **F4.4** 链路 1 消费端：RiverView 响应 `brushedActorIds` 渲染**群落平均叠加态**熵衰减（新增 `averageCohortGenreBands`/`getCohortGenreBands` 聚合，仅汇总 `dominantGenre` 占比）
- [x] **F8.1** 链路 1 完整收口：A.brush → B（平均态）+ D（cohort×stage）同步联动
- [x] **F4.5** 链路 2 触发：RiverView 作品圆点可点击 → 写 `selectedActorId + selectedFilmIndex`（再次点击/点空白取消）
- [x] **F5.3** 链路 2 消费：AlignmentView 单分类器（selected/peer/context）高亮该演员 + **同 clusterId 同侪**（按 outcome 分绿/红）+ 选中 τ 辅助线；亦可由 A 单击演员触发
- [x] **F7.1** 链路 2 详情：`DetailsPanel` 展开转型窗口 `[sel±2]` 微观数据（相对 T=0 前基线的评分↑/票房↓ 方向标记）
- [x] **F5.4** 链路 3：AlignmentView 全局控制变量过滤器（导演异质性/票房/评分，`RangeSlider`）动态重分层（in-filter 绿/红、out-of-filter 淡灰）
- [x] **F8.4** 联动一致性：跨视图统一用 `--color-accent` 高亮；A 空白清 brush、B 空白/再点清选择、C 重置滤镜，各自回全局态

**验收**：能完整复现 proposal §3 的三个联动场景（群落基线探查 / 转型窗口期微观审计 / 控制变量生存审计）。

## S5 · 通用控件、打磨与部署（P0–P1 · 第一阶段收尾）

- [x] **F7.2 / F7.3** `Legend` + `Tooltip` 统一组件，各视图复用：新增 `components/common/ChartLegend`、`GenreColorLegend`、`ChartTooltip`；四视图图例与底部 hover/状态提示均改为通用组件承载
- [x] **F7.4 / F7.5 / F7.6** `controls/Slider` `controls/Toggle` `controls/BrushLayer` 抽成通用控件：`controls/Toggle` + `controls/RangeSlider` + `controls/BrushLayer` 均已抽成通用件；ClusterView 改为引用 `BrushLayer`（store 接线留在视图层，控件本身 store 无关）
- [x] **F1.6** 响应式与最小可用宽度：新增全局最小宽度与布局尺寸 token；桌面双列、中宽单列、窄屏保持 `--app-min-width` 横向可滚动；面板标题/图例/tooltip/过滤器/详情面板均补充换行、最小高度与小屏布局规则
- [x] **F8.5 (P1)** 联动可发现性：新增 `InteractionGuide` 联动状态条，实时显示 A→B/D cohort 队列、A/B→C 选中演员/详情状态、C 控制变量过滤状态，并给出每条链路的触发入口提示
- [x] **F3.5 (P1)** ClusterView 群落 hull / 密度底纹（已做凸包 hull + 每簇图标；密度底纹未做）
- [x] **F10.1** `vite.config.ts` 设 `base`，确认 `dist/` 含 `data/*.json`
- [x] **F10.2** GitHub Actions：新增 Pages workflow，push main / 手动触发后执行 `npm ci` → `npm run build` → upload `dist/` → deploy-pages
- [x] **F0.8 / F0.9 (P1)** `clean_expert.py` 已引入 `primaryTitle`，pipeline 优先写可读 `films.title`（`tconst` 存 `films.titleId`）；`films.json` 新增逐片 `directorName` + `directorHeterogeneity`，详情面板展示可读片名与当前作品局部导演异质性；流水线已重跑落盘

**验收**：Pages 部署成功，子路径下静态资源与数据可达，三联动在线可用。

## S5.5 · 交互与布局前置改造（P0–P1 · S6 前置）

> 目标：在进入 S6 视觉定稿前，先修掉当前会妨碍视觉收口与后续调参的结构性问题：
> ① `DetailsPanel` 的移动交互过于反直觉；② 四视图面板空间分配固定且不可调；③ 视图 A 缺少对 `clusterId`
> 构成的直接摘要与整簇选择入口；④ 视图 A 单选 / 圈选状态覆盖、回退与高亮层级不稳定；⑤ 多 cluster cohort 下 Markov
> 矩阵语义不明确。此阶段允许改少量视图逻辑 / 布局接线，但应保持既有数据流与三条联动主语义不变。

- [x] **DetailsPanel 鼠标拖动替代方向按钮**
  - 现状：视图 B 点击熵峰值后弹出的 `DetailsPanel` 只能通过 4 个方向按钮移动，使用中间圆点按钮归位；同时支持键盘方向键平移。这套交互不自然，且占用面板顶部空间。
  - 改造目标：改为**鼠标拖动面板标题栏移动**，关闭按钮不参与拖动；可保留键盘方向键作为无障碍后备，但不再把方向按钮作为主交互暴露。
  - 实施约束：
    - 继续沿用 Zustand 中的 `detailsPanelPosition` 状态，不引入视图间直接通信。
    - 优先给 store 增加显式的 `setDetailsPanelPosition(position)`，避免用按钮式 `delta` 逻辑硬凑连续拖动。
    - 使用 Pointer Events（`pointerdown / pointermove / pointerup`）实现拖动；拖动手柄建议放在 `DetailsPanel` header。
    - 拖动时暂时关闭 `transform` 过渡，避免面板跟手发黏；空闲时保留轻量 transition 即可。
    - 第一版可不做强边界约束，但不得出现“轻轻一拖即丢失面板焦点 / 误触关闭 / 文本被选中”的问题。
  - 预期落点：`src/components/DetailsPanel.tsx`、`src/components/DetailsPanel.css`、`src/store/useVizStore.ts`。

- [x] **四视图空间重新分配 + 参数化布局**
  - 现状：`App.css` 中 `.app-grid` 仍是固定的 2×2 均分网格；`ViewPanel` 不接受布局 class / area；四个视图获得的空间完全一致。结果是：
    - 视图 D（Markov）因矩阵天然偏正方形，横向面板里只占了约一半可用空间；
    - 视图 C 相较之下更拥挤，尤其在保留顶部 controls / filters 时更明显；
    - 后续想微调 A/B/C/D 各自占比时，需要直接改散落的 CSS，而不是改一组集中参数。
  - 改造目标：把顶层 panel 布局改成**可参数化的命名 grid area**，使 A/B/C/D 的空间比例可在少量集中变量中调节。
  - 推荐方案：
    - 给 `ViewPanel` 增加 `className` 或 `area` 接口，由 `App.tsx` 在 panel 配置里显式声明 `cluster / river / alignment / markov`。
    - 在 `App.css` 中改用 `grid-template-areas` + `--layout-*` 变量，而不是固定 `repeat(2, 1fr)`。
    - 至少暴露 4 个一眼可调的布局参数，例如左右列宽、上下行高，便于后续 session 快速试比例。
    - 第一版先解决 panel 外层空间分配，不强求同步重写每个视图内部的 SVG 比例逻辑。
  - Markov 特别说明：
    - 视图 D 的“空一半”既来自外层均分，也来自内部矩阵是正方形这一事实。
    - 第一阶段先通过外层 grid 改善整体比例；若仍显局促，再决定是否为 D 做“矩阵 + 辅助摘要”式内部布局，而不是一开始就硬拉伸矩阵。
  - 预期落点：`src/App.tsx`、`src/App.css`、`src/components/ViewPanel.tsx`、`src/components/ViewPanel.css`，必要时少量触及 `src/views/Views.css`。

- [ ] **视图 A 增加 cluster composition 摘要图 + 点击柱子选择 cluster**
  - 目标：在 A 中直接呈现各 `clusterId` 的构成比例，帮助用户在 brush 前就理解“哪个 cluster 大、哪个小”。
  - 推荐第一版：**柱状图优先于饼图**。
    - 理由：当前 A 已经有散点、hull、点形状，若再塞一个饼图，中心角与颜色块的可读性不如横向条形图稳定；7 个簇做条形图更利于比较，也更适合在窄侧栏中放置。
    - 若最终 panel 结构调整后出现合适的近正方形摘要位，可再评估饼图版本，但不作为第一实现目标。
  - 放置建议：
    - 在 `ClusterView` 内改成“主散点区 + 侧边摘要栏”两栏布局；窄屏再降级为上下布局。
    - 摘要图使用 `--cluster-*` 色，避免新增硬编码色值；每一行至少展示 `clusterId`、count、percent。
  - 数据与实现约束：
    - 这只是对 `actors[].clusterId` 的轻量汇总，不涉及任何运行时重算统计，可直接在 `ClusterView` 的 `useMemo` 中做；若后续复用需要明显增长，再抽到 `lib/aggregate.ts`。
    - 第一版不要求 hover 柱子反向高亮散点，避免引入多余联动复杂度。
    - 点击某个柱子，自动选择该 `clusterId` 下的全部演员，效果等价于“程序化 brush 该 cluster 的所有点”。
    - 实现上不要求真的驱动 `BrushLayer` 画出矩形，只需写入 `brushedActorIds` 并使 B/D 响应即可。
    - 若当前已有单演员选择，不清掉 cached `selectedActorId`；只让非空 `brushedActorIds` 成为当前 active cohort，并关闭 `detailsOpen`，避免 cohort 联动时仍展示单点详情。
    - 这一增强完成后，A 将同时支持“自由拖框定义 cohort”和“点击摘要栏按整簇选择 cohort”两种入口。
  - 预期落点：`src/views/ClusterView.tsx`、`src/views/Views.css`，必要时少量触及 `src/store/selectors.ts` 或 `src/lib/aggregate.ts`。

- [ ] **视图 A 单选 / 圈选交互状态修复**
  - 目标：明确 A 的 active selection 规则，消除单选、圈选、空白点击之间的状态震荡与跨视图不一致。
  - 期望交互：
    - 单选与圈选之间，新操作覆盖旧操作的 active 状态：单选后圈选时高亮圈选并联动；圈选后单选时取消圈选高亮并联动单点。
    - 点击空白区域时：若当前 active 状态是单选，不做任何操作；若当前 active 状态是圈选，清空圈选并回退到 cached 单选。
    - 圈选空白区域也按“清空圈选并回退 cached 单选”处理，避免出现“圈空白显示 fallback、点空白又恢复旧演员”的空白震荡。
    - 单选与圈选状态允许同时存在：`brushedActorIds` 非空时 active selection 为圈选；为空时 active selection 为 `selectedActorId`；两者均空时再 fallback 到默认演员。
  - 高亮与命中修复：
    - 单选高亮必须渲染在上层，避免被下层点遮住导致看不见。
    - A 中“视觉上已选中”的演员应与实际写入 store、并被 B/C/D 接收的演员一致；优先按鼠标命中的实际 actor 决定高亮，而不是让放大后的视觉半径制造误判。
  - 实施约束：
    - 推荐集中梳理 `ClusterView` 的 click / brush end / empty brush 分支，避免在多个事件回调里各自猜 active selection。
    - 必要时增加轻量 selector，例如 `getActiveActorIds` / `getActiveSelectionMode`，但不要引入新的跨视图通信通道。
    - B/C/D 接收选区时也必须使用同一套 active selection 规则：`brushedActorIds` 非空时不得继续把 cached `selectedActorId`
      当作当前 active 单选；只有 `brushedActorIds` 为空时，cached `selectedActorId` 才重新成为 active selection。
  - 建议实现路径：
    - 单击点时先 `clearBrush()`，再写入 `selectedActorId` / 清空 `selectedFilmIndex` / 关闭 `detailsOpen`，使单选明确覆盖旧圈选。
    - 非空拖框时只写入 `brushedActorIds` 并关闭 `detailsOpen`，不要清掉 cached `selectedActorId`；这样后续清空圈选时可以自然回退到旧单选。
    - 空拖框与点击空白统一处理为“只清空 `brushedActorIds`”：若 cached 单选存在，active selection 回到该单选；若不存在，再进入默认 fallback。
    - A 内部的 tooltip / dimming / active class 都从同一套 active selection 派生，避免显示状态与实际联动状态分叉。
    - `RiverView` / `App` 接线需改为 active mode 优先：非空 brush 时显示 cohort 平均河流与 cohort 峰值；brush 为空且有 cached 单选时才显示单演员河流。
    - `AlignmentView` 也需从 active selection 派生高亮 / 同侪 / tau 辅助线；第一版至少要避免 brush active 时继续高亮 cached 单选演员。
  - 当前代码评估：
    - 现有 `ClusterView.handleBrush()` 会在空 / 非空拖框后都 `clearSelection()`，这是需要改掉的核心分支。
    - 现有 `ClusterView.handleSelectPoint()` 不会 `clearBrush()`，这是“圈选后单选仍残留圈选高亮”的主要原因。
    - 现有 `RiverView` 在 `selectedActorId !== null` 时优先渲染单演员，若任务 4 改成“圈选不清 cached 单选”，B 会错误地忽略当前 active brush。
    - 现有 `AlignmentView` 只订阅 `selectedActorId` / `selectedFilmIndex`，没有读取 `brushedActorIds`；若任务 4 保留 cached 单选，C 会在 brush active 时继续显示旧单点高亮。
    - 现有 `BrushLayer` 已经把小拖动视作单击、并用 `nearestPoint()` 返回实际命中 actor；第一版可以复用这套命中结果，只需保证 A 的高亮完全跟随写入 store 的 actor。
    - 单选置顶可通过把 selected / hovered / brushed 点拆成上层渲染 pass 解决，不需要改 store。
  - 预期落点：`src/views/ClusterView.tsx`、`src/views/RiverView.tsx`、`src/views/AlignmentView.tsx`、`src/components/controls/BrushLayer.tsx`、`src/store/useVizStore.ts`，必要时触及 `src/store/selectors.ts` 与 `src/App.tsx`。

- [ ] **Markov 矩阵仅在单 cluster 语义下显示**
  - 现状：当 A 里选中来自多个 `clusterId` 的点时，D 似乎会按点数最多的 cluster 显示 Markov 矩阵，导致“当前矩阵代表谁”不明确。
  - 改造目标：
    - D 仅在两类状态下显示矩阵：单点模式；或非空圈选 / 柱子选择的点全部来自同一个 `clusterId`。
    - 当 active cohort 跨越多个 cluster，或当前状态无法唯一确定 cluster 时，关闭 Markov 矩阵显示，改为明确的空态 / 提示态。
    - 第三个任务中的“点击柱子选择 cluster”必须作为进入单 cluster cohort 的正式入口，而不是可选增强。
  - 推荐判定：
    - `brushedActorIds` 非空时，统计其对应 `clusterId` 集合；集合大小为 1 才允许 D 显示。
    - `brushedActorIds` 为空且 `selectedActorId` 存在时，按该 actor 的 `clusterId` 显示。
    - 两者均空时沿用默认 fallback 演员 / cluster；但如果后续决定空态不显示 D，应在实现前同步更新验收。
  - 实施约束：
    - 不再使用“多数 cluster”作为隐式默认规则。
    - Markov 的 cluster 判定逻辑应集中在 selector / memo 中，避免 D 自己重复推断多套状态。
  - 建议实现路径：
    - 用新的 selector（例如 `getResolvedMarkovClusterId`）替代 `getDominantClusterId` 在 D 上的用法。
    - `brushedActorIds` 非空时，从 brush 内 actor 计算 cluster 集合；集合大小为 1 返回该 cluster，否则返回 `null`。
    - `brushedActorIds` 为空且 `selectedActorId` 存在时，返回该 actor 的 `clusterId`，确保单点模式下 D 与 B/C 接收的是同一个演员语义。
    - selector 返回 `null` 时，`App` 直接向 `MarkovView` 传 `matrix=null`；`MarkovView` 复用现有空态，再视需要把文案从“当前 stage 无可用矩阵”改成“多 cluster cohort 不显示 Markov”。
  - 当前代码评估：
    - 现有 `selectors.getDominantClusterId()` 正是“多数 cluster”规则，应避免继续用于 D。
    - 现有 `App.readyPanels` 在无 brush 时通过 `getCohortActorIds(allActorIds, brushedActorIds)` 得到全体演员，再计算 dominant cluster；因此 D 当前会忽略单选演员，这是任务 5 需要一并修掉的关键问题。
    - `MarkovView` 本身只依赖 `matrix`，且已经能处理 `null`，所以主要改动在 selector 与 `App.tsx` 接线，视图组件只需补更准确的空态文案。
  - 预期落点：`src/views/MarkovView.tsx`、`src/store/selectors.ts` 或 `src/lib/aggregate.ts`，必要时少量触及 `src/views/ClusterView.tsx`。

**验收**：
1. `DetailsPanel` 可通过鼠标拖动标题栏平滑移动，关闭按钮正常，方向按钮不再作为主交互暴露。
2. 四视图 panel 使用命名 grid area，A/B/C/D 的空间比例可通过少量集中参数调整；默认布局下 D 不再显著空置、C 获得更充足空间。
3. 视图 A 出现 cluster composition 摘要图，点击某柱子可直接进入该 cluster 的 cohort 联动态。
4. 视图 A 单选 / 圈选遵循 active selection 覆盖与 cached 单选回退规则；空白点击和圈选空白不再触发 fallback 震荡；单选高亮层级与实际联动 actor 一致。
5. Markov 矩阵仅在单点或单 cluster cohort 下显示；多 cluster cohort 时不显示矩阵，也不再隐式选择多数 cluster。

## S6 · 第二阶段完备视觉（视觉，P2 · 第二阶段）

> **唯一规则：只改 `tokens.css` 与 `ViewPanel`/视图样式表，不改视图逻辑与数据流。**
> 进入本阶段的前提：S1–S5.5 全部组件已无硬编码颜色/间距，且前述交互/布局前置改造已收口。

- [ ] **F9.1** 配色定稿并回填 token：中性阶（≥WCAG AA）、类型分类色（Tableau10 调校，key 对齐 `genres.json`）、矩阵顺序色阶、绿/红分叉色、交互态
- [ ] **F9.2 / F9.3** 版式与字体字号定稿（4px 节奏、type scale、等宽数字）
- [ ] **F9.4 / F9.5** 图标·坐标轴·T=0 标记规范 + 克制动效（150–250ms，`prefers-reduced-motion`）
- [ ] **F9.6** 各视图视觉规范回填（A 点态/hull、B 流配色与熵线、C 分叉底纹、D 单元格色阶）
- [ ] **F9.7** 把定稿色值/字号写回 DESIGN_SYSTEM §2 色值表，token 与文档同步
- [ ] **F10.4 (P2)** `films.json`（~4MB）按需懒加载或精简字段

**验收**：换肤后四视图视觉统一、达成「Analyst Console / Cinematic Dark」基调，且交互逻辑零回归。

---

## 关键路径与并行建议

- **关键路径**：S0 → S1 → S2(联动脊柱验证) → S3 → **S4(联动)** → S5 → **S5.5(交互/布局前置改造)** → S6。
- **可并行**：S2 完成后，B（S3 前两项）与 C（S3 后两项）可由不同人并行；`Legend/Tooltip/控件`（S5）可在 S2 期间随手抽取。
- **风险点**：① B 的 streamgraph 横轴语义（序列号非年份）易做错；② C 的 T=0 对齐（x 轴）须严格按 `alignment.json` 的 `tau`；**同侪界定改用 `clusterId`**（tau/t0 因窗口固定 + t0 高度集中而失效，见 F5.3）；③ A→D 联动的群落粒度（F0.10）不要误做成实时重算。
