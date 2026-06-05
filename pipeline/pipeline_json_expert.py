"""专家知识驱动的特征工程（Step 2）。

本脚本是 pipeline_json.py 的演进替代：在保持 6 个 JSON 数据契约 **schema 完全一致**
的前提下，铲除原管线对 `genres[0]`（IMDb 字段恰好是字母序，并非主次序）的依赖，
改用「方案 C + A」：

  · A（IDF 加权）— 类型按稀有度 idf=log(N/df) 加权，压低 Drama 这类泛在标签、
    抬升 Western/Musical 等稀有但高辨识度的类型。
  · C（特异性）— 不再硬选「主导类型」做分析支点；`dominantGenre` 降级为纯展示/
    着色标签（取片内标签里 idf 最大者，即最具辨识度的类型）。

== 相对 pipeline_json.py 的具体改动 ==
[clustering] earlyGenreVector：多热计数分布 → 各维 ×idf 再归一化（15 维软向量，
    不截断、不选主导）。耦合类型（Comedy+Romance、Crime+Thriller）各占一维、各带权重。
    KMeans 直接在 15 维向量上跑（原管线在 UMAP 2D 上聚，等于切降维产物）；k=N_CLUSTERS=7
    为 15 维 silhouette 峰值。projection[x,y] 改用 PaCMAP（仅展示，不参与聚类），二维簇
    分离度优于原 UMAP。注意：clusterId 数变为 7，markov.json 随之为 7×3=21 条（形状不变）。
[entropy]    EMA 熵曲线：原本只给字母序首位标签加 ALPHA → 改为把 ALPHA 按片内
    标签的 idf 分摊，熵反映整片的全部类型内容（修视图 B 尖峰 / 视图 C 的 y 轴）。
[t0]         转型窗口期：t0 改为「熵 onset 变点」——首个短窗(n..n+2)均熵较早期累积基线
    (1..n-1)上升 ≥ T0_ONSET_JUMP 的序号 n，即一次脱离舒适圈的转型尝试起点，不再依赖
    「特异类型切换」（避免单次偶发稀有类型误触发、且让 T<0 的左束由轨迹本身决定）。
[outcome]    成功/弹回改判「类型偏离度轨迹」：新增 dist = 1 − cos(早期画像 earlyGenreVector,
    以该片为中心的 k=5 滚动 idf 加权类型向量)，即「在类型空间里离早期舒适圈多远」，作为
    视图 C 的新 y 轴。分叉判据 lowflat：snapback 须同时 (a) 末段偏离度回吐峰值增益 ≥
    SNAPBACK_RETRACE 且 (b) 对齐窗 tau∈[+1,+5] 的 dist 斜率 ≤ SNAPBACK_SLOPE_MAX；否则
    success。(b) 消除「回落后又回升的轨迹被误染红」。把分叉判据放到类型空间距离而非熵高度，
    因 EMA 熵一旦上升几乎不回落、绿/红在熵轴上必然重叠；偏离度可被聚类的类型语义交叉验证
    （高内聚簇上右侧类型确实远离早期）。alignment.points 同时带 entropy 与 dist。
[label]      films.dominantGenre / actors.dominantEarlyGenre：字母序首位 → IDF-argmax
    （最具辨识度的类型）。仅作标签/着色键，不再是任何分析支点。
[markov]     视图 D 转移矩阵：M2 软转移——每片用 idf 归一化的类型权重向量，相邻两片
    按外积累加成软转移矩阵，行归一化。完全不挑主导类型。

数据来源与产出与 pipeline_json.py 一致：读 imdb_cleaned_flat.csv（由 clean_expert.py
的 Step 1 清洗产出），写 public/data/*.json。
"""

import pandas as pd
import numpy as np
import json
import math
import os
from collections import Counter
from sklearn.cluster import KMeans
from sklearn.preprocessing import normalize
from sklearn.metrics import silhouette_score
import pacmap
import warnings
warnings.filterwarnings('ignore')

# 配置项
INPUT_CSV = 'imdb_cleaned_flat.csv'
OUTPUT_DIR = 'public/data/'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Step 2 专家参数
# t0（何时转型）= 熵 onset 变点。短窗(n..n+2)平均熵较「早期累积基线(1..n-1)」上升 ≥ 此阈值，
# 判为一次脱离舒适圈的转型尝试起点（取首个满足者）。判据锚在熵轨迹上，下游用类型偏离度交叉验证。
# 0.50（较 0.40 更严）：只认清晰的多元化跃迁，外部显著性(T=0 导演异质性 Cohen's d)更高。
T0_ONSET_JUMP = 0.50
# t0 最早出现的序号：前 5 部为早期画像，从第 6 部起才可能判转型。
T0_ONSET_MIN_N = 6
# 滚动类型向量半窗：k = 2*ROLL_HALF+1 = 5 部，平滑单片噪声后算类型偏离度 dist。
# 取 2（非 1）：把 tau>0 的类内离散度从 ~0.22 降到 ~0.20，又不至于像 k=7 那样抹平分叉。
ROLL_HALF = 2
# 分叉判据（lowflat，取代旧的「末3 vs 初期」单点差）：snapback 须同时满足
#   (a) 回撤：峰值增益(peak−早期基线)被生涯末 3 部偏离度回吐 ≥ SNAPBACK_RETRACE，且
#   (b) 不再上升：对齐窗 tau∈[+1,+5] 的 dist 最小二乘斜率 ≤ SNAPBACK_SLOPE_MAX。
# (b) 直接消除「回落后又回升的轨迹被误染红」——上升尾一律判 success。分叉判据放在「类型空间
# 距离」而非熵高度（EMA 熵一旦上升几乎不回落、无法在熵轴分叉），且可被聚类的类型语义验证。
SNAPBACK_RETRACE = 0.50
SNAPBACK_SLOPE_MAX = 0.01
# 群落数：在 15 维 IDF 软向量上 KMeans。k=7 为 15 维特征空间内 silhouette(cosine)
# 的峰值，也是 Western/Musical 两个招牌类型都干净分离的最小 k。
N_CLUSTERS = 7
# KMeans 在组成型向量上存在劣质局部最优（Western 等稀有专才簇会时隐时现）。跨 N_SEEDS
# 个随机种子各跑一次，按 cosine-silhouette 选最优划分，确定性锁定高质量解。
N_SEEDS = 10

print("1. 加载清洗后的展平数据...")
df = pd.read_csv(INPUT_CSV)
df['genres_list'] = df['genres'].fillna('').apply(lambda x: str(x).split(',') if x else [])
df['startYear'] = pd.to_numeric(df['startYear'], errors='coerce').fillna(0).astype(int)

# 确保在单个演员内部按时间严格排序，并生成 seqIndex (1..N)
df = df.sort_values(by=['nconst', 'startYear'])
df['seqIndex'] = df.groupby('nconst').cumcount() + 1

# 提取有效类型大盘 (过滤极小众噪音)
all_genres = [g for sublist in df['genres_list'] for g in sublist if g]
genre_counts = Counter(all_genres)
valid_genres = [g for g, c in genre_counts.items() if c > 50]
genre_to_idx = {g: i for i, g in enumerate(valid_genres)}

# [A] 计算各类型逆文档频率 idf=log(N/df)，文档=唯一电影（按 tconst 去重，每片每类型计一次）
films_unique = df.drop_duplicates('tconst')
n_docs = len(films_unique)
doc_freq = Counter(g for gl in films_unique['genres_list'] for g in set(gl) if g in valid_genres)
idf = {g: math.log(n_docs / doc_freq[g]) for g in valid_genres}
print("   · 类型 idf（稀有度）:", {g: round(idf[g], 2) for g in
      sorted(valid_genres, key=lambda x: -idf[x])})


def film_genre_weights(tags):
    """一部电影的 idf 归一化类型权重向量（dict: 类型→权重，和=1）。"""
    w = {g: idf[g] for g in tags if g in valid_genres}
    s = sum(w.values())
    return {g: v / s for g, v in w.items()} if s > 0 else {}


def idf_argmax(tags):
    """片内标签里 idf 最大者（最具辨识度的类型），作展示/着色标签。"""
    cand = [g for g in tags if g in valid_genres]
    return max(cand, key=lambda g: idf[g]) if cand else "Unknown"


def genre_vector(genre_lists):
    """一组电影的 idf 加权、sum 归一化 15 维类型向量（与 earlyGenreVector 同口径）。"""
    w = {g: 0.0 for g in valid_genres}
    for gl in genre_lists:
        for g in gl:
            if g in idf:
                w[g] += idf[g]
    s = sum(w.values()) or 1.0
    return [w[g] / s for g in valid_genres]


def cosine(a, b):
    """两向量余弦相似度（非负向量 → [0,1]）。"""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def lstsq_slope(points):
    """点列 [(x, y), ...] 的最小二乘斜率（用于判末段是否仍在上升）。"""
    k = len(points)
    if k < 2:
        return 0.0
    mx = sum(x for x, _ in points) / k
    my = sum(y for _, y in points) / k
    num = sum((x - mx) * (y - my) for x, y in points)
    den = sum((x - mx) ** 2 for x, _ in points) or 1e-9
    return num / den


def display_title(row):
    """优先使用 Step 1 带出的 primaryTitle；旧 CSV 无该列时回退 tconst。"""
    title = row.get('primaryTitle')
    if title is not None and not pd.isna(title) and str(title).strip():
        return str(title)
    return str(row.get('tconst', 'Unknown'))


def display_director_name(row):
    """优先使用清洗阶段映射出的 directorName；旧 CSV 无该列时回退 director id。"""
    director_name = row.get('directorName')
    if director_name is not None and not pd.isna(director_name) and str(director_name).strip():
        return str(director_name)
    return str(row.get('director', 'Unknown'))


def director_heterogeneity_at(seq, index):
    """以当前作品为中心的 ±2 作品窗口内导演集合大小，供 films.json 逐片审计。"""
    window = seq[max(0, index - 2):index + 3]
    directors = {str(item.get('director', '')) for item in window if str(item.get('director', '')).strip()}
    return len(directors)


print("2. 执行特征工程与序列化...")
actors_dict = {}
films_list = []
entropy_dict = {}
alignment_dict = {}
actor_film_genres = {}  # aid -> 按 seq 顺序的「片内有效标签列表」，供 M2 软马尔可夫使用

ALPHA = 0.25  # EMA 衰减因子

# 按演员进行处理
for nconst, group in df.groupby('nconst'):
    if len(group) < 15: continue  # 严格保留生涯较长的演员

    seq = group.to_dict('records')
    actor_name = seq[0]['primaryName']
    film_count = len(seq)

    # 提取序列特征（每部片的有效标签集合，保序）
    genres_seq = [m['genres_list'] for m in seq]
    valid_seq = [[g for g in gl if g in valid_genres] for gl in genres_seq]
    actor_film_genres[nconst] = valid_seq

    # --- A. 早期画像 (前5部作品)：IDF 加权 15 维软向量 ---
    early_genres = [g for sublist in genres_seq[:5] for g in sublist if g in valid_genres]
    early_counts = Counter(early_genres)
    weighted_early = {g: early_counts.get(g, 0) * idf[g] for g in valid_genres}
    total_w_early = sum(weighted_early.values()) or 1
    early_vector = [round(weighted_early[g] / total_w_early, 3) for g in valid_genres]
    # dominantEarlyGenre 降级为标签：早期画像里 idf 加权占比最高者
    dominant_early = max(valid_genres, key=lambda g: weighted_early[g]) if early_counts else "Unknown"

    # --- B. 计算 EMA 熵曲线 (1..30)：ALPHA 按片内标签 idf 分摊 ---
    genre_weights = {g: 0.0 for g in valid_genres}
    entropy_curve = []

    for i, valid_curr in enumerate(valid_seq):
        for g in genre_weights: genre_weights[g] *= (1 - ALPHA)
        if valid_curr:
            share = film_genre_weights(valid_curr)  # idf 归一化，和=1
            for g, frac in share.items():
                genre_weights[g] += ALPHA * frac

        total_w = sum(genre_weights.values())
        ent = -sum((w / total_w) * math.log2(w / total_w) for w in genre_weights.values() if w > 0.001) if total_w > 0 else 0
        entropy_curve.append({"n": i + 1, "entropy": round(ent, 3)})

    entropy_dict[nconst] = {"actorId": nconst, "curve": entropy_curve[:30]}

    # --- C. T=0 检测（熵 onset 变点）+ 类型偏离度轨迹 + 分叉判据 ---
    # t0：首个「短窗(n..n+2)均熵 − 早期累积基线(1..n-1)」≥ T0_ONSET_JUMP 的序号 n（1-based）。
    # best_n 同时记录「最大上升候选」（即便不达阈值）——给 none 演员作伪锚点画淡灰轨迹。
    ent_vals = [p["entropy"] for p in entropy_curve]  # 下标 i → seqIndex i+1
    t0Index = -1
    best_n, best_delta = -1, -1e9
    for n in range(T0_ONSET_MIN_N, film_count - 2):
        pre = ent_vals[0:n - 1]                          # seqIndex 1..n-1
        short = ent_vals[n - 1:min(film_count, n + 2)]   # seqIndex n..n+2
        if len(pre) < 3 or len(short) < 2:
            continue
        delta = sum(short) / len(short) - sum(pre) / len(pre)
        if delta > best_delta:
            best_delta, best_n = delta, n
        if t0Index == -1 and delta >= T0_ONSET_JUMP:
            t0Index = n

    # 类型偏离度 d(seqIndex) = 1 − cos(早期画像, 以该片为中心的 k=5 滚动 idf 加权类型向量)。
    # 距离相对每位演员自己的早期画像 → 左侧(T<0) by construction ≈0 且窄（低偏离窄束）。
    dist = {}
    for s in range(1, film_count + 1):
        win = [valid_seq[j] for j in range(s - 1 - ROLL_HALF, s + ROLL_HALF) if 0 <= j < film_count]
        dist[s] = round(1 - cosine(early_vector, genre_vector(win)), 3)

    outcome = "none"
    align_points = []
    covariates = {}
    # 对齐锚点：转型者用真 t0；none 用最大上升候选 best_n（其「最接近转型」处），仅供画淡灰背景轨迹。
    anchor = t0Index if t0Index != -1 else best_n

    if t0Index != -1:
        real_idx = t0Index - 1
        # outcome（lowflat）：snapback 须同时「回撤够深」且「末段不再上升」，否则 success。
        pre_vals = [dist[s] for s in range(max(1, t0Index - 3), t0Index) if s in dist]
        late_vals = [dist[s] for s in range(film_count - 2, film_count + 1) if s in dist]
        pre_base = sum(pre_vals) / len(pre_vals) if pre_vals else 0.0
        late = sum(late_vals) / len(late_vals) if late_vals else pre_base
        peak = max(dist[s] for s in range(t0Index, film_count + 1) if s in dist)
        gain = peak - pre_base
        retrace = (peak - late) / gain if gain > 1e-6 else 0.0          # 峰值增益被回吐的比例
        tail = [(s, dist[s]) for s in range(t0Index + 1, min(film_count, t0Index + 5) + 1) if s in dist]
        tail_slope = lstsq_slope(tail)                                  # 对齐窗 tau∈[+1,+5] 末段斜率
        outcome = ("snapback" if retrace >= SNAPBACK_RETRACE and tail_slope <= SNAPBACK_SLOPE_MAX
                   else "success")

        # 获取 T=0 时刻的协变量（T 窗口导演异质性等）；仅转型者有真 T=0，none 留空。
        window_directors = set([str(m.get('director', '')) for m in seq[max(0, real_idx - 2):real_idx + 3]])
        covariates = {
            "numVotes": int(seq[real_idx]['numVotes']),
            "rating": float(seq[real_idx]['averageRating']),
            "directorHeterogeneity": len(window_directors)
        }

    # T-3..T+5 对齐点：entropy（视图 B 交叉参照）+ dist（视图 C 新 y 轴）。
    # 转型者锚在 t0；none 锚在 best_n（伪 T=0），其轨迹仅作淡灰背景上下文（贴近舒适圈低位）。
    if anchor != -1:
        for s in range(max(1, anchor - 3), min(film_count, anchor + 5) + 1):
            align_points.append({"tau": s - anchor,
                                 "entropy": entropy_curve[s - 1]["entropy"],
                                 "dist": dist[s]})

    alignment_dict[nconst] = {
        "actorId": nconst, "t0Index": t0Index, "outcome": outcome,
        "points": align_points, "covariatesAtT0": covariates
    }

    actors_dict[nconst] = {
        "id": nconst, "name": actor_name, "dominantEarlyGenre": dominant_early,
        "earlyGenreVector": early_vector, "filmCount": film_count,
        "t0Index": t0Index, "outcome": outcome
    }

    # --- D. 组装 Films 表：dominantGenre 降级为 IDF-argmax 标签 ---
    for film_index, m in enumerate(seq):
        films_list.append({
            "actorId": nconst, "seqIndex": m['seqIndex'],
            "titleId": str(m.get('tconst', 'Unknown')), "title": display_title(m),
            "year": m['startYear'], "genres": m['genres_list'],
            "dominantGenre": idf_argmax(m['genres_list']),
            "rating": float(m['averageRating']), "numVotes": int(m['numVotes']),
            "directorId": str(m.get('director', 'Unknown')),
            "directorName": display_director_name(m),
            "directorHeterogeneity": director_heterogeneity_at(seq, film_index),
        })

print("3. 执行聚类(15维 KMeans) + PaCMAP 投影...")
actor_ids = list(actors_dict.keys())
vectors = np.array([actors_dict[aid]["earlyGenreVector"] for aid in actor_ids], dtype=np.float32)
# L2 归一化：使欧氏 KMeans 近似球面/余弦聚类（组成型向量的正确度量）。仅聚类/投影用此副本，
# 存储字段 earlyGenreVector 仍是 sum-归一化口径，schema 不变。
vectors_l2 = normalize(vectors)

# 聚类：直接在 15 维向量上做 KMeans（先聚类，不在被降维形变过的 2D 上聚——UMAP/PaCMAP
# 会扭曲全局几何，在其 2D 输出上 KMeans 等于切降维产物而非类型结构）。KMeans 有劣质局部
# 最优，跨 N_SEEDS 个种子按 cosine-silhouette 选最优划分，确定性锁定高质量解。
best_labels, best_sil = None, -1.0
for rs in range(N_SEEDS):
    labels = KMeans(n_clusters=N_CLUSTERS, random_state=rs, n_init=10).fit_predict(vectors_l2)
    sil = silhouette_score(vectors_l2, labels, metric='cosine')
    if sil > best_sil:
        best_sil, best_labels = sil, labels
clusters = best_labels
print(f"   · 选定划分 cosine-silhouette={best_sil:.3f}")

# 投影：PaCMAP 仅用于视图 A 散点的二维坐标（展示用，不参与聚类）。调参
# (n_neighbors=30, MN_ratio=0.5, FP_ratio=1.5) 在无监督方法里对既定簇的二维分离度最佳。
reducer = pacmap.PaCMAP(n_components=2, n_neighbors=30, MN_ratio=0.5, FP_ratio=1.5, random_state=42)
embeddings = reducer.fit_transform(vectors_l2, init="pca")

for i, aid in enumerate(actor_ids):
    actors_dict[aid]["projection"] = [float(round(embeddings[i][0], 3)), float(round(embeddings[i][1], 3))]
    actors_dict[aid]["clusterId"] = int(clusters[i])
    if aid in alignment_dict:
        alignment_dict[aid]["clusterId"] = int(clusters[i])

print("4. 构建分阶段群落转移矩阵 (Markov · M2 软转移)...")
markov_list = []
# 划分阶段逻辑：0-9早期，10-19中期，20+晚期
stages = [(0, 10, 'early'), (10, 20, 'mid'), (20, 999, 'late')]
n_g = len(valid_genres)

for c_id in set(clusters):
    cohort_actors = [aid for aid in actor_ids if actors_dict[aid]["clusterId"] == c_id]

    for start, end, stg_name in stages:
        trans_counts = np.zeros((n_g, n_g))
        for aid in cohort_actors:
            stage_seq = actor_film_genres.get(aid, [])[start:end]
            # 每片转成 idf 归一化软向量（无有效标签的片记为 None，跳过其转移）
            vecs = []
            for tags in stage_seq:
                share = film_genre_weights(tags)
                if share:
                    v = np.zeros(n_g)
                    for g, frac in share.items():
                        v[genre_to_idx[g]] = frac
                    vecs.append(v)
                else:
                    vecs.append(None)
            # M2：相邻两片软向量外积累加
            for i in range(len(vecs) - 1):
                a, b = vecs[i], vecs[i + 1]
                if a is None or b is None: continue
                trans_counts += np.outer(a, b)

        # 行归一化得到概率矩阵
        row_sums = trans_counts.sum(axis=1, keepdims=True)
        prob_matrix = np.divide(trans_counts, row_sums, out=np.zeros_like(trans_counts), where=row_sums != 0)

        markov_list.append({
            "cohortId": int(c_id), "stage": stg_name,
            "genres": valid_genres, "matrix": np.round(prob_matrix, 3).tolist()
        })

print("5. 落盘输出数据契约 (JSON)...")
def save_json(filename, data):
    with open(os.path.join(OUTPUT_DIR, filename), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

save_json('genres.json', valid_genres)
save_json('actors.json', list(actors_dict.values()))
save_json('films.json', films_list)
save_json('entropy.json', list(entropy_dict.values()))
save_json('alignment.json', [a for a in alignment_dict.values() if a['points']])
save_json('markov.json', markov_list)

print("✅ 全部 6 个 JSON 契约文件已成功生成至 public/data/ 目录！")
