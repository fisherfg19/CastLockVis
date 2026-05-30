# FEATURE LIST — CastLock-Vis

> 本清单把 `proposal.md` 的 4 个分析任务、4 个视图、3 条联动链路，拆解为可独立交付的功能模块。
> 每个模块标注：**服务的任务 / 视图**、**依赖的数据契约**、**联动角色**、**优先级**。
> 优先级：**P0**＝跑通「四视图 + 三联动」的最小必要集；**P1**＝完整度与可用性；**P2**＝第二阶段视觉与打磨。
> 视觉两阶段（骨架 → 完备）见 `docs/dev_rule/DESIGN_SYSTEM.md`；架构与数据契约见 `docs/dev_rule/ARCHITECTURE.md`。

---

## 模块总览

| 模块 | 名称 | 角色 | 优先级 |
| --- | --- | --- | --- |
| M0 | 离线数据流水线与数据契约 | 数据生产（**已完成**） | — |
| M1 | 应用骨架与基础设施 | 框架 | P0 |
| M2 | 数据层与联动状态脊柱 | 框架 | P0 |
| M3 | 视图 A · 类型群落投影（ClusterView） | 视图 | P0 |
| M4 | 视图 B · 生涯时序河流（RiverView） | 视图 | P0 |
| M5 | 视图 C · 转型对齐分叉（AlignmentView） | 视图 | P0 |
| M6 | 视图 D · 马尔可夫转移门（MarkovView） | 视图 | P0 |
| M7 | 通用组件与控件（Components / Controls） | 视觉元素 | P0–P1 |
| M8 | 多视图联动链路（Brushing & Linking） | 联动 | P0 |
| M9 | 第二阶段完备视觉方案（Theming） | 视觉 | P2 |
| M10 | 构建与部署（GitHub Pages） | 工程 | P1 |

---

## M0 · 离线数据流水线与数据契约（已完成）

> 现状：`pipeline/clean.py` + `pipeline/pipeline_json.py` 已产出 `public/data/` 下 6 个 JSON。
> 前端**不做任何重计算**，仅消费这些静态契约。本模块列出已交付内容与待修正项，供前端对齐字段语义。

- **F0.1** 原始 IMDb 数据清洗与实体提取 —— `clean.py`（票数门槛、主演番位、生涯厚度过滤）。✅
- **F0.2** 特征工程与 6 份数据契约落盘 —— `pipeline_json.py`：`genres / actors / films / entropy / markov / alignment`。✅
- **F0.3** 早期画像：前 5 部作品类型概率向量 + `dominantEarlyGenre`（视图 A 坐标来源）。✅
- **F0.4** EMA 香农熵曲线 `n=1..30`（视图 B 白线、视图 C 纵轴）。✅
- **F0.5** UMAP 降维 + KMeans 8 群落 → `projection[x,y]` + `clusterId`（联动 cohort 单位）。✅
- **F0.6** 分阶段（early/mid/late）群落转移矩阵（视图 D，按 `clusterId` 键控）。✅
- **F0.7** T=0 对齐检测：`t0Index`、`outcome(success|snapback|none)`、`points[{tau,entropy}]`、`covariatesAtT0`。✅
- **F0.8 ⚠️ 待修正（P1）** `films.title` 当前存的是 `tconst`（tt 编号）而非人类可读片名；详情面板需要可读标题时，需在 `clean.py` 引入 `primaryTitle` 后重跑。
- **F0.9 ⚠️ 待对齐（P1）** `directorHeterogeneity` 仅存在于 `alignment.covariatesAtT0`，`films.json` 无逐片导演异质性；视图 C 全局过滤器以 T=0 协变量为准（与契约一致），不要求逐片字段。
- **F0.10 ⚠️ 联动粒度说明（P0 设计约束）** `markov.json` 按**预计算 `clusterId`** 键控；A→D 联动在**群落粒度**生效（brush 选区映射到其覆盖的 cluster），而非任意子集实时重算矩阵。前端联动须遵此粒度。

---

## M1 · 应用骨架与基础设施（框架，P0）

服务：全局承载；DESIGN_SYSTEM 第一阶段「骨架」。

- **F1.1** Vite + React 18 + TS 工程初始化，`base` 指向 Pages 子路径。
- **F1.2** `App.tsx` 布局壳：顶部 Header（标题 + 全局控制位）+ 2×2 面板栅格（CSS Grid）。
- **F1.3** 设计 token：`tokens.css`（`:root` CSS 变量，第一阶段中性占位值，照搬 DESIGN_SYSTEM §1.1）。
- **F1.4** `ViewPanel` 统一外框：标题栏 + 工具条位 + 图例位 + 内容区 + 空/加载/错误态。
- **F1.5** 全局加载/错误边界：数据 fetch 失败、空数据的兜底 UI。
- **F1.6** 响应式与最小可用宽度（桌面大屏优先，栅格降级策略占位）。

## M2 · 数据层与联动状态脊柱（框架，P0）

服务：所有视图与联动的「生命线」。

- **F2.1** `data/types.ts`：与 ARCHITECTURE §5 数据契约一一对应的 TS 类型（Actor/Film/EntropyCurve/Markov/Alignment/Genre）。
- **F2.2** `data/loadData.ts`：启动时一次性 `fetch` 6 份 JSON + 轻量类型/形状校验，注入只读数据上下文。
- **F2.3** 数据索引：`Map<actorId, …>`、`films by actorId`、`markov by (clusterId,stage)` 等查询索引，避免运行时全表扫描。
- **F2.4** `store/useVizStore.ts`（Zustand）：集中式交互状态 —— `brushedActorIds / selectedActorId / selectedFilmIndex / markovStage / alignmentFilters / detailsOpen` 及对应 actions。
- **F2.5** `store/selectors.ts`：派生数据（**仅汇总/筛选，不重算统计**）—— 当前 cohort 成员、cohort 平均熵曲线、按 stage 过滤的矩阵、按协变量重分层的对齐轨迹；记忆化。
- **F2.6** `lib/aggregate.ts`：纯函数 cohort 聚合与重分层工具（被 selectors 复用）。

## M3 · 视图 A · 类型群落投影 ClusterView（视图，P0）

服务：Task 1（宏观群落基线）；联动链路 1 的**触发源**。

- **F3.1** SVG 散点：每点一位演员，坐标 `projection[x,y]`，颜色 = `dominantEarlyGenre`（类型分类色）。
- **F3.2** D3 比例尺与坐标变换（投影坐标 → 画布）；点的悬停命中测试 + Tooltip（演员名、早期主导类型、filmCount）。
- **F3.3** `BrushLayer`：D3 brush 框选 → 写入 `brushedActorIds`（定义 cohort）；清除选区。
- **F3.4** 选中/非选中视觉态（高亮选区、降明度其余点）。
- **F3.5 (P1)** 群落 hull / 密度底纹或 `clusterId` 辅助着色，强化「群落」可读性。
- **F3.6 (P1)** 性能降级位：点数 > ~5k 时切 Canvas 渲染（ARCHITECTURE §3 策略，按需启用）。

## M4 · 视图 B · 生涯时序河流 RiverView（视图，P0）

服务：Task 2（熵固化速率）；链路 1 的**消费端**、链路 2 的**触发源**。

- **F4.1** Streamgraph：横轴 = **作品序列索引 1..N（非年份）**，流厚度 = 滑动窗口各类型接戏比例（D3 stack + 流式 offset）。
- **F4.2** 叠加**白色香农熵折线**（读 `entropy.json` 曲线）。
- **F4.3** 每部电影圆点：垂直位置/大小编码 IMDb 评分或投票数（可切换映射）。
- **F4.4** **cohort 平均叠加态**渲染：响应 `brushedActorIds`，展示群落平均熵衰减曲线与平均流（链路 1 消费）。
- **F4.5** 熵曲线**尖峰可点击**：点击尖峰区间 → 写入 `selectedActorId + selectedFilmIndex`（链路 2 触发）。
- **F4.6** 单演员 vs 群落两种模式的切换与空态处理。

## M5 · 视图 C · 转型对齐分叉 AlignmentView（视图，P0）

服务：Task 4（转型分叉与生存分析）；链路 2 的**消费端**、链路 3 的**载体**。

- **F5.1** 事件对齐坐标系：横轴 `tau = seqIndex − t0Index`，T=0 竖轴标记；读 `alignment.json` 的 `points`。
- **F5.2** 左侧（τ<0）低熵窄束收拢 + 右侧（τ>0）分叉：`outcome=success` 走绿色「多维演化区」、`snapback` 跌入红色「重新固化区」。
- **F5.3** 高亮联动：响应 `selectedActorId`，高亮该演员并对齐**同一作品序号尝试转型**的同侪（链路 2 消费）。
- **F5.4** **全局控制变量过滤器**：按 `covariatesAtT0`（导演异质性 / 票房 / 评分）动态重分层线条（链路 3）。
- **F5.5** 线条叠加可读性：粗细/透明度、成功/弹回区底纹。

## M6 · 视图 D · 马尔可夫转移门 MarkovView（视图，P0）

服务：Task 3（转移矩阵动态坍缩）；链路 1 的**消费端**。

- **F6.1** 热力矩阵：行 = 当前类型、列 = 下一部类型、单元格色阶 = 转移概率（单色顺序色阶，深端表达「重力场」对角线）。
- **F6.2** 行列类型标签排版（与 `genres.json` key 对齐，等宽数字）。
- **F6.3** **阶段切换 Toggle**：early / mid / late，写 `markovStage` 并重渲染（视图自身控制 + 全局可控）。
- **F6.4** **cohort 过滤**：响应 `brushedActorIds` → 映射到覆盖的 `clusterId` → 取对应矩阵（链路 1 消费，群落粒度，见 F0.10）。
- **F6.5** 单元格悬停 Tooltip（from→to 概率）+ 对角线强调。

## M7 · 通用组件与控件（视觉元素，P0–P1）

服务：DESIGN_SYSTEM §1.3 组件清单；details-on-demand 与全局控制。

- **F7.1** `DetailsPanel`（P0）：details-on-demand 浮层，键值列表展示选中演员/作品微观数据（评分↑/票房↓ 等 non-trivial pattern）；响应 `detailsOpen`。
- **F7.2** `Legend`（P0）：类型分类色 + 语义色（成功/弹回）图例。
- **F7.3** `Tooltip`（P0）：统一悬停信息卡片（被各视图复用）。
- **F7.4** `controls/Slider`（P0）：视图 C 控制变量/阈值过滤。
- **F7.5** `controls/Toggle`（P0）：分段按钮（视图 D 阶段切换、B 的评分/票房映射切换）。
- **F7.6** `controls/BrushLayer`（P0）：D3 brush 封装（被视图 A 使用）。
- **F7.7 (P1)** 极简线性图标集（阶段/过滤/展开/帮助），统一描边。

## M8 · 多视图联动链路（联动，P0）

服务：评分核心标准——视图间高密度语义关联。**联动正确性优先于单视图精度。**

- **F8.1 链路 1（宏观→中观）** `ClusterView.brush → setBrush(actorIds)`：B 重渲群落平均叠加态、D 重取该 cohort × stage 矩阵。
- **F8.2 链路 2（中观→微观）** `RiverView.clickSpike → selectActor + selectSpike(filmIndex)`：C 高亮并对齐同侪、`DetailsPanel` 展开转型作品微观数据。
- **F8.3 链路 3（控制变量审计）** `AlignmentView.filter → setAlignmentFilter(...)`：C 线条按导演异质性等外部变量动态重分层。
- **F8.4** 联动一致性：选区/选择变化时各视图状态同步、清除选区回到全局态、跨视图高亮配色一致。
- **F8.5 (P1)** 联动可发现性：链路触发的视觉提示、面包屑/当前队列说明文案。

## M9 · 第二阶段完备视觉方案（视觉，P2）

服务：DESIGN_SYSTEM 第二阶段；**只改 token 与 `ViewPanel` 样式，不动视图逻辑**。

- **F9.1** 配色定稿：中性阶（≥WCAG AA）、类型分类色（Tableau10 调校，key 对齐 `genres.json`）、矩阵顺序色阶、绿/红分叉双向色、交互态规则。
- **F9.2** 版式：4px 节奏、信息层级、密度与坐标轴低对比、响应式降级。
- **F9.3** 字体与字号：现代无衬线（中英兼顾）+ 等宽数字（`tabular-nums`），完整 type scale。
- **F9.4** 图标/图示规范、T=0 与坐标轴视觉标记。
- **F9.5** 动效：联动切换 150–250ms 过渡，遵循 `prefers-reduced-motion`。
- **F9.6** 各视图视觉规范回填（A 点态/hull、B 流配色与熵线、C 分叉底纹、D 单元格色阶）。
- **F9.7** token 回填：把定稿色值/字号写回 `tokens.css` 并补全 DESIGN_SYSTEM §2 色值表。

## M10 · 构建与部署（工程，P1）

服务：ARCHITECTURE §7 GitHub Pages 纯静态托管。

- **F10.1** `vite.config.ts` 设 `base: '/<repo-name>/'`，静态 JSON 随 `dist/` 发布。
- **F10.2** GitHub Actions：`build → upload artifact → deploy-pages` 工作流。
- **F10.3** 代码质量基线：ESLint + Prettier + TS `strict`，CI 校验。
- **F10.4 (P2)** 产物体积检查：`films.json`（~4MB）按需懒加载或精简字段。
