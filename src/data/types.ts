export type Outcome = 'success' | 'snapback' | 'none';

export type MarkovStage = 'early' | 'mid' | 'late';

export interface Actor {
  id: string;
  name: string;
  dominantEarlyGenre: string;
  earlyGenreVector: number[];
  filmCount: number;
  t0Index: number;
  outcome: Outcome;
  projection: [number, number];
  clusterId: number;
}

export interface Film {
  actorId: string;
  seqIndex: number;
  title: string;
  titleId?: string;
  year: number;
  genres: string[];
  dominantGenre: string;
  rating: number;
  numVotes: number;
  directorId: string;
  directorName?: string;
  directorHeterogeneity: number;
}

export interface EntropyPoint {
  n: number;
  entropy: number;
}

export interface EntropyCurve {
  actorId: string;
  curve: EntropyPoint[];
}

export interface MarkovMatrix {
  cohortId: number;
  stage: MarkovStage;
  genres: string[];
  matrix: number[][];
}

export interface AlignmentPoint {
  tau: number;
  /** EMA 类型熵（视图 B 的交叉参照量；视图 C 不再以此为 y 轴）。 */
  entropy: number;
  /** 类型偏离度 = 1 − cos(earlyGenreVector, 滚动类型向量) ∈ [0,1]，视图 C 的 y 轴。 */
  dist: number;
}

export interface AlignmentCovariatesAtT0 {
  numVotes: number;
  rating: number;
  directorHeterogeneity: number;
}

export interface AlignmentCovariatesMissing {
  numVotes: number | null;
  rating: number | null;
  directorHeterogeneity: number | null;
}

interface AlignmentTrackBase {
  actorId: string;
  t0Index: number;
  points: AlignmentPoint[];
  clusterId: number;
}

export interface AlignmentTrackNone extends AlignmentTrackBase {
  outcome: 'none';
  covariatesAtT0: AlignmentCovariatesMissing;
}

export interface AlignmentTrackPivot extends AlignmentTrackBase {
  outcome: 'success' | 'snapback';
  covariatesAtT0: AlignmentCovariatesAtT0;
}

export type AlignmentTrack = AlignmentTrackNone | AlignmentTrackPivot;

export interface DataBundle {
  genres: string[];
  actors: Actor[];
  films: Film[];
  entropy: EntropyCurve[];
  markov: MarkovMatrix[];
  alignment: AlignmentTrack[];
}

export interface DataIndexes {
  actorsById: Map<string, Actor>;
  filmsByActor: Map<string, Film[]>;
  markovByClusterStage: Map<string, MarkovMatrix>;
  alignmentByActor: Map<string, AlignmentTrack>;
}
