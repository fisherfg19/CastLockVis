# ARCHITECTURE — CastLock-Vis

> 本文档定义 CastLock-Vis 的实现架构。它服务于 `docs/overall_design/proposal.md`
> 中的四个分析任务与三条联动链路；当任何实现选择会削弱某项任务或破坏某条链路时，
> 以 proposal.md 为准并与用户确认。

## 1. 目标与约束

| 约束 | 决策 |
| --- | --- |
| 部署目标 | **GitHub Pages（纯静态托管，无后端、无数据库）** |
| 范围 | 仅实现 proposal.md 描述的单页可视分析系统；**不**为该方案之外的扩展预留通用框架 |
| 复杂度 | 维持在“能跑通四视图 + 三联动”的最小集合，优先成熟、低心智负担的方案 |
| 数据规模 | 演员量级（数百～数千），单部作品序列 N ≤ 30；可全量加载进浏览器 |

核心设计原则：**重计算离线化、运行时只做渲染与联动**。所有统计与降维（UMAP/MDS、
聚类、香农熵、马尔可夫矩阵、T=0 对齐）在离线流水线一次性算好并落盘为静态 JSON，
前端不做任何重计算。这样既符合 GitHub Pages 的静态约束，又把运行时复杂度压到最低。

## 2. 总体架构

系统分为两个完全解耦的层，二者只通过 `public/data/*.json` 这一**数据契约**连接：

```
┌─────────────────────────────────────────────────────────┐
│  离线数据流水线 (Python, 本地/CI 运行一次)                │
│  raw IMDb-like data ─► 清洗 ─► 特征/统计 ─► 降维/聚类     │
│                                  │                        │
│                                  ▼                        │
│              public/data/*.json  (静态数据契约)            │
└─────────────────────────────────────────────────────────┘
                                   │  (fetch on load)
                                   ▼
┌─────────────────────────────────────────────────────────┐
│  前端 SPA (React + TS + D3 + Zustand, Vite 构建)          │
│  四视图渲染 + 集中式交互状态(联动) ──► GitHub Pages 静态托管 │
└─────────────────────────────────────────────────────────┘
```

## 3. 技术栈与选型理由

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 构建 | **Vite** | 零配置、快、原生支持静态产物与 `base` 路径（Pages 子路径必需） |
| 框架 | **React 18 + TypeScript** | 生态成熟、组件化清晰、类型保证数据契约不被误用 |
| 可视化 | **D3.js** (scale / shape / selection 等模块) | 四视图均为定制图表（streamgraph、对齐分叉、热力矩阵、投影散点），D3 提供最直接的底层控制 |
| 状态 | **Zustand** | 轻量集中式 store，是承载“多视图联动”的脊柱；比 Redux 心智负担低，比 Context 更适合高频选区更新 |
| 样式 | **CSS Modules + CSS 自定义属性(变量)** | 设计 token 走 CSS 变量，主题可换；详见 DESIGN_SYSTEM.md |
| 离线计算 | **Python**：pandas / numpy / scikit-learn（UMAP 用 `umap-learn`，可降级 MDS） | 标准数据科学栈，离线一次性运行，不进入前端运行时 |

> 渲染策略：四视图默认用 **SVG**（交互、命中测试、样式最简单）。仅当散点图 (视图 A)
> 点数超过约 5k 导致卡顿时，才将视图 A 单独切换到 **Canvas**；其余视图保持 SVG。

## 4. 离线数据流水线

位于仓库 `pipeline/`（Python）。它是一次性/可重跑的脚本集合，**不参与部署**，
产物直接 commit 到 `public/data/`。

阶段（每阶段产出可被下游复用的中间件）：

1. **清洗 / 规整**：统一演员 id、作品按时间排序生成 `seqIndex (1..N)`、归一类型标签到固定 taxonomy。
2. **早期画像**：取每位演员前 5 部作品 → IDF 加权类型向量（压低 Drama 等泛在类型）→ 主导早期类型 `dominantEarlyGenre`（取 IDF 最大的标签，非字母序）。
3. **聚类 + 降维**：早期向量按类型稀有度 IDF 加权后，**直接在 15 维上 KMeans**（k=7，跨种子按 cosine-silhouette 选优）得到 `clusterId`（视图 A 的群落、即联动的 cohort 单位）；再用 **PaCMAP** 仅为散点生成展示用 `projection [x,y]`（不参与聚类，避免在被降维形变的 2D 上聚类）。
4. **熵曲线**：对每位演员，按滑动窗口在 N=1..30 上算香农熵 → `entropy curve`（视图 B 白线、视图 C 纵轴）。
5. **马尔可夫矩阵**：按 cohort × 职业阶段(early/mid/late) 统计类型→下一类型转移概率（视图 D）。采用 **M2 软转移**——每部片转成 IDF 归一化的类型权重向量，相邻两片按外积累加，再行归一化，不对耦合片做硬主导选择。
6. **T=0 对齐**：自动检测每位演员“第一部踏入早期未涉足、且足够特异（IDF≥阈值）的类型”作品，记为 `t0Index`；据此计算对齐坐标 `tau = seqIndex - t0Index`。`outcome (success | snapback | none)` 由**持久性**判定：触发类型在 t0 后累计出现 ≥K 次为 success，否则 snapback（视图 C 的对齐机制）。

> 检测规则、聚类 k、IDF/持久性阈值等参数集中写在 `pipeline/pipeline_json_expert.py` 顶部常量（`T0_IDF_THRESHOLD` / `T0_PERSIST_K` / `N_CLUSTERS` / `N_SEEDS`），便于复现与调参。

## 5. 数据契约（联动的生命线）

> proposal.md 强调：实现任一视图时**必须保留被联动视图所需的数据形状与标识符**
> （actor id、作品序列号、T=0 锚点、cohort 归属）。以下契约即这些标识符的唯一来源。

落盘文件（`public/data/`）：

| 文件 | 内容 | 主要消费视图 |
| --- | --- | --- |
| `genres.json` | 类型 taxonomy 与稳定 key（颜色映射的 key 基准） | 全部 |
| `actors.json` | 每位演员：`id, name, projection[x,y], clusterId, dominantEarlyGenre, earlyGenreVector, filmCount, t0Index, outcome` | A（点）、联动 cohort 源 |
| `films.json` | 作品序列：`actorId, seqIndex, title, year, genres[], dominantGenre, rating, numVotes, directorId` | B（流+圆点）、详情面板 |
| `entropy.json` | 每位演员熵曲线 `{actorId, curve:[{n, entropy}]}` | B（白线）、C（纵轴） |
| `markov.json` | 转移矩阵，按 `{cohortId, stage}` 键控 `{genres[], matrix[][]}` | D |
| `alignment.json` | 对齐轨迹 `{actorId, clusterId, t0Index, outcome, points:[{tau, entropy}], covariatesAtT0:{numVotes, rating, directorHeterogeneity}}` | C |

**贯穿全契约的稳定标识符**：`actorId`、`seqIndex`、`tau`(=seqIndex−t0Index)、`clusterId`、
`dominantGenre`。任何视图新增数据时不得改变这些字段语义，否则联动断裂。

## 6. 前端架构

### 6.1 目录结构

```
src/
  main.tsx                # 入口
  App.tsx                 # 布局壳：Header + 四视图面板栅格
  data/
    loadData.ts           # fetch + 类型校验，启动时加载全部 JSON
    types.ts              # 数据契约的 TS 类型（与第 5 节一一对应）
  store/
    useVizStore.ts        # Zustand：集中式交互/选区状态（联动脊柱）
    selectors.ts          # 派生数据：当前 cohort、聚合熵、过滤后矩阵等
  views/
    ClusterView/          # 视图 A  Genre-Space Cluster
    RiverView/            # 视图 B  Career River Chronology
    AlignmentView/        # 视图 C  Transformation Alignment
    MarkovView/           # 视图 D  Markov Transition Gate
  components/
    ViewPanel.tsx         # 统一面板外框（标题/工具条/图例/空态）
    DetailsPanel.tsx      # details-on-demand 弹窗
    controls/             # Slider / Toggle / Brush 等通用控件
  lib/
    aggregate.ts          # 纯函数：cohort 聚合、重分层（无重计算，仅汇总）
public/
  data/*.json             # 离线产物（数据契约）
```

### 6.2 集中式交互状态（联动模型）

所有跨视图交互都经由唯一的 Zustand store，视图只“读 store + 写 store”，
彼此不直接通信。这是高密度联动可被维护的关键。

```ts
interface VizState {
  // 选区（谁触发）
  brushedActorIds: Set<string>;   // 视图 A brush 框选 → 定义 cohort
  selectedActorId: string | null; // 视图 B 点击某演员
  selectedFilmIndex: number | null; // 视图 B 点击尖峰对应的作品序号

  // 联动控制参数
  markovStage: 'early' | 'mid' | 'late'; // 视图 D 阶段过滤
  alignmentFilters: {            // 视图 C 全局控制变量过滤器
    directorHeterogeneity: [number, number];
    // ...其余控制变量
  };

  detailsOpen: boolean;          // details-on-demand 面板

  // actions（写）
  setBrush, clearBrush, selectActor, selectSpike,
  setMarkovStage, setAlignmentFilter, openDetails ...
}
```

派生数据（`selectors.ts`，纯函数、可记忆化）：当前 cohort 成员、cohort 平均熵曲线、
按 stage 过滤的马尔可夫矩阵、按控制变量重分层后的对齐轨迹。**它们只做汇总/筛选，不做统计计算**。

### 6.3 三条联动数据流（对应 proposal 第 3 节）

```
链路1 宏观→中观   ClusterView.brush ─► setBrush(actorIds)
                  └► RiverView   读 cohort → 渲染“群落平均叠加态”熵衰减
                  └► MarkovView  读 cohort + stage → 渲染该群落转移矩阵

链路2 中观→微观   RiverView.clickSpike ─► selectActor + selectSpike(filmIndex)
                  └► AlignmentView 高亮该演员，并对齐同在该作品序号尝试转型的同侪
                  └► DetailsPanel  展开第 8/9/10 部转型作品的微观数据(评分↑/票房↓ 等)

链路3 控制变量审计 AlignmentView.filter ─► setAlignmentFilter(...)
                  └► AlignmentView 线条按导演异质性等外部变量动态重分层（绿色成功区 / 红色固化区）
```

### 6.4 加载与渲染生命周期

`loadData.ts` 在应用启动时一次性 `fetch` 全部 JSON 并做轻量类型校验 → 注入只读数据上下文 →
四视图挂载。交互后仅 store 选区/参数变化，触发派生 selector 重算与受影响视图重绘，**不重新请求数据**。

## 7. 部署（GitHub Pages）

- `vite.config.ts` 设置 `base: '/<repo-name>/'`，保证子路径下资源可达。
- 构建 `vite build` → 产物 `dist/`。
- 通过 **GitHub Actions** 工作流：`build → 上传 artifact → deploy-pages`。
- 数据为静态 JSON，随 `dist/` 一并发布，无需运行时服务。

## 8. 最小范围声明（非目标）

- 不做后端 / API / 用户系统 / 持久化。
- 不做离线流水线的 Web 化或在线重算；调参在本地重跑脚本。
- 不为 proposal 之外的视图/数据源预留通用插件机制——按 proposal 单页方案实现即可。
- 性能优化仅在出现可感知卡顿时介入（首选：视图 A 切 Canvas），不提前过度优化。

> 当架构决策进一步细化（参数定稿、字段增补）时，更新本文件而非另建文档。