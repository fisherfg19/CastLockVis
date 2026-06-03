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
- [~] **F3.3 / F3.4** ClusterView `BrushLayer` 框选 → 写 `brushedActorIds` + 选中/降明度视觉态
- [~] **F8.1（A→D 部分）/ F6.4** 联动：selectors（`getDominantClusterId`→`getMarkovMatrixForCohort`）+ App 接线已就绪，D 已按主簇渲染；仅差 brush 触发端（F3.4）即可全闭环

**验收**：在 A 框选一个群落，D 立即切换为该群落矩阵；切换阶段 Toggle 矩阵随之更新；清除选区回到全局态。

## S3 · 静态视图 B 与 C（视图，P0 · 第一阶段）

> 两个定制图表，最耗时。完成后四视图均可独立渲染。

- [x] **F4.1** RiverView Streamgraph：横轴=作品序列 1..N、流厚度=滑动窗口类型比例
- [x] **F4.2** RiverView 叠加白色香农熵折线（`entropy.json`）
- [x] **F4.3** RiverView 每部电影圆点：评分/票数编码（位置或大小）
- [~] **F4.6** RiverView 单演员/群落两模式切换 + 空态：单演员态 + 空态已具备；群落平均态与切换待接（与 S4·F4.4 合并）
- [x] **F5.1** AlignmentView 对齐坐标系：`tau` 横轴 + T=0 竖轴标记（`alignment.json`）
- [x] **F5.2 / F5.5** AlignmentView 左侧低熵窄束 + 右侧绿/红分叉区（按 `outcome`）

**验收**：B 能渲染单演员河流+熵线、也能渲染群落平均态；C 能把全部对齐演员按 τ 对齐并按 outcome 分绿/红。

## S4 · 完整联动链路（联动，P0 · 第一阶段 · 评分核心）

> 把四视图焊成一个分析闭环。本里程碑权重最高。

- [~] **F4.4** 链路 1 消费端：RiverView 响应 `brushedActorIds` 渲染**群落平均叠加态**熵衰减
- [ ] **F8.1** 链路 1 完整收口：A.brush → B（平均态）+ D（cohort×stage）同步联动
- [ ] **F4.5** 链路 2 触发：RiverView 熵曲线尖峰可点击 → 写 `selectedActorId + selectedFilmIndex`
- [ ] **F5.3** 链路 2 消费：AlignmentView 高亮该演员 + 对齐同序号尝试转型的同侪
- [ ] **F7.1** 链路 2 详情：`DetailsPanel` 展开转型作品微观数据（评分↑/票房↓ non-trivial pattern）
- [ ] **F5.4** 链路 3：AlignmentView 全局控制变量过滤器（导演异质性/票房/评分）动态重分层
- [ ] **F8.4** 联动一致性：跨视图高亮配色统一、清除选区/选择回到全局态

**验收**：能完整复现 proposal §3 的三个联动场景（群落基线探查 / 转型窗口期微观审计 / 控制变量生存审计）。

## S5 · 通用控件、打磨与部署（P0–P1 · 第一阶段收尾）

- [ ] **F7.2 / F7.3** `Legend` + `Tooltip` 统一组件，各视图复用（现为各视图内联 figcaption + PanelLegends，未抽通用件）
- [~] **F7.4 / F7.5 / F7.6** `controls/Slider` `controls/Toggle` `controls/BrushLayer` 抽成通用控件：`controls/Toggle` 已抽；Slider / BrushLayer 待做
- [ ] **F1.6** 响应式与最小可用宽度
- [ ] **F8.5 (P1)** 联动可发现性：当前队列说明文案 / 触发提示
- [x] **F3.5 (P1)** ClusterView 群落 hull / 密度底纹（已做凸包 hull + 每簇图标；密度底纹未做）
- [x] **F10.1** `vite.config.ts` 设 `base`，确认 `dist/` 含 `data/*.json`
- [ ] **F10.2** GitHub Actions：build → upload → deploy-pages
- [ ] **F0.8 / F0.9 (P1)** 如需可读片名：`clean.py` 引入 `primaryTitle` 重跑流水线

**验收**：Pages 部署成功，子路径下静态资源与数据可达，三联动在线可用。

## S6 · 第二阶段完备视觉（视觉，P2 · 第二阶段）

> **唯一规则：只改 `tokens.css` 与 `ViewPanel`/视图样式表，不改视图逻辑与数据流。**
> 进入本阶段的前提：S1–S5 全部组件已无硬编码颜色/间距。

- [ ] **F9.1** 配色定稿并回填 token：中性阶（≥WCAG AA）、类型分类色（Tableau10 调校，key 对齐 `genres.json`）、矩阵顺序色阶、绿/红分叉色、交互态
- [ ] **F9.2 / F9.3** 版式与字体字号定稿（4px 节奏、type scale、等宽数字）
- [ ] **F9.4 / F9.5** 图标·坐标轴·T=0 标记规范 + 克制动效（150–250ms，`prefers-reduced-motion`）
- [ ] **F9.6** 各视图视觉规范回填（A 点态/hull、B 流配色与熵线、C 分叉底纹、D 单元格色阶）
- [ ] **F9.7** 把定稿色值/字号写回 DESIGN_SYSTEM §2 色值表，token 与文档同步
- [ ] **F10.4 (P2)** `films.json`（~4MB）按需懒加载或精简字段

**验收**：换肤后四视图视觉统一、达成「Analyst Console / Cinematic Dark」基调，且交互逻辑零回归。

---

## 关键路径与并行建议

- **关键路径**：S0 → S1 → S2(联动脊柱验证) → S3 → **S4(联动)** → S5。S6 视觉可与 S5 收尾部分并行。
- **可并行**：S2 完成后，B（S3 前两项）与 C（S3 后两项）可由不同人并行；`Legend/Tooltip/控件`（S5）可在 S2 期间随手抽取。
- **风险点**：① B 的 streamgraph 横轴语义（序列号非年份）易做错；② C 的 T=0 对齐与同侪对齐是团队核心贡献，须严格按 `alignment.json` 的 `tau`；③ A→D 联动的群落粒度（F0.10）不要误做成实时重算。
