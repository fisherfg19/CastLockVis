import pandas as pd
import numpy as np
import json
import math
import os
from collections import Counter
from sklearn.cluster import KMeans
import umap
import warnings
warnings.filterwarnings('ignore')

# 配置项
INPUT_CSV = 'imdb_cleaned_flat.csv'
OUTPUT_DIR = 'public/data/'
os.makedirs(OUTPUT_DIR, exist_ok=True)

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

ALPHA = 0.25 # EMA 衰减因子

# 按演员进行处理
for nconst, group in df.groupby('nconst'):
    if len(group) < 15: continue # 严格保留生涯较长的演员
    
    seq = group.to_dict('records')
    actor_name = seq[0]['primaryName']
    film_count = len(seq)
    
    # 提取序列特征
    genres_seq = [m['genres_list'] for m in seq]
    main_genres = [g[0] if g else 'Unknown' for g in genres_seq]
    
    # --- A. 早期画像 (前5部作品) ---
    early_genres = [g for sublist in genres_seq[:5] for g in sublist if g in valid_genres]
    early_counts = Counter(early_genres)
    total_early = sum(early_counts.values()) or 1
    early_vector = [round(early_counts.get(g, 0) / total_early, 3) for g in valid_genres]
    dominant_early = early_counts.most_common(1)[0][0] if early_counts else "Unknown"
    
    # --- B. 计算 EMA 熵曲线 (1..30) ---
    genre_weights = {g: 0.0 for g in valid_genres}
    entropy_curve = []
    
    for i, curr_g_list in enumerate(genres_seq):
        for g in genre_weights: genre_weights[g] *= (1 - ALPHA)
        valid_curr = [g for g in curr_g_list if g in valid_genres]
        if valid_curr: genre_weights[valid_curr[0]] += ALPHA
            
        total_w = sum(genre_weights.values())
        ent = -sum((w/total_w)*math.log2(w/total_w) for w in genre_weights.values() if w > 0.001) if total_w > 0 else 0
        entropy_curve.append({"n": i + 1, "entropy": round(ent, 3)})
    
    entropy_dict[nconst] = {"actorId": nconst, "curve": entropy_curve[:30]}
    
    # --- C. T=0 对齐检测 ---
    early_set = set(early_genres)
    t0Index = -1
    for i in range(5, len(main_genres)):
        if main_genres[i] != 'Unknown' and main_genres[i] not in early_set:
            t0Index = i + 1 # seqIndex 是 1-based
            break
            
    outcome = "none"
    align_points = []
    covariates = {}
    
    if t0Index != -1 and t0Index + 3 <= film_count:
        real_idx = t0Index - 1
        # 获取 T=0 时刻的协变量
        window_directors = set([str(m.get('director', '')) for m in seq[max(0, real_idx-2):real_idx+3]])
        covariates = {
            "numVotes": int(seq[real_idx]['numVotes']),
            "rating": float(seq[real_idx]['averageRating']),
            "directorHeterogeneity": len(window_directors)
        }
        # 截取 T-3 到 T+5 的局部轨迹
        for i in range(max(0, real_idx - 3), min(film_count, real_idx + 6)):
            tau = (i + 1) - t0Index
            align_points.append({"tau": tau, "entropy": entropy_curve[i]["entropy"]})
            
        # 评判转型结局
        base_ent = entropy_curve[real_idx]["entropy"]
        future_ents = [e["entropy"] for e in entropy_curve[real_idx+1 : real_idx+4]]
        if np.mean(future_ents) >= base_ent * 0.8:
            outcome = "success"
        else:
            outcome = "snapback"
            
    alignment_dict[nconst] = {
        "actorId": nconst, "t0Index": t0Index, "outcome": outcome,
        "points": align_points, "covariatesAtT0": covariates
    }
    
    actors_dict[nconst] = {
        "id": nconst, "name": actor_name, "dominantEarlyGenre": dominant_early,
        "earlyGenreVector": early_vector, "filmCount": film_count,
        "t0Index": t0Index, "outcome": outcome
    }
    
    # --- D. 组装 Films 表 ---
    for film_index, m in enumerate(seq):
        films_list.append({
            "actorId": nconst, "seqIndex": m['seqIndex'],
            "titleId": str(m.get('tconst', 'Unknown')), "title": display_title(m),
            "year": m['startYear'], "genres": m['genres_list'], 
            "dominantGenre": m['genres_list'][0] if m['genres_list'] else "Unknown",
            "rating": float(m['averageRating']), "numVotes": int(m['numVotes']),
            "directorId": str(m.get('director', 'Unknown')),
            "directorName": display_director_name(m),
            "directorHeterogeneity": director_heterogeneity_at(seq, film_index),
        })

print("3. 执行 UMAP 降维与 KMeans 聚类...")
actor_ids = list(actors_dict.keys())
vectors = np.array([actors_dict[aid]["earlyGenreVector"] for aid in actor_ids])

# UMAP 降维 [x, y]
reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, random_state=42)
embeddings = reducer.fit_transform(vectors)

# KMeans 聚类生成 clusterId (划分8个群落)
kmeans = KMeans(n_clusters=8, random_state=42)
clusters = kmeans.fit_predict(embeddings)

for i, aid in enumerate(actor_ids):
    actors_dict[aid]["projection"] = [float(round(embeddings[i][0], 3)), float(round(embeddings[i][1], 3))]
    actors_dict[aid]["clusterId"] = int(clusters[i])
    if aid in alignment_dict:
        alignment_dict[aid]["clusterId"] = int(clusters[i])

print("4. 构建分阶段群落转移矩阵 (Markov)...")
markov_list = []
# 划分阶段逻辑：0-9早期，10-19中期，20+晚期
stages = [(0, 10, 'early'), (10, 20, 'mid'), (20, 999, 'late')]

for c_id in set(clusters):
    cohort_actors = [aid for aid in actor_ids if actors_dict[aid]["clusterId"] == c_id]
    
    for start, end, stg_name in stages:
        trans_counts = np.zeros((len(valid_genres), len(valid_genres)))
        for aid in cohort_actors:
            seq_genres = [f["dominantGenre"] for f in films_list if f["actorId"] == aid]
            stage_seq = seq_genres[start:end]
            
            for i in range(len(stage_seq) - 1):
                g1, g2 = stage_seq[i], stage_seq[i+1]
                if g1 in genre_to_idx and g2 in genre_to_idx:
                    trans_counts[genre_to_idx[g1]][genre_to_idx[g2]] += 1
        
        # 行归一化得到概率矩阵
        row_sums = trans_counts.sum(axis=1, keepdims=True)
        prob_matrix = np.divide(trans_counts, row_sums, out=np.zeros_like(trans_counts), where=row_sums!=0)
        
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
