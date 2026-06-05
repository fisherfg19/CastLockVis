"""专家知识驱动的数据清洗（逐步演进版）。

本脚本是 clean.py 的演进替代：在保持产出 CSV **schema 完全一致** 的前提下，
逐步引入关于电影工业的领域专家知识，剔除会污染聚类与时序分析的噪声。
每完成一步即可运行 `python pipeline/pipeline_json.py` 复算 public/data/*.json 检验效果。

产出列（与 clean.py 一致，供 pipeline_json.py 按列名消费）：
    tconst, ordering, nconst, category, titleType, startYear,
    primaryTitle, genres, averageRating, numVotes, primaryName, birthYear, director

== 已实现的专家知识步骤 ==
[Step 1] 当代好莱坞（New Hollywood）框定：
    1. 影片选取范围 = 1967 年（含）之后、且在美国制作/发行的电影
       （以 title.akas 中 region=='US' 的别名记录判定美国发行）。
    2. 直接删除 6 个类型标签 [Biography, History, War, Sport, Family, Animation]：
       它们独立于好莱坞类型学分类，极易成为聚类噪声。仅在某片去除这些标签后
       不再剩任何类型时，才连片一并丢弃。
    3. 工业热度门槛下调至 numVotes > 2000（原 5000），保护当年被类型粉丝
       积极消费、今天却因平庸而无人问津的小众工业产品。

[Step 2] 特征工程修正（不在本清洗脚本，见 pipeline/pipeline_json_expert.py）：
    铲除原管线对 `genres[0]`（IMDb 字段恰为字母序、非主次）的依赖，改用「方案 C+A」：
    IDF 加权 15 维软向量聚类、熵按片内标签 idf 分摊、t0 改「早期未见+高 idf 类型」判据、
    dominantGenre 降级为 IDF-argmax 标签、Markov 改 M2 软转移。
    本清洗脚本产出的 CSV schema **不受 Step 2 影响**（仍存原始 genres 标签列）。
"""

import os

import pandas as pd

# 路径基于脚本所在目录解析，使脚本不受调用时工作目录影响
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(SCRIPT_DIR, 'imdb_data')
# 与 pipeline_json.py 的 INPUT_CSV（工作目录下的 imdb_cleaned_flat.csv）对接：
# 落盘到仓库根目录，便于从仓库根运行 `python pipeline/pipeline_json.py`。
OUTPUT_CSV = os.path.join(REPO_ROOT, 'imdb_cleaned_flat.csv')

# ── Step 1 专家知识参数 ────────────────────────────────────────────────
MIN_START_YEAR = 1967  # 新好莱坞起点（《邦妮与克莱德》《毕业生》），含 1967
US_REGION = 'US'       # title.akas.region 中的美国发行标记
MIN_NUM_VOTES = 2000   # 工业热度门槛（原 5000 下调，保护小众工业产品）
# 独立于好莱坞类型学、易成聚类噪声的标签，直接从类型向量中剔除
BANNED_GENRES = {'Biography', 'History', 'War', 'Sport', 'Family', 'Animation'}


def _path(name):
    return os.path.join(DATA_DIR, name)


print("1. 正在读取并清洗 title.basics (提取电影元数据)...")
df_basics = pd.read_csv(
    _path('title.basics.tsv.gz'),
    sep='\t',
    na_values='\\N',
    usecols=['tconst', 'primaryTitle', 'titleType', 'startYear', 'genres'],
)
# 核心过滤：只保留“电影”，剔除无类型、无年份的脏数据
df_movies = df_basics[
    (df_basics['titleType'] == 'movie')
    & (df_basics['genres'].notna())
    & (df_basics['startYear'].notna())
].copy()
del df_basics  # 及时释放内存

# [Step 1.1a] 年份框定：仅保留 1967 年（含）之后的影片
df_movies['startYear'] = pd.to_numeric(df_movies['startYear'], errors='coerce')
df_movies = df_movies[df_movies['startYear'] >= MIN_START_YEAR].copy()
print(f"   · 1967 年及以后的电影：{len(df_movies):,} 部")

# [Step 1.2] 直接删除 6 个噪声类型标签；去除后无类型残留的影片一并丢弃
def _strip_banned(genre_str):
    kept = [g for g in str(genre_str).split(',') if g and g not in BANNED_GENRES]
    return ','.join(kept) if kept else None


df_movies['genres'] = df_movies['genres'].apply(_strip_banned)
before_genre = len(df_movies)
df_movies = df_movies[df_movies['genres'].notna()].copy()
print(
    f"   · 删除 {sorted(BANNED_GENRES)} 后，"
    f"因无剩余类型而丢弃 {before_genre - len(df_movies):,} 部，"
    f"剩余 {len(df_movies):,} 部"
)

print("2. 正在读取 title.akas (判定美国制作/发行)...")
# [Step 1.1b] 美国发行框定：只保留在 title.akas 中存在 region=='US' 别名的影片
df_akas = pd.read_csv(
    _path('title.akas.tsv.gz'),
    sep='\t',
    na_values='\\N',
    usecols=['titleId', 'region'],
    dtype={'titleId': 'string', 'region': 'string'},
)
us_title_ids = set(df_akas.loc[df_akas['region'] == US_REGION, 'titleId'])
del df_akas
before_us = len(df_movies)
df_movies = df_movies[df_movies['tconst'].isin(us_title_ids)].copy()
print(
    f"   · 美国发行影片：保留 {len(df_movies):,} 部"
    f"（剔除非美国发行 {before_us - len(df_movies):,} 部）"
)

print("3. 正在读取并过滤 title.ratings (引入工业筛选门槛)...")
df_ratings = pd.read_csv(
    _path('title.ratings.tsv.gz'),
    sep='\t',
    na_values='\\N',
)
# [Step 1.3] 工业热度门槛下调至 2000 票
df_ratings = df_ratings[df_ratings['numVotes'] > MIN_NUM_VOTES]

# 将电影基础信息与评分做内连接，进一步瘦身有效电影池
df_valid_movies = pd.merge(df_movies, df_ratings, on='tconst', how='inner')
valid_movie_ids = set(df_valid_movies['tconst'])
del df_movies, df_ratings
print(f"   · 通过 numVotes > {MIN_NUM_VOTES} 的有效电影池：{len(valid_movie_ids):,} 部")

print("4. 正在读取 title.crew (提取电影导演网络)...")
df_crew = pd.read_csv(
    _path('title.crew.tsv.gz'),
    sep='\t',
    na_values='\\N',
    usecols=['tconst', 'directors'],
)
# 仅保留有效电影池内的记录，并重命名以对接下游
df_crew = df_crew[df_crew['tconst'].isin(valid_movie_ids)].copy()
df_crew.rename(columns={'directors': 'director'}, inplace=True)

print("5. 正在读取并清洗 title.principals (构建演员与作品映射)...")
df_principals = pd.read_csv(
    _path('title.principals.tsv.gz'),
    sep='\t',
    na_values='\\N',
    usecols=['tconst', 'nconst', 'ordering', 'category'],
)
# 核心过滤：只保留前四番位的主演/女主，且必须在我们清洗好的有效电影池中
df_actors = df_principals[
    (df_principals['category'].isin(['actor', 'actress']))
    & (df_principals['ordering'] <= 4)
    & (df_principals['tconst'].isin(valid_movie_ids))
].copy()
del df_principals

print("6. 读取 name.basics (获取演员姓名、导演姓名与出生年份)...")
valid_director_ids = {
    director_id
    for directors in df_crew['director'].dropna()
    for director_id in str(directors).split(',')
    if director_id
}
valid_actor_ids = set(df_actors['nconst'])
df_names = pd.read_csv(
    _path('name.basics.tsv.gz'),
    sep='\t',
    na_values='\\N',
    usecols=['nconst', 'primaryName', 'birthYear'],
)
# 提取参与过有效电影的演员名和导演名
df_names = df_names[df_names['nconst'].isin(valid_actor_ids | valid_director_ids)]
director_name_by_id = df_names.set_index('nconst')['primaryName'].dropna().to_dict()
df_actor_names = df_names[df_names['nconst'].isin(valid_actor_ids)].copy()


def display_director_names(directors):
    if pd.isna(directors):
        return 'Unknown'
    names = [
        director_name_by_id.get(director_id, director_id)
        for director_id in str(directors).split(',')
        if director_id
    ]
    return ', '.join(names) if names else 'Unknown'


df_crew['directorName'] = df_crew['director'].apply(display_director_names)

print("7. 开始合并：构建演员职业生涯多维展平表...")
# 依次将评分表、姓名年龄表、导演表 Join 起来
df_master = pd.merge(df_actors, df_valid_movies, on='tconst', how='left')
df_master = pd.merge(df_master, df_actor_names, on='nconst', how='left')
df_master = pd.merge(df_master, df_crew, on='tconst', how='left')

# 按演员分组，并在组内按电影发行年份升序排序，保证时序严格正确
df_master = df_master.sort_values(by=['nconst', 'startYear'])

print("8. 执行生涯厚度过滤并落盘...")
# 核心过滤：只保留职业生涯接拍过 6 部以上有效电影的活跃演员
actor_counts = df_master['nconst'].value_counts()
active_actors = actor_counts[actor_counts >= 6].index
df_final = df_master[df_master['nconst'].isin(active_actors)].copy()

# 将清洗后的展平数据直接存入本地磁盘
df_final.to_csv(OUTPUT_CSV, index=False, encoding='utf-8')

print("\n" + "=" * 50)
print("【Step 1 · 当代好莱坞专家清洗落盘】")
print(f"📁 输出文件路径: {OUTPUT_CSV}")
print(f"📊 有效时序触点 (演员-电影连接数): {len(df_final):,} 条")
print(f"👤 最终入选系统的有效活跃演员数: {df_final['nconst'].nunique():,} 人")
print("=" * 50)
