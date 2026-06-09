# CastLock-Vis

> 演员「类型锁定」与「转型窗口期」的可视分析系统。

CastLock-Vis 用「**宏观群落分布 → 中观序列演化 → 微观个体下钻**」的递进式流水线，结合四个高度联动的视图，帮助分析师回答一个工业问题：**演员是如何被一步步焊死在「舒适圈」里的，又有谁、靠什么打破了这层「重力场」。**

> **项目状态：第一阶段功能收尾，进入 S6 视觉定稿。** 设计已初步定型；离线专家流水线**已完成**，6 份数据契约 JSON 已生成并入库；前端 SPA（Vite + React 18 + TS + D3 + Zustand）已跑通四视图、三条联动链路、通用控件与 Pages 构建。后续重点按 [`docs/plan/TODO.md`](docs/plan/TODO.md) 推进 S6 第二阶段完备视觉。权威设计规格见 [`docs/overall_design/proposal.md`](docs/overall_design/proposal.md)。

---

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器 → http://localhost:5173/CastLockVis/
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite 开发服务器（热更新） |
| `npm run build` | `tsc -b && vite build` → `dist/`（含 `dist/data/*.json`） |
| `npm run preview` | 本地预览生产构建 |
| `npm run typecheck` | TS 类型检查（`strict`） |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 `src/` |

离线流水线（数据已入库，**通常无需运行**，仅在重算数据时）：
`pip install -r pipeline/requirements.txt`，然后 `python pipeline/clean_expert.py` → `python pipeline/pipeline_json_expert.py`。
详见 [`docs/contribution/config.md`](docs/contribution/config.md)。

---

## 技术栈

两层架构，仅通过 `public/data/*.json`（**数据契约**）连接。**重计算全部离线**（Python：IDF 加权早期类型向量、15 维 KMeans 聚类、PaCMAP 投影、香农熵、软马尔可夫矩阵、T=0 对齐），**前端只渲染与联动，运行时绝不重算统计**。

| 层 | 选型 |
|---|---|
| 构建 | Vite（原生支持静态产物与 `base` 子路径，Pages 部署必需） |
| 框架 | React 18 + TypeScript（`strict`） |
| 可视化 | D3.js（四视图均为定制图表，默认 SVG） |
| 状态 | Zustand（集中式 store，承载多视图联动的脊柱） |
| 样式 | CSS 变量（设计 token），便于第二阶段无缝换肤 |
| 离线计算 | Python：pandas / numpy / scikit-learn |

详见 [`docs/dev_rule/ARCHITECTURE.md`](docs/dev_rule/ARCHITECTURE.md)。

---

## 核心分析任务（Analytical Tasks）

系统设计了 4 个相互嵌套的分析任务，每个任务对应一个纯统计无法直观呈现的工业问题：

| # | 任务 | 层级 | 目标 |
|---|------|------|------|
| 1 | **类型群落与基线识别** | 宏观 | 识别演艺圈天然存在的「舒适圈」群落（动作 / 喜剧 / 剧情……），看清演员出道时（前 5 部）的类型分布差异。 |
| 2 | **香农熵「固化速率」探测** | 中观 | 观察类型多元度（熵值）如何随作品数量 N（1…30）增加而衰减，捕捉「转型窗口期」。 |
| 3 | **马尔可夫转移「动态坍缩」审计** | 中观 | 观察「当前类型 → 下一部类型」的转移矩阵，验证对角线是否随生涯推进被无限加粗、形成「重力场」。 |
| 4 | **转型分叉与「工业重力」生存分析** | 微观 | 聚焦尝试「越狱」的演员，对比成功转型者与被弹回者，挖掘背后的控制变量（票房、评分、导演异质性）。 |

---

## 四个核心视图（Views）

### 视图 A — 类型偏好高维投影图（Genre-Space Cluster）
PaCMAP 散点投影。**每个点 = 一位演员**，坐标由其**前 5 部作品的 IDF 加权类型向量**投影而来；颜色 = 早期占比最高的标志性类型，形状 / hull 辅助表达 `clusterId` 群落。

### 视图 B — 演艺生涯时序河流图（Career River Chronology）
改进型时序流图（Streamgraph）。**横轴是作品序列索引（第 1…N 部），而非自然年份**；流厚度代表各类型接戏比例。河流上方叠加一条**白色香农熵折线**；每部电影是一个圆点，其垂直位置 / 大小编码 IMDb 评分或投票数。

### 视图 C — 转型时间轴对齐分叉图（Transformation Alignment View）
事件对齐生存曲线。**系统自动捕捉每位演员「第一部明显偏离早期舒适圈」的尝试，并将其对齐为时间原点 T = 0**，从而让转型时机不同的演员可以横向对比。当前默认纵轴是类型偏离度 `dist`（`1 - cos(earlyGenreVector, rolling genre vector)`），熵仅作交叉参照；T < 0 是低偏离窄束，T > 0 分叉为绿色「多维演化区」（成功）与红色「重新固化区」（被弹回），`none` 轨迹作为淡灰上下文。

### 视图 D — 动态马尔可夫转移矩阵（Markov Transition Gate）
交互式热力矩阵。行 = 当前类型，列 = 下一部类型，单元格深浅 = 转移概率。**支持按生涯阶段（早期 / 中期 / 晚期）过滤。**

---

## 多视图联动（Brushing & Linking）

> 本项目的价值取决于视图之间的**高密度语义关联**，而非任何单个视图。视图必须能参与下列链路，否则失去设计意义。

```
[视图 A: 散点圈层] --(Brush 框选群落)--> [视图 B: 聚合河流图] & [视图 D: 阶段矩阵]
                                              │
                                       (Click 单个演员/尖峰)
                                              ▼
                                  [视图 C: 对齐分叉图高亮] & [详情弹窗]
```

- **A → B + D（宏观→中观）：** 在 A 中框选某群落，B 重置为该群落的**平均叠加态**熵衰减曲线，D 取对应队列并按生涯阶段拆分（**群落粒度**：按选区覆盖的 `clusterId` 取预算矩阵，不实时重算）。
- **A/B → C + 详情（中观→微观）：** 在 A 单击演员或点击 B 熵曲线上的尖峰，激活 C（高亮该演员 + 同 `clusterId` 同侪，按 `outcome` 分绿/红），并打开 details-on-demand 面板。选中作品序号仅用于绘制 τ 辅助线，不再作为同侪定义。
- **C 上的全局过滤器（控制变量审计）：** 如「T=0 时合作导演的异质性」等过滤器需动态重组 C 的线条，揭示驱动分叉结果的外部协变量。

**实现约束：** 实现任一视图时，必须保留联动视图所需的数据形态与稳定标识符 —— `actorId`、`seqIndex`、`tau (= seqIndex − t0Index)`、`clusterId`、`dominantGenre`。不得改变其语义，否则联动断裂。

---

## 数据契约（`public/data/`）

离线流水线产物，前端启动时一次性加载、运行时只筛选/汇总（纯函数 selector）。

| 文件 | 形状（实际） | 消费视图 |
|---|---|---|
| `genres.json` | `string[]`（15 个类型，颜色映射 key 基准） | 全部 |
| `actors.json` | 1157 × `{id,name,dominantEarlyGenre,earlyGenreVector,filmCount,t0Index,outcome,projection[x,y],clusterId}` | A、cohort 源 |
| `films.json` | 30336 × `{actorId,seqIndex,title,titleId,year,genres[],dominantGenre,rating,numVotes,directorId,directorName,directorHeterogeneity}` | B、详情 |
| `entropy.json` | 1157 × `{actorId,curve:[{n,entropy}]}`（n=1..30） | B（白线）、C（交叉参照） |
| `markov.json` | 21 × `{cohortId,stage,genres[15],matrix[15][15]}`（7 群落 × early/mid/late） | D |
| `alignment.json` | 1157 × `{actorId,clusterId,t0Index,outcome,points:[{tau,entropy,dist}],covariatesAtT0:{...}}`（`dist` 为 C 默认纵轴；`none` 轨迹协变量为空，仅作淡灰上下文） | C |

> **数据说明**：`films.title` 现为可读片名（`tconst` 另存于 `films.titleId`）；`films` 已逐片带 `directorName` 与 `directorHeterogeneity`，`alignment.covariatesAtT0` 亦保留 T=0 时刻的 `directorHeterogeneity`。若某功能需要不同形态，请在 `clean_expert.py`/`pipeline_json_expert.py` 修改并重跑流水线。

---

## 仓库结构

```
CastLockVis/
├── CLAUDE.md                          # 给 Claude Code 的工作指引
├── index.html · package.json · vite.config.ts · tsconfig*.json · eslint.config.js
├── docs/
│   ├── overall_design/proposal.md     # 权威设计规格（中文）
│   ├── plan/
│   │   ├── TODO.md                    # 有序里程碑 S0–S6（工作队列）
│   │   └── FEATURE_LIST.md            # 模块化功能拆解（Fx.y 编号）
│   ├── dev_rule/
│   │   ├── ARCHITECTURE.md            # 技术栈、数据契约(§5)、store/联动模型(§6)
│   │   └── DESIGN_SYSTEM.md           # 两阶段视觉方案（骨架 → 完备）
│   └── contribution/config.md         # 环境配置
├── pipeline/                          # 离线 Python 流水线 + requirements.txt
│   ├── clean_expert.py · pipeline_json_expert.py
├── public/
│   └── data/*.json                    # 6 份数据契约（已入库，构建拷入 dist/data/）
└── src/                               # 前端源码（四视图、联动 store、通用控件与样式）
    ├── main.tsx · App.tsx
    ├── data/ · store/ · lib/
    ├── components/
    ├── views/                         # 四个真实数据视图 + 图例与图表工具
    └── styles/{tokens,global}.css     # 设计 token（第一阶段占位，S6 换肤主入口）
```

目标 `src/` 布局（`{data,store,views,components,lib}`）见 ARCHITECTURE §6.1。

---

## 开发指引（read order）

1. [`docs/plan/TODO.md`](docs/plan/TODO.md) — 有序里程碑 S0–S6，**这是工作队列**。
2. [`docs/plan/FEATURE_LIST.md`](docs/plan/FEATURE_LIST.md) — 模块化功能拆解（TODO 引用的 `Fx.y`）。
3. [`docs/dev_rule/ARCHITECTURE.md`](docs/dev_rule/ARCHITECTURE.md) — 技术栈、数据契约（§5）、store/联动模型（§6）。
4. [`docs/dev_rule/DESIGN_SYSTEM.md`](docs/dev_rule/DESIGN_SYSTEM.md) — 两阶段视觉方案（骨架 → 完备）。
5. [`docs/overall_design/proposal.md`](docs/overall_design/proposal.md) — 权威规格：四任务、四视图、三联动链路。
6. [`docs/contribution/config.md`](docs/contribution/config.md) — 环境配置。

---

## 贡献约定

- **联动是评分核心**：任一视图任何时候都必须保留上述稳定标识符，否则三条链路断裂。
- **运行时禁止重算统计**：只对预算 JSON 做汇总/筛选（selector 纯函数、可记忆化）。
- **两阶段视觉**：S0–S5 全程用中性占位 token，**禁止硬编码颜色/间距，一律引用 `src/styles/tokens.css` 的 CSS 变量**；第二阶段（S6）只改 token，不动视图逻辑。
- **术语固定**：proposal.md 使用一套领域术语（类型锁定、转型窗口期、舒适圈、重力场、对齐机制）。除非另有要求，代码标识符与 UI 文案沿用之。
- **文档为准**：架构与设计决策确定后写回 `docs/dev_rule/*`（范围变更写回 `docs/plan/*`），而非新建文件。
- **规格权威**：若某实现选择会削弱 4 个任务、或破坏任一联动链路，先确认再编码。
