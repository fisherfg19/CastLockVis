import { useMemo } from 'react';
import type { AlignmentTrack } from '../../data/types';
import { linearScale, polylinePath } from './chartUtils';

interface AlignmentSampleViewProps {
  tracks: AlignmentTrack[];
  selectedActorId: string | null;
  selectedFilmIndex: number | null;
}

const WIDTH = 620;
const HEIGHT = 320;
const MARGIN = { top: 18, right: 20, bottom: 30, left: 34 };

export function AlignmentSampleView({
  tracks,
  selectedActorId,
  selectedFilmIndex,
}: AlignmentSampleViewProps) {
  const chart = useMemo(() => {
    const pivotTracks = tracks.filter(
      (track) => track.outcome !== 'none' && track.points.length > 0,
    );
    if (pivotTracks.length === 0) {
      return null;
    }

    const taus = pivotTracks.flatMap((track) => track.points.map((point) => point.tau));
    const entropies = pivotTracks.flatMap((track) => track.points.map((point) => point.entropy));

    const tauMin = Math.min(...taus);
    const tauMax = Math.max(...taus);
    const entropyMin = Math.min(...entropies);
    const entropyMax = Math.max(...entropies);

    const x = (tau: number) => linearScale(tau, tauMin, tauMax, MARGIN.left, WIDTH - MARGIN.right);
    const y = (entropy: number) =>
      linearScale(entropy, entropyMin, entropyMax, HEIGHT - MARGIN.bottom, MARGIN.top);

    const hasSelection = selectedActorId !== null || selectedFilmIndex !== null;
    const lineItems = pivotTracks
      .map((track) => {
        const isSelectedActor = selectedActorId === track.actorId;
        const isPeer =
          selectedFilmIndex !== null &&
          track.t0Index === selectedFilmIndex &&
          track.actorId !== selectedActorId;
        return {
          id: `${track.actorId}-${track.outcome}`,
          actorId: track.actorId,
          t0Index: track.t0Index,
          outcome: track.outcome,
          isSelectedActor,
          isPeer,
          isMuted: hasSelection && !isSelectedActor && !isPeer,
          path: polylinePath(
            track.points.map((point) => ({ x: x(point.tau), y: y(point.entropy) })),
          ),
        };
      })
      .sort((left, right) => {
        const rank = (item: { isSelectedActor: boolean; isPeer: boolean }) => {
          if (item.isSelectedActor) {
            return 2;
          }
          if (item.isPeer) {
            return 1;
          }
          return 0;
        };
        return rank(left) - rank(right);
      });

    const summary = summarizeByOutcome(pivotTracks);
    const t0x = x(0);
    const xTicks = buildLinearTicks(tauMin, tauMax, 9).map((value) => ({
      value,
      x: x(value),
    }));
    const yTicks = buildLinearTicks(entropyMin, entropyMax, 6).map((value) => ({
      value,
      y: y(value),
    }));

    return {
      tauMin,
      tauMax,
      lineItems,
      summary,
      t0x,
      xTicks,
      yTicks,
      selectedActorPresent: lineItems.some((item) => item.isSelectedActor),
      peerCount: lineItems.filter((item) => item.isPeer).length,
    };
  }, [selectedActorId, selectedFilmIndex, tracks]);

  if (!chart) {
    return <div className="sample-chart__empty">alignment.json 无可用分叉轨迹。</div>;
  }

  return (
    <figure className="sample-chart sample-chart--alignment">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Transformation Alignment static sample">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="sample-bg" rx={8} />

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, chart.t0x - MARGIN.left)}
          height={HEIGHT - MARGIN.top - MARGIN.bottom}
          className="sample-alignment-zone sample-alignment-zone--left"
        />
        <rect
          x={chart.t0x}
          y={MARGIN.top}
          width={WIDTH - MARGIN.right - chart.t0x}
          height={HEIGHT - MARGIN.top - MARGIN.bottom}
          className="sample-alignment-zone sample-alignment-zone--right"
        />

        <line
          x1={chart.t0x}
          y1={MARGIN.top}
          x2={chart.t0x}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-t0-axis"
        />
        <text x={chart.t0x + 6} y={MARGIN.top + 12} className="sample-t0-label">
          T=0
        </text>

        {chart.yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line
              x1={MARGIN.left - 4}
              y1={tick.y}
              x2={MARGIN.left}
              y2={tick.y}
              className="sample-axis"
            />
            <text x={MARGIN.left - 8} y={tick.y + 3} className="sample-axis-tick" textAnchor="end">
              {tick.value.toFixed(2)}
            </text>
          </g>
        ))}

        {chart.xTicks.map((tick) => (
          <g key={`x-${tick.value}`}>
            <line
              x1={tick.x}
              y1={HEIGHT - MARGIN.bottom}
              x2={tick.x}
              y2={HEIGHT - MARGIN.bottom + 4}
              className="sample-axis"
            />
            <text
              x={tick.x}
              y={HEIGHT - MARGIN.bottom + 15}
              className="sample-axis-tick"
              textAnchor="middle"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {chart.lineItems.map((item) => (
          <path
            key={item.id}
            d={item.path}
            className={[
              'sample-track',
              `sample-track--${item.outcome}`,
              item.isSelectedActor ? 'sample-track--selected' : '',
              item.isPeer ? 'sample-track--peer' : '',
              item.isMuted ? 'sample-track--muted' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
        ))}

        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-axis sample-axis--subtle"
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-axis sample-axis--subtle"
        />
        <text
          x={(MARGIN.left + WIDTH - MARGIN.right) / 2}
          y={HEIGHT - 4}
          className="sample-axis-label"
          textAnchor="middle"
        >
          tau = seqIndex - t0Index
        </text>
        <text
          x={12}
          y={(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}
          className="sample-axis-label"
          transform={`rotate(-90 12 ${(MARGIN.top + HEIGHT - MARGIN.bottom) / 2})`}
          textAnchor="middle"
        >
          entropy
        </text>
      </svg>

      <figcaption className="sample-chart__caption">
        {selectedFilmIndex !== null
          ? `selected N${selectedFilmIndex} · actor=${selectedActorId ?? 'n/a'}${chart.selectedActorPresent ? '' : ' (not aligned)'} · peers=${chart.peerCount}`
          : `τ 范围 [${chart.tauMin}, ${chart.tauMax}] · success=${chart.summary.success} · snapback=${chart.summary.snapback}`}
      </figcaption>
    </figure>
  );
}

function buildLinearTicks(min: number, max: number, count: number): number[] {
  if (max <= min) {
    return [min];
  }
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) {
    ticks.push(Number((min + step * i).toFixed(2)));
  }
  return ticks;
}

function summarizeByOutcome(tracks: AlignmentTrack[]) {
  return tracks.reduce(
    (acc, track) => {
      if (track.outcome === 'success') {
        acc.success += 1;
      }
      if (track.outcome === 'snapback') {
        acc.snapback += 1;
      }
      return acc;
    },
    { success: 0, snapback: 0 },
  );
}
