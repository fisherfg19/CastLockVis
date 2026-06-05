import type {
  Actor,
  AlignmentTrack,
  AlignmentTrackNone,
  AlignmentTrackPivot,
  DataBundle,
  DataIndexes,
  EntropyCurve,
  Film,
  MarkovMatrix,
  MarkovStage,
  Outcome,
} from './types';

const DATA_PATHS = {
  genres: 'data/genres.json',
  actors: 'data/actors.json',
  films: 'data/films.json',
  entropy: 'data/entropy.json',
  markov: 'data/markov.json',
  alignment: 'data/alignment.json',
} as const;

const OUTCOME_SET = new Set<Outcome>(['success', 'snapback', 'none']);
const MARKOV_STAGE_SET = new Set<MarkovStage>(['early', 'mid', 'late']);
let dataBundlePromise: Promise<DataBundle> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function createTypeError(resourceName: string, details: string): Error {
  return new Error(`[${resourceName}] shape validation failed: ${details}`);
}

function requireRecord(
  value: unknown,
  resourceName: string,
  details: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw createTypeError(resourceName, details);
  }
  return value;
}

function requireArray<T>(
  value: unknown,
  guard: (entry: unknown) => entry is T,
  resourceName: string,
  details: string,
): T[] {
  if (!Array.isArray(value) || !value.every(guard)) {
    throw createTypeError(resourceName, details);
  }
  return value;
}

async function fetchJson(resourcePath: string): Promise<unknown> {
  const url = `${import.meta.env.BASE_URL}${resourcePath}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${resourcePath}: HTTP ${response.status}`);
  }
  return response.json();
}

function parseActors(raw: unknown): Actor[] {
  const entries = requireArray(raw, isRecord, 'actors.json', 'root is not object[]');

  return entries.map((entry, index) => {
    const actor = requireRecord(entry, 'actors.json', `index ${index} is not an object`);

    const projection = actor.projection;
    if (
      !Array.isArray(projection) ||
      projection.length !== 2 ||
      typeof projection[0] !== 'number' ||
      typeof projection[1] !== 'number'
    ) {
      throw createTypeError('actors.json', `index ${index} has invalid projection`);
    }

    if (
      typeof actor.id !== 'string' ||
      typeof actor.name !== 'string' ||
      typeof actor.dominantEarlyGenre !== 'string' ||
      !isNumberArray(actor.earlyGenreVector) ||
      typeof actor.filmCount !== 'number' ||
      typeof actor.t0Index !== 'number' ||
      typeof actor.clusterId !== 'number' ||
      typeof actor.outcome !== 'string' ||
      !OUTCOME_SET.has(actor.outcome as Outcome)
    ) {
      throw createTypeError('actors.json', `index ${index} has invalid fields`);
    }

    return {
      id: actor.id,
      name: actor.name,
      dominantEarlyGenre: actor.dominantEarlyGenre,
      earlyGenreVector: actor.earlyGenreVector,
      filmCount: actor.filmCount,
      t0Index: actor.t0Index,
      outcome: actor.outcome as Outcome,
      projection: [projection[0], projection[1]],
      clusterId: actor.clusterId,
    };
  });
}

function parseFilms(raw: unknown): Film[] {
  const entries = requireArray(raw, isRecord, 'films.json', 'root is not object[]');

  return entries.map((entry, index) => {
    const film = requireRecord(entry, 'films.json', `index ${index} is not an object`);

    if (
      typeof film.actorId !== 'string' ||
      typeof film.seqIndex !== 'number' ||
      typeof film.title !== 'string' ||
      typeof film.year !== 'number' ||
      !isStringArray(film.genres) ||
      typeof film.dominantGenre !== 'string' ||
      typeof film.rating !== 'number' ||
      typeof film.numVotes !== 'number' ||
      typeof film.directorId !== 'string' ||
      typeof film.directorHeterogeneity !== 'number'
    ) {
      throw createTypeError('films.json', `index ${index} has invalid fields`);
    }

    return {
      actorId: film.actorId,
      seqIndex: film.seqIndex,
      title: film.title,
      titleId: typeof film.titleId === 'string' ? film.titleId : undefined,
      year: film.year,
      genres: film.genres,
      dominantGenre: film.dominantGenre,
      rating: film.rating,
      numVotes: film.numVotes,
      directorId: film.directorId,
      directorName: typeof film.directorName === 'string' ? film.directorName : undefined,
      directorHeterogeneity: film.directorHeterogeneity,
    };
  });
}

function parseEntropy(raw: unknown): EntropyCurve[] {
  const entries = requireArray(raw, isRecord, 'entropy.json', 'root is not object[]');

  return entries.map((entry, index) => {
    const entropy = requireRecord(entry, 'entropy.json', `index ${index} is not an object`);

    if (typeof entropy.actorId !== 'string' || !Array.isArray(entropy.curve)) {
      throw createTypeError('entropy.json', `index ${index} has invalid fields`);
    }

    const curve = entropy.curve.map((point, pointIndex) => {
      const entropyPoint = requireRecord(
        point,
        'entropy.json',
        `index ${index} curve[${pointIndex}] has invalid fields`,
      );
      if (typeof entropyPoint.n !== 'number' || typeof entropyPoint.entropy !== 'number') {
        throw createTypeError(
          'entropy.json',
          `index ${index} curve[${pointIndex}] has invalid fields`,
        );
      }
      return { n: entropyPoint.n, entropy: entropyPoint.entropy };
    });

    return { actorId: entropy.actorId, curve };
  });
}

function parseMarkov(raw: unknown): MarkovMatrix[] {
  const entries = requireArray(raw, isRecord, 'markov.json', 'root is not object[]');

  return entries.map((entry, index) => {
    const markov = requireRecord(entry, 'markov.json', `index ${index} is not an object`);

    if (
      typeof markov.cohortId !== 'number' ||
      typeof markov.stage !== 'string' ||
      !MARKOV_STAGE_SET.has(markov.stage as MarkovStage) ||
      !isStringArray(markov.genres) ||
      !Array.isArray(markov.matrix)
    ) {
      throw createTypeError('markov.json', `index ${index} has invalid fields`);
    }

    const matrix = markov.matrix.map((row, rowIndex) => {
      if (!isNumberArray(row)) {
        throw createTypeError('markov.json', `index ${index} matrix[${rowIndex}] is invalid`);
      }
      return row;
    });

    return {
      cohortId: markov.cohortId,
      stage: markov.stage as MarkovStage,
      genres: markov.genres,
      matrix,
    };
  });
}

function parseAlignment(raw: unknown): AlignmentTrack[] {
  const entries = requireArray(raw, isRecord, 'alignment.json', 'root is not object[]');

  return entries.map((entry, index) => {
    const alignment = requireRecord(entry, 'alignment.json', `index ${index} is not an object`);

    if (
      typeof alignment.actorId !== 'string' ||
      typeof alignment.t0Index !== 'number' ||
      typeof alignment.clusterId !== 'number' ||
      typeof alignment.outcome !== 'string' ||
      !OUTCOME_SET.has(alignment.outcome as Outcome) ||
      !Array.isArray(alignment.points) ||
      !isRecord(alignment.covariatesAtT0)
    ) {
      throw createTypeError('alignment.json', `index ${index} has invalid fields`);
    }

    const outcome = alignment.outcome as Outcome;
    const covariates = alignment.covariatesAtT0 as Record<string, unknown>;
    const numVotes = typeof covariates.numVotes === 'number' ? covariates.numVotes : null;
    const rating = typeof covariates.rating === 'number' ? covariates.rating : null;
    const directorHeterogeneity =
      typeof covariates.directorHeterogeneity === 'number'
        ? covariates.directorHeterogeneity
        : null;
    const hasNumericCovariates =
      numVotes !== null && rating !== null && directorHeterogeneity !== null;

    const points = alignment.points.map((point, pointIndex) => {
      const alignmentPoint = requireRecord(
        point,
        'alignment.json',
        `index ${index} points[${pointIndex}] has invalid fields`,
      );
      if (
        typeof alignmentPoint.tau !== 'number' ||
        typeof alignmentPoint.entropy !== 'number' ||
        typeof alignmentPoint.dist !== 'number'
      ) {
        throw createTypeError(
          'alignment.json',
          `index ${index} points[${pointIndex}] has invalid fields`,
        );
      }
      return {
        tau: alignmentPoint.tau,
        entropy: alignmentPoint.entropy,
        dist: alignmentPoint.dist,
      };
    });

    if (outcome === 'none') {
      // none 轨迹锚在「最大上升候选」(伪 T=0)，仅作淡灰背景上下文：可带 points，但无真 T=0 协变量。
      const emptyCovariates = Object.keys(covariates).length === 0;
      if (!emptyCovariates) {
        throw createTypeError(
          'alignment.json',
          `index ${index} outcome=none expects empty covariatesAtT0`,
        );
      }

      const noneTrack: AlignmentTrackNone = {
        actorId: alignment.actorId,
        t0Index: alignment.t0Index,
        outcome: 'none',
        points,
        covariatesAtT0: {
          numVotes: null,
          rating: null,
          directorHeterogeneity: null,
        },
        clusterId: alignment.clusterId,
      };
      return noneTrack;
    }

    if (!hasNumericCovariates) {
      throw createTypeError(
        'alignment.json',
        `index ${index} outcome=${outcome} requires numeric covariatesAtT0`,
      );
    }

    const pivotTrack: AlignmentTrackPivot = {
      actorId: alignment.actorId,
      t0Index: alignment.t0Index,
      outcome,
      points,
      covariatesAtT0: {
        numVotes,
        rating,
        directorHeterogeneity,
      },
      clusterId: alignment.clusterId,
    };
    return pivotTrack;
  });
}

function parseGenres(raw: unknown): string[] {
  return requireArray(
    raw,
    (entry): entry is string => typeof entry === 'string',
    'genres.json',
    'root is not string[]',
  );
}

export function buildIndexes(bundle: DataBundle): DataIndexes {
  const actorsById = new Map(bundle.actors.map((actor) => [actor.id, actor]));
  const filmsByActor = new Map<string, Film[]>();
  const markovByClusterStage = new Map<string, MarkovMatrix>();
  const alignmentByActor = new Map<string, AlignmentTrack>();

  for (const film of bundle.films) {
    const current = filmsByActor.get(film.actorId);
    if (current) {
      current.push(film);
    } else {
      filmsByActor.set(film.actorId, [film]);
    }
  }

  for (const films of filmsByActor.values()) {
    films.sort((left, right) => left.seqIndex - right.seqIndex);
  }

  for (const entry of bundle.markov) {
    markovByClusterStage.set(`${entry.cohortId}:${entry.stage}`, entry);
  }

  for (const track of bundle.alignment) {
    alignmentByActor.set(track.actorId, track);
  }

  return { actorsById, filmsByActor, markovByClusterStage, alignmentByActor };
}

async function loadDataBundleInternal(): Promise<DataBundle> {
  const [rawGenres, rawActors, rawFilms, rawEntropy, rawMarkov, rawAlignment] = await Promise.all([
    fetchJson(DATA_PATHS.genres),
    fetchJson(DATA_PATHS.actors),
    fetchJson(DATA_PATHS.films),
    fetchJson(DATA_PATHS.entropy),
    fetchJson(DATA_PATHS.markov),
    fetchJson(DATA_PATHS.alignment),
  ]);

  return {
    genres: parseGenres(rawGenres),
    actors: parseActors(rawActors),
    films: parseFilms(rawFilms),
    entropy: parseEntropy(rawEntropy),
    markov: parseMarkov(rawMarkov),
    alignment: parseAlignment(rawAlignment),
  };
}

export async function loadDataBundle(): Promise<DataBundle> {
  if (dataBundlePromise === null) {
    dataBundlePromise = loadDataBundleInternal().catch((error) => {
      dataBundlePromise = null;
      throw error;
    });
  }
  return dataBundlePromise;
}
