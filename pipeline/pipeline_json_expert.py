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
[t0]         转型窗口期：原本「main genre 跳出早期集」（字母序）→ 改为「首次引入早期
    5 部未出现、且足够特异（idf ≥ T0_IDF_THRESHOLD）的类型」为转型尝试，避免被无关
    紧要的 Drama/Comedy 触发；outcome 改判「持久性」——触发类型在 t0 后累计出现
    ≥ T0_PERSIST_K 次为成功转型，否则回弹（snapback），让 none/snapback/success 三类分明。
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
# t0 转型触发门槛：只有引入「idf ≥ 阈值」的陌生类型才算一次真正的类型转向尝试。
# 现存 idf：Drama 0.51 < Comedy 1.01 < Action 1.39 < Crime 1.58 < Thriller 1.73
# < Romance 1.74 < Adventure 2.02 < ...；取 1.5 → 只挡住 Drama/Comedy/Action 三个
# 「默认模式」，踏入 Crime/Thriller 及以上才判为转型尝试（保留这些正当转型目标的可解释性）。
T0_IDF_THRESHOLD = 1.5
# 转型结局门槛：t0 触发的类型在 t0 之后（含当部）累计出现 ≥ K 次 → 成功转型，否则判回弹。
# 把「持久性」放在 outcome 而非 t0，使 none/snapback/success 三类都立得住
# （当前参数下约 1.7% / 51.7% / 46.6%）。
T0_PERSIST_K = 3
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

    # --- C. T=0 对齐检测：首次引入「早期未见 + 高 idf」的特异类型 = 一次转型尝试 ---
    early_set = set(early_genres)
    t0Index = -1
    t0_genre = None
    for i in range(5, len(valid_seq)):
        new_distinctive = [g for g in valid_seq[i]
                           if g not in early_set and idf[g] >= T0_IDF_THRESHOLD]
        if new_distinctive:
            t0Index = i + 1  # seqIndex 是 1-based
            t0_genre = max(new_distinctive, key=lambda g: idf[g])  # 触发转型的特异类型
            break

    outcome = "none"
    align_points = []
    covariates = {}

    if t0Index != -1:
        real_idx = t0Index - 1
        # 获取 T=0 时刻的协变量
        window_directors = set([str(m.get('director', '')) for m in seq[max(0, real_idx - 2):real_idx + 3]])
        covariates = {
            "numVotes": int(seq[real_idx]['numVotes']),
            "rating": float(seq[real_idx]['averageRating']),
            "directorHeterogeneity": len(window_directors)
        }
        # 截取 T-3 到 T+5 的局部熵轨迹（供视图 C 对齐绘制）
        for i in range(max(0, real_idx - 3), min(film_count, real_idx + 6)):
            tau = (i + 1) - t0Index
            align_points.append({"tau": tau, "entropy": entropy_curve[i]["entropy"]})

        # 评判转型结局：t0 触发类型在 t0 之后（含当部）累计出现 ≥ K 次 → 成功转型，否则回弹
        recur = sum(1 for j in range(real_idx, len(valid_seq)) if t0_genre in valid_seq[j])
        outcome = "success" if recur >= T0_PERSIST_K else "snapback"

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
    for m in seq:
        films_list.append({
            "actorId": nconst, "seqIndex": m['seqIndex'], "title": m['tconst'],  # 若有primaryTitle请替换
            "year": m['startYear'], "genres": m['genres_list'],
            "dominantGenre": idf_argmax(m['genres_list']),
            "rating": float(m['averageRating']), "numVotes": int(m['numVotes']),
            "directorId": str(m.get('director', 'Unknown'))
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
save_json('alignment.json', [a for a in alignment_dict.values() if a['t0Index'] != -1])
save_json('markov.json', markov_list)

print("✅ 全部 6 个 JSON 契约文件已成功生成至 public/data/ 目录！")
