# 开发环境配置（最简方案）

> 本文档给出 CastLock-Vis 的**最简可跑通配置**。技术栈与理由见
> [`docs/dev_rule/ARCHITECTURE.md`](../dev_rule/ARCHITECTURE.md)，无需在此重复。
> 多数人**只需做「前端」一节**——数据契约（`public/data/*.json`）已随仓库提交，前端不重算。

## 先决条件

| 工具 | 版本（验证通过） | 用途 |
| --- | --- | --- |
| Node.js | ≥ 20（验证于 22.14） | 前端构建/运行 |
| npm | ≥ 10（验证于 10.9） | 包管理 |
| Python | 3.12（仅重跑流水线时需要） | 离线数据流水线 |

---

## 前端（日常开发，唯一必需）

```bash
npm install        # 安装依赖
npm run dev        # 启动开发服务器（Vite，默认 http://localhost:5173/CastLockVis/）
```

就绪标志：页面显示数据加载状态（当前数据契约约为 `genres=15 · actors=1157 · films=30336 · entropy=1157 · markov=21 · alignment=1157`），说明 React 渲染、CSS token、
`public/data/*.json` 在 base 路径下加载三者均正常。

常用脚本（见 `package.json`）：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（热更新） |
| `npm run build` | 生产构建 → `dist/`（含 `dist/data/*.json`） |
| `npm run preview` | 本地预览构建产物 |
| `npm run typecheck` | TS 类型检查（`strict`） |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 `src/` |

### GitHub Pages base 路径

`vite.config.ts` 的 `base` 默认 `'/CastLockVis/'`（部署仓库名）。仓库名不同则：

```bash
VITE_BASE=/你的仓库名/ npm run build   # 或直接改 vite.config.ts
```

代码内引用 `public/` 资源**务必**用 `import.meta.env.BASE_URL` 前缀（如
`` `${import.meta.env.BASE_URL}data/genres.json` ``），不要写死 `/data/...`，否则子路径部署会 404。

---

## 离线数据流水线（仅在需要重算数据时）

数据已提交，**通常无需运行**。仅当修改清洗规则、调参或更新数据源时才重跑。

```bash
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash；Linux/macOS 用 bin/activate
pip install -r pipeline/requirements.txt
```

两步生成数据契约：

```bash
# 1) 专家清洗（需先把 IMDb 原始 tsv.gz 放到 pipeline/imdb_data/，见 clean_expert.py 顶部注释）
#    产出 imdb_cleaned_flat.csv（含 primaryTitle / directorName）
python pipeline/clean_expert.py

# 2) 特征工程 + 降维/聚类/熵/马尔可夫/T=0 对齐 → public/data/*.json
python pipeline/pipeline_json_expert.py
```

> 原始 IMDb 数据集体积大且不入库（见 `.gitignore`）；第 1 步产出的 `imdb_cleaned_flat.csv`
> 同样不入库，作为第 2 步的中间产物。

---

## 仓库布局（配置相关）

```
CastLockVis/
├── index.html              # Vite 入口
├── package.json            # 脚本与依赖
├── vite.config.ts          # base 路径、构建配置
├── tsconfig*.json          # TS（app / node 双 project）
├── eslint.config.js        # ESLint 扁平配置
├── .prettierrc.json        # 格式化规则
├── .gitignore              # node_modules / dist / 原始数据 / py 缓存
├── src/                    # 前端源码（四视图、联动 store、通用控件与样式）
│   ├── main.tsx · App.tsx
│   ├── data/ · store/ · lib/
│   ├── components/
│   ├── views/              # 四个真实数据视图 + 图例与图表工具
│   └── styles/tokens.css   # 设计 token（第一阶段占位，S6 换肤主入口）
├── public/data/*.json      # 数据契约（已提交，构建时拷入 dist/data/）
└── pipeline/               # 离线流水线 + requirements.txt
```

---

## 验证清单（环境是否就绪）

- [x] `npm install` 成功
- [x] `npm run dev` 页面显示数据加载成功
- [x] `npm run build` 产出 `dist/` 且含 `dist/data/*.json`
- [x] `npm run typecheck` / `npm run lint` 通过
- [ ] （可选）流水线：`pip install -r pipeline/requirements.txt` 后两脚本可重跑
