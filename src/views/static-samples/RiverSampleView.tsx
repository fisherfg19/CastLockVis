import { useMemo } from 'react';
import { averageEntropyCurves } from '../../lib/aggregate';
import type { DataBundle, DataIndexes, EntropyCurve, EntropyPoint } from '../../data/types';
import { buildGenreTokenLookup, linearScale, pathFromBands, polylinePath } from './chartUtils';

interface RiverSampleViewProps {
  bundle: DataBundle;
  indexes: DataIndexes;
  cohortActorIds: string[];
  isCohortMode: boolean;
  selectedActorId: string | null;
  selectedFilmIndex: number | null;
  onSpikeSelect: (actorId: string, filmIndex: number) => void;
}

interface SeriesBand {
  key: string;
  tokenIndex: number;
  points: Array<{ x: number; y0: number; y1: number }>;
}

const WIDTH = 620;
const HEIGHT = 320;
const MARGIN = { top: 16, right: 16, bottom: 22, left: 32 };
const WINDOW_SIZE = 3;
const MAX_COHORT_N = 30;
const CORE_GENRE_COUNT = 6;

export function RiverSampleView({
  bundle,
  indexes,
  cohortActorIds,
  isCohortMode,
  selectedActorId,
  selectedFilmIndex,
  onSpikeSelect,
}: RiverSampleViewProps) {
  const chart = useMemo(() => {
    if (isCohortMode) {
      return buildCohortChart(bundle, indexes, cohortActorIds);
    }
    return buildSingleActorChart(bundle, indexes);
  }, [bundle, cohortActorIds, indexes, isCohortMode]);

  if (!chart) {
    return (
      <div className="sample-chart__empty">
        {isCohortMode
          ? '当前选区缺少 cohort 数据，无法渲染平均河流。'
          : '样例演员缺少 films/entropy 数据，无法渲染。'}
      </div>
    );
  }

  return (
    <figure className="sample-chart sample-chart--river">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Career River static sample">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="sample-bg" rx={8} />

        <line
          x1={MARGIN.left}
          y1={chart.streamBottom}
          x2={WIDTH - MARGIN.right}
          y2={chart.streamBottom}
          className="sample-axis"
        />
        <line
          x1={MARGIN.left}
          y1={chart.ratingBottom}
          x2={WIDTH - MARGIN.right}
          y2={chart.ratingBottom}
          className="sample-axis sample-axis--subtle"
        />

        {chart.series.map((band) => (
          <path
            key={band.key}
            d={pathFromBands(band.points)}
            className="sample-river-band"
            style={{
              fill: `var(--genre-${band.tokenIndex})`,
              stroke: `var(--genre-${band.tokenIndex})`,
              strokeWidth: 0.6,
            }}
          />
        ))}

        <path d={chart.entropyPath} className="sample-entropy-line" />

        {chart.dots.map(({ id, x, y, r }) => (
          <circle key={id} cx={x} cy={y} r={r} className="sample-film-dot" />
        ))}

        {chart.spikes.map(({ id, actorId, seqIndex, x, y }) => {
          const isActive = selectedActorId === actorId && selectedFilmIndex === seqIndex;
          return (
            <g
              key={`peak-${id}`}
              className="sample-spike-hit"
              role="button"
              aria-label={`Select entropy spike N${seqIndex}`}
              tabIndex={0}
              onClick={() => onSpikeSelect(actorId, seqIndex)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSpikeSelect(actorId, seqIndex);
                }
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={7.5}
                className={`sample-peak-ring ${isActive ? 'sample-peak-ring--active' : ''}`}
              />
              <circle cx={x} cy={y} r={2.6} className="sample-peak-core" />
              <text x={x} y={y - 11} className="sample-peak-label" textAnchor="middle">
                N{seqIndex}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption className="sample-chart__caption">{chart.caption}</figcaption>
    </figure>
  );
}

interface RiverDot {
  id: string;
  seqIndex: number;
  x: number;
  y: number;
  r: number;
  rating: number;
}

interface RiverHighlight {
  id: string;
  actorId: string;
  seqIndex: number;
  x: number;
  y: number;
}

interface RiverChart {
  maxN: number;
  streamTop: number;
  streamBottom: number;
  ratingTop: number;
  ratingBottom: number;
  series: SeriesBand[];
  entropyPath: string;
  dots: RiverDot[];
  spikes: RiverHighlight[];
  caption: string;
}

function getChartLayout() {
  return {
    innerLeft: MARGIN.left,
    innerRight: WIDTH - MARGIN.right,
    streamTop: MARGIN.top + 8,
    streamBottom: HEIGHT - 114,
    ratingTop: HEIGHT - 92,
    ratingBottom: HEIGHT - 30,
  };
}

function buildSingleActorChart(bundle: DataBundle, indexes: DataIndexes): RiverChart | null {
  const actorsByFilmCount = [...bundle.actors].sort(
    (left, right) => right.filmCount - left.filmCount,
  );
  const sampleActor =
    actorsByFilmCount.find((actor) => actor.id === 'nm0000129') ??
    actorsByFilmCount.find((actor) => actor.filmCount >= 18) ??
    actorsByFilmCount[0];

  if (!sampleActor) {
    return null;
  }

  const films = indexes.filmsByActor.get(sampleActor.id) ?? [];
  const entropy = bundle.entropy.find((entry) => entry.actorId === sampleActor.id);
  if (films.length === 0 || !entropy || entropy.curve.length === 0) {
    return null;
  }

  const maxN = films[films.length - 1].seqIndex;
  const { innerLeft, innerRight, streamTop, streamBottom, ratingTop, ratingBottom } =
    getChartLayout();

  const genreTokenLookup = buildGenreTokenLookup(bundle.genres);

  const dominantCounts = new Map<string, number>();
  films.forEach((film) => {
    dominantCounts.set(film.dominantGenre, (dominantCounts.get(film.dominantGenre) ?? 0) + 1);
  });

  const coreGenres = [...dominantCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, CORE_GENRE_COUNT)
    .map(([genre]) => genre);

  const seriesKeys = [...coreGenres, 'Other'];
  const series = new Map<string, SeriesBand>(
    seriesKeys.map((key) => [
      key,
      {
        key,
        tokenIndex: key === 'Other' ? 10 : (genreTokenLookup.get(key) ?? 1),
        points: [],
      },
    ]),
  );

  for (let n = 1; n <= maxN; n += 1) {
    const currentFilms = films.slice(0, n);
    const windowFilms = currentFilms.slice(-WINDOW_SIZE);
    const windowTotal = windowFilms.length || 1;

    const proportions = new Map<string, number>();
    coreGenres.forEach((genre) => proportions.set(genre, 0));

    let otherCount = 0;
    windowFilms.forEach((film) => {
      if (proportions.has(film.dominantGenre)) {
        proportions.set(film.dominantGenre, (proportions.get(film.dominantGenre) ?? 0) + 1);
      } else {
        otherCount += 1;
      }
    });

    const x = linearScale(n, 1, maxN, innerLeft, innerRight);
    let cumulative = 0;

    for (const key of seriesKeys) {
      const value =
        key === 'Other' ? otherCount / windowTotal : (proportions.get(key) ?? 0) / windowTotal;
      const y0 = linearScale(cumulative, 0, 1, streamBottom, streamTop);
      cumulative += value;
      const y1 = linearScale(cumulative, 0, 1, streamBottom, streamTop);
      series.get(key)?.points.push({ x, y0, y1 });
    }
  }

  const entropyPoints = entropy.curve.filter((point) => point.n <= maxN);
  const maxEntropy = Math.max(...entropyPoints.map((point) => point.entropy), 0.01);
  const entropyPath = polylinePath(
    entropyPoints.map((point) => ({
      x: linearScale(point.n, 1, maxN, innerLeft, innerRight),
      y: linearScale(point.entropy, 0, maxEntropy, streamBottom, streamTop),
    })),
  );
  const spikes = pickEntropySpikes(entropyPoints, sampleActor.id, (point) => ({
    x: linearScale(point.n, 1, maxN, innerLeft, innerRight),
    y: linearScale(point.entropy, 0, maxEntropy, streamBottom, streamTop),
  }));

  const voteValues = films.map((film) => film.numVotes);
  const voteMin = Math.min(...voteValues);
  const voteMax = Math.max(...voteValues);

  const dots = films.map((film) => {
    const voteRatio = voteMax === voteMin ? 0.5 : (film.numVotes - voteMin) / (voteMax - voteMin);
    return {
      id: `${film.actorId}-${film.seqIndex}`,
      seqIndex: film.seqIndex,
      x: linearScale(film.seqIndex, 1, maxN, innerLeft, innerRight),
      y: linearScale(film.rating, 0, 10, ratingBottom, ratingTop),
      r: 2 + Math.sqrt(voteRatio) * 5,
      rating: film.rating,
    };
  });

  return {
    maxN,
    streamTop,
    streamBottom,
    ratingTop,
    ratingBottom,
    series: [...series.values()],
    entropyPath,
    dots,
    spikes,
    caption:
      spikes.length > 0
        ? `${sampleActor.name} · films=${films.length} · entropy local peaks clickable`
        : `${sampleActor.name} · films=${films.length} · no local entropy peak`,
  };
}

function buildCohortChart(
  bundle: DataBundle,
  indexes: DataIndexes,
  cohortActorIds: string[],
): RiverChart | null {
  const actorSet = new Set(cohortActorIds);
  const cohortFilmsByActor = cohortActorIds
    .map((actorId) => indexes.filmsByActor.get(actorId) ?? [])
    .filter((films) => films.length > 0);

  if (actorSet.size === 0 || cohortFilmsByActor.length === 0) {
    return null;
  }

  const entropyCurves = bundle.entropy.filter((curve) => actorSet.has(curve.actorId));
  const averageEntropy = averageEntropyCurves(entropyCurves).slice(0, MAX_COHORT_N);
  if (averageEntropy.length === 0) {
    return null;
  }

  const maxFilmN = Math.max(...cohortFilmsByActor.map((films) => films[films.length - 1].seqIndex));
  const maxN = Math.min(MAX_COHORT_N, maxFilmN, averageEntropy[averageEntropy.length - 1].n);
  if (maxN < 1) {
    return null;
  }

  const { innerLeft, innerRight, streamTop, streamBottom, ratingTop, ratingBottom } =
    getChartLayout();
  const genreTokenLookup = buildGenreTokenLookup(bundle.genres);
  const dominantCounts = new Map<string, number>();

  for (const films of cohortFilmsByActor) {
    for (const film of films.slice(0, maxN)) {
      dominantCounts.set(film.dominantGenre, (dominantCounts.get(film.dominantGenre) ?? 0) + 1);
    }
  }

  const coreGenres = [...dominantCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, CORE_GENRE_COUNT)
    .map(([genre]) => genre);
  const coreGenreSet = new Set(coreGenres);

  const seriesKeys = [...coreGenres, 'Other'];
  const series = new Map<string, SeriesBand>(
    seriesKeys.map((key) => [
      key,
      {
        key,
        tokenIndex: key === 'Other' ? 10 : (genreTokenLookup.get(key) ?? 1),
        points: [],
      },
    ]),
  );
  const averageDots: RiverDot[] = [];

  for (let n = 1; n <= maxN; n += 1) {
    const totals = new Map<string, number>(seriesKeys.map((key) => [key, 0]));
    const ratings: number[] = [];
    const votes: number[] = [];
    let actorCountAtN = 0;

    for (const films of cohortFilmsByActor) {
      if (films.length < n) {
        continue;
      }
      actorCountAtN += 1;
      const windowFilms = films.slice(Math.max(0, n - WINDOW_SIZE), n);
      const windowTotal = windowFilms.length || 1;
      let otherCount = 0;

      for (const film of windowFilms) {
        if (coreGenreSet.has(film.dominantGenre)) {
          totals.set(film.dominantGenre, (totals.get(film.dominantGenre) ?? 0) + 1 / windowTotal);
        } else {
          otherCount += 1;
        }
      }
      totals.set('Other', (totals.get('Other') ?? 0) + otherCount / windowTotal);

      const filmAtN = films[n - 1];
      ratings.push(filmAtN.rating);
      votes.push(filmAtN.numVotes);
    }

    if (actorCountAtN === 0) {
      continue;
    }

    const x = linearScale(n, 1, maxN, innerLeft, innerRight);
    let cumulative = 0;

    for (const key of seriesKeys) {
      const value = (totals.get(key) ?? 0) / actorCountAtN;
      const y0 = linearScale(cumulative, 0, 1, streamBottom, streamTop);
      cumulative += value;
      const y1 = linearScale(cumulative, 0, 1, streamBottom, streamTop);
      series.get(key)?.points.push({ x, y0, y1 });
    }

    const meanRating = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    const meanVotes = votes.reduce((sum, value) => sum + value, 0) / votes.length;
    averageDots.push({
      id: `cohort-${n}`,
      seqIndex: n,
      x,
      y: linearScale(meanRating, 0, 10, ratingBottom, ratingTop),
      r: Math.max(2.2, Math.min(6.5, 2 + Math.sqrt(meanVotes / 100000))),
      rating: meanRating,
    });
  }

  const maxEntropy = Math.max(...averageEntropy.map((point) => point.entropy), 0.01);
  const entropyPath = polylinePath(
    averageEntropy
      .filter((point) => point.n <= maxN)
      .map((point) => ({
        x: linearScale(point.n, 1, maxN, innerLeft, innerRight),
        y: linearScale(point.entropy, 0, maxEntropy, streamBottom, streamTop),
      })),
  );
  const spikes = pickEntropySpikes(
    averageEntropy.filter((point) => point.n <= maxN),
    null,
    (point) => ({
      x: linearScale(point.n, 1, maxN, innerLeft, innerRight),
      y: linearScale(point.entropy, 0, maxEntropy, streamBottom, streamTop),
    }),
    (point) => pickRepresentativeSpikeActor(bundle, indexes, cohortActorIds, point.n),
  );

  return {
    maxN,
    streamTop,
    streamBottom,
    ratingTop,
    ratingBottom,
    series: [...series.values()],
    entropyPath,
    dots: averageDots,
    spikes,
    caption:
      spikes.length > 0
        ? `cohort average mode · actors=${actorSet.size} · local peaks choose representative actor`
        : `cohort average mode · actors=${actorSet.size} · no local entropy peak`,
  };
}

function pickEntropySpikes(
  points: EntropyPoint[],
  actorId: string | null,
  positionForPoint: (point: EntropyPoint) => { x: number; y: number },
  actorForPoint?: (point: EntropyPoint) => string | null,
): RiverHighlight[] {
  if (points.length === 0) {
    return [];
  }

  const candidates = points
    .map((point, index) => {
      const previous = points[index - 1];
      const next = points[index + 1];
      if (!previous || !next) {
        return null;
      }

      const isLocalPeak = point.entropy > previous.entropy && point.entropy >= next.entropy;
      if (!isLocalPeak) {
        return null;
      }

      return {
        point,
        prominence: point.entropy - Math.max(previous.entropy, next.entropy),
      };
    })
    .filter(
      (candidate): candidate is { point: EntropyPoint; prominence: number } => candidate !== null,
    )
    .filter((candidate) => candidate.prominence > 0)
    .sort((left, right) => right.prominence - left.prominence)
    .slice(0, 3);

  return candidates
    .map(({ point }) => {
      const resolvedActorId = actorForPoint?.(point) ?? actorId;
      if (!resolvedActorId) {
        return null;
      }
      const { x, y } = positionForPoint(point);
      return {
        id: `${resolvedActorId}-${point.n}`,
        actorId: resolvedActorId,
        seqIndex: point.n,
        x,
        y,
      };
    })
    .filter((entry): entry is RiverHighlight => entry !== null);
}

function pickRepresentativeSpikeActor(
  bundle: DataBundle,
  indexes: DataIndexes,
  cohortActorIds: string[],
  seqIndex: number,
): string | null {
  let bestActorId: string | null = null;
  let bestProminence = Number.NEGATIVE_INFINITY;

  for (const actorId of cohortActorIds) {
    const films = indexes.filmsByActor.get(actorId) ?? [];
    if (films.length < seqIndex) {
      continue;
    }

    const curve = bundle.entropy.find((entry) => entry.actorId === actorId);
    if (!curve) {
      continue;
    }

    const prominence = entropyPeakProminenceAt(curve, seqIndex);
    if (prominence > bestProminence) {
      bestProminence = prominence;
      bestActorId = actorId;
    }
  }

  return bestActorId;
}

function entropyPeakProminenceAt(curve: EntropyCurve, seqIndex: number): number {
  const current = curve.curve.find((point) => point.n === seqIndex)?.entropy;
  const previous = curve.curve.find((point) => point.n === seqIndex - 1)?.entropy;
  const next = curve.curve.find((point) => point.n === seqIndex + 1)?.entropy;
  if (current === undefined || previous === undefined || next === undefined) {
    return Number.NEGATIVE_INFINITY;
  }
  if (current <= previous || current < next) {
    return Number.NEGATIVE_INFINITY;
  }
  return current - Math.max(previous, next);
}
