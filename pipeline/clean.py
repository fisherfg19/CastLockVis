import pandas as pd
import numpy as np
import os

# 配置文件路径
# 原始数据集需要自行下载在imdb_data目录下，包含以下文件：
# - title.basics.tsv.gz
# - title.ratings.tsv.gz
# - title.crew.tsv.gz
# - title.principals.tsv.gz
# - name.basics.tsv.gz
DATA_DIR = './imdb_data/'
OUTPUT_CSV = './imdb_cleaned_flat.csv'

print("1. 正在读取并清洗 title.basics (提取电影元数据)...")
df_basics = pd.read_csv(
    os.path.join(DATA_DIR, 'title.basics.tsv.gz'), 
    sep='\t', 
    na_values='\\N',
    usecols=['tconst', 'primaryTitle', 'titleType', 'startYear', 'genres']
)
# 核心过滤：只保留“电影”，剔除无类型的脏数据，剔除缺失年份的数据
df_movies = df_basics[
    (df_basics['titleType'] == 'movie') & 
    (df_basics['genres'].notna()) & 
    (df_basics['startYear'].notna())
].copy()
del df_basics  # 及时释放内存

print("2. 正在读取并过滤 title.ratings (引入工业筛选门槛)...")
df_ratings = pd.read_csv(
    os.path.join(DATA_DIR, 'title.ratings.tsv.gz'), 
    sep='\t', 
    na_values='\\N'
)
# 核心过滤：设定 5000 票的热度门槛，专注主流工业生态
df_ratings = df_ratings[df_ratings['numVotes'] > 5000]

# 将电影基础信息与评分做内连接，进一步瘦身有效电影池
df_valid_movies = pd.merge(df_movies, df_ratings, on='tconst', how='inner')
valid_movie_ids = set(df_valid_movies['tconst'])
del df_movies, df_ratings

print("3. 正在读取 title.crew (提取电影导演网络)...")
df_crew = pd.read_csv(
    os.path.join(DATA_DIR, 'title.crew.tsv.gz'), 
    sep='\t', 
    na_values='\\N',
    usecols=['tconst', 'directors']
)
# 仅保留有效电影池内的记录，并重命名以对接下游
df_crew = df_crew[df_crew['tconst'].isin(valid_movie_ids)].copy()
df_crew.rename(columns={'directors': 'director'}, inplace=True)

print("4. 正在读取并清洗 title.principals (构建演员与作品映射)...")
df_principals = pd.read_csv(
    os.path.join(DATA_DIR, 'title.principals.tsv.gz'), 
    sep='\t', 
    na_values='\\N',
    usecols=['tconst', 'nconst', 'ordering', 'category']
)
# 核心过滤：只保留前四番位的主演/女主，且必须在我们清洗好的有效电影池中
df_actors = df_principals[
    (df_principals['category'].isin(['actor', 'actress'])) & 
    (df_principals['ordering'] <= 4) & 
    (df_principals['tconst'].isin(valid_movie_ids))
].copy()
del df_principals

print("5. 读取 name.basics (获取演员姓名与出生年份)...")
valid_director_ids = {
    director_id
    for directors in df_crew['director'].dropna()
    for director_id in str(directors).split(',')
    if director_id
}
valid_actor_ids = set(df_actors['nconst'])
df_names = pd.read_csv(
    os.path.join(DATA_DIR, 'name.basics.tsv.gz'), 
    sep='\t', 
    na_values='\\N',
    usecols=['nconst', 'primaryName', 'birthYear']
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

print("6. 开始合并：构建演员职业生涯多维展平表...")
# 依次将评分表、姓名年龄表、导演表 Join 起来
df_master = pd.merge(df_actors, df_valid_movies, on='tconst', how='left')
df_master = pd.merge(df_master, df_actor_names, on='nconst', how='left')
df_master = pd.merge(df_master, df_crew, on='tconst', how='left')

# 按演员分组，并在组内按电影发行年份进行升序排序，保证时序严格正确
df_master = df_master.sort_values(by=['nconst', 'startYear'])

print("7. 执行生涯厚度过滤并落盘...")
# 核心过滤：只保留职业生涯接拍过 6 部以上有效电影的活跃演员
actor_counts = df_master['nconst'].value_counts()
active_actors = actor_counts[actor_counts >= 6].index
df_final = df_master[df_master['nconst'].isin(active_actors)].copy()

# 将清洗后的展平数据直接存入本地磁盘
df_final.to_csv(OUTPUT_CSV, index=False, encoding='utf-8')

print("\n" + "="*50)
print("【数据清洗与实体提取完美落盘】")
print(f"📁 输出文件路径: {OUTPUT_CSV}")
print(f"📊 有效时序触点 (演员-电影连接数): {len(df_final):,} 条")
print(f"👤 最终入选系统的有效活跃演员数: {df_final['nconst'].nunique():,} 人")
print("="*50)
