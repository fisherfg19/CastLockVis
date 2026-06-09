import { useMemo, useState } from 'react';
import { ChartTooltip } from '../components/common/ChartTooltip';
import type { AlignmentPoint, AlignmentTrack, AlignmentTrackPivot } from '../data/types';
import { alignmentTrackInFilter } from '../lib/aggregate';
import { RangeSlider } from '../components/controls/RangeSlider';
import { useVizStore } from '../store/useVizStore';
import { linearScale, polylinePath } from './chartUtils';

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return `${Math.round(value)}`;
}

function domainOf(values: number[]): [number, number] {
  if (values.length === 0) {
    return [0, 1];
  }
  return [Math.min(...values), Math.max(...values)];
}

interface AlignmentViewProps {
  tracks: AlignmentTrack[];
}

/** 视图 C 的 y 轴可在「类型偏离度 dist」(默认) 与「类型熵 entropy」之间切换，便于调试对比。 */
type YAxisMode = 'dist' | 'entropy';

/** 一条轨迹的"几何"（SVG 路径）。只随 tracks/yAxis 变化，与过滤器/选区无关。 */
interface TrackGeom {
  track: AlignmentTrack;
  actorId: string;
  outcome: AlignmentTrack['outcome'];
  clusterId: number;
  t0Index: number;
  path: string;
}

const Y_AXIS_META: Record<
  YAxisMode,
  { label: string; accessor: (p: AlignmentPoint) => number; anchorZero: boolean }
> = {
  dist: { label: '类型偏离度（距舒适圈）', accessor: (p) => p.dist, anchorZero: true },
  entropy: { label: '类型熵 (entropy)', accessor: (p) => p.entropy, anchorZero: false },
};

const WIDTH = 620;
const HEIGHT = 320;
const MARGIN = { top: 18, right: 20, bottom: 30, left: 34 };

export function AlignmentView({ tracks }: AlignmentViewProps) {
  const [yAxis, setYAxis] = useState<YAxisMode>('dist');

  const selectedActorId = useVizStore((state) => state.selectedActorId);
  const selectedFilmIndex = useVizStore((state) => state.selectedFilmIndex);
  const alignmentFilters = useVizStore((state) => state.alignmentFilters);
  const setAlignmentFilter = useVizStore((state) => state.setAlignmentFilter);

  // 控制变量过滤器的数据域（仅 pivot 轨迹有 T=0 协变量）。
  const domains = useMemo(() => {
    const pivots = tracks.filter((track): track is AlignmentTrackPivot => track.outcome !== 'none');
    return {
      directorHeterogeneity: domainOf(
        pivots.map((track) => track.covariatesAtT0.directorHeterogeneity),
      ),
      rating: domainOf(pivots.map((track) => track.covariatesAtT0.rating)),
      numVotes: domainOf(pivots.map((track) => track.covariatesAtT0.numVotes)),
    };
  }, [tracks]);

  const resetFilters = () => {
    setAlignmentFilter('directorHeterogeneity', [
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]);
    setAlignmentFilter('rating', [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]);
    setAlignmentFilter('numVotes', [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]);
  };

  // 几何层：路径 + 坐标轴。只随 tracks / yAxis 变化——拖动滑块或改选区时不会重建 1157 条路径。
  const geometry = useMemo(() => {
    const drawable = tracks.filter((track) => track.points.length > 0);
    const hasPivot = drawable.some((track) => track.outcome !== 'none');
    if (!hasPivot) {
      return null;
    }

    const { label: yLabel, accessor, anchorZero } = Y_AXIS_META[yAxis];

    // 坐标域覆盖所有可绘轨迹（含 none 背景），用循环避免对 ~1 万点做 Math.min(...spread)。
    let tauMin = Infinity;
    let tauMax = -Infinity;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const track of drawable) {
      for (const point of track.points) {
        if (point.tau < tauMin) tauMin = point.tau;
        if (point.tau > tauMax) tauMax = point.tau;
        const value = accessor(point);
        if (value < yLo) yLo = value;
        if (value > yHi) yHi = value;
      }
    }
    // dist 锚定 0（=贴着早期舒适圈）在底部；entropy 用数据自身范围。
    const yMin = anchorZero ? 0 : yLo;
    const yMax = Math.max(yMin + 0.1, yHi);

    const xScale = (tau: number) =>
      linearScale(tau, tauMin, tauMax, MARGIN.left, WIDTH - MARGIN.right);
    const yScale = (value: number) =>
      linearScale(value, yMin, yMax, HEIGHT - MARGIN.bottom, MARGIN.top);

    const trackGeoms: TrackGeom[] = drawable.map((track) => ({
      track,
      actorId: track.actorId,
      outcome: track.outcome,
      clusterId: track.clusterId,
      t0Index: track.t0Index,
      path: polylinePath(
        track.points.map((point) => ({ x: xScale(point.tau), y: yScale(accessor(point)) })),
      ),
    }));

    return {
      trackGeoms,
      tauMin,
      tauMax,
      xScale,
      t0x: xScale(0),
      xTicks: buildLinearTicks(tauMin, tauMax, 9).map((value) => ({ value, x: xScale(value) })),
      yTicks: buildLinearTicks(yMin, yMax, 6).map((value) => ({ value, y: yScale(value) })),
      yLabel,
    };
  }, [tracks, yAxis]);

  // 分类层：把每条轨迹归入"样式桶"，并把同桶路径拼成单个 <path>（~1100 DOM 节点 → ~7）。
  // 轻量：随选区/过滤器变化即时重算，不重建几何。同侪定义 = 同 clusterId（选择性强、有语义）。
  const view = useMemo(() => {
    if (!geometry) {
      return null;
    }
    const { trackGeoms } = geometry;

    const selectedGeom =
      selectedActorId !== null
        ? (trackGeoms.find((geom) => geom.actorId === selectedActorId) ?? null)
        : null;
    const selectedClusterId = selectedGeom ? selectedGeom.clusterId : null;
    // 选中作品序号 → 对齐辅助线位置（仅信息提示，不参与同侪判定）。
    const selectedTau =
      selectedGeom !== null && selectedFilmIndex !== null
        ? selectedFilmIndex - selectedGeom.t0Index
        : null;

    const contextOut: string[] = []; // 灰 faint：过滤外（含过滤外同侪）
    const none: string[] = []; // 灰：未检出转型上下文
    const contextInSuccess: string[] = [];
    const contextInSnapback: string[] = [];
    const peerSuccess: string[] = [];
    const peerSnapback: string[] = [];
    let selectedItem: TrackGeom | null = null;
    let success = 0;
    let snapback = 0;

    for (const geom of trackGeoms) {
      const inFilter = alignmentTrackInFilter(geom.track, alignmentFilters);
      if (inFilter) {
        if (geom.outcome === 'success') success += 1;
        else if (geom.outcome === 'snapback') snapback += 1;
      }

      if (selectedGeom !== null && geom.actorId === selectedGeom.actorId) {
        selectedItem = geom;
        continue;
      }
      if (geom.outcome === 'none') {
        none.push(geom.path);
        continue;
      }
      const isPeer = selectedClusterId !== null && geom.clusterId === selectedClusterId;
      if (!inFilter) {
        contextOut.push(geom.path);
        continue;
      }
      if (isPeer) {
        (geom.outcome === 'success' ? peerSuccess : peerSnapback).push(geom.path);
      } else {
        (geom.outcome === 'success' ? contextInSuccess : contextInSnapback).push(geom.path);
      }
    }

    const selectedGuideX =
      selectedTau !== null && selectedTau >= geometry.tauMin && selectedTau <= geometry.tauMax
        ? geometry.xScale(selectedTau)
        : null;

    return {
      contextOutD: contextOut.join(' '),
      noneD: none.join(' '),
      contextInSuccessD: contextInSuccess.join(' '),
      contextInSnapbackD: contextInSnapback.join(' '),
      peerSuccessD: peerSuccess.join(' '),
      peerSnapbackD: peerSnapback.join(' '),
      selectedItem,
      summary: { success, snapback },
      peerCount: peerSuccess.length + peerSnapback.length,
      selectedTau,
      selectedGuideX,
    };
  }, [geometry, selectedActorId, selectedFilmIndex, alignmentFilters]);

  if (!geometry || !view) {
    return <div className="view-chart__empty">alignment.json 无可用分叉轨迹。</div>;
  }

  const tooltipDetail = [
    `success=${view.summary.success}`,
    `snapback=${view.summary.snapback}`,
    selectedActorId !== null ? `同群落同侪 ${view.peerCount}` : null,
    view.selectedTau !== null ? `选中 τ=${view.selectedTau}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <figure className="view-chart view-chart--alignment">
      <div className="view-chart__toolbar">
        <div className="view-chart__controls" role="group" aria-label="视图 C 纵轴切换">
          <span className="view-chart__controls-label">纵轴</span>
          <button
            type="button"
            className={`view-axis-toggle${yAxis === 'dist' ? ' is-active' : ''}`}
            aria-pressed={yAxis === 'dist'}
            onClick={() => setYAxis('dist')}
          >
            类型偏离度
          </button>
          <button
            type="button"
            className={`view-axis-toggle${yAxis === 'entropy' ? ' is-active' : ''}`}
            aria-pressed={yAxis === 'entropy'}
            onClick={() => setYAxis('entropy')}
          >
            熵
          </button>
        </div>
        <div className="view-chart__filters" role="group" aria-label="控制变量过滤器（重分层）">
          <RangeSlider
            label="导演异质性"
            min={domains.directorHeterogeneity[0]}
            max={domains.directorHeterogeneity[1]}
            step={0.01}
            value={alignmentFilters.directorHeterogeneity}
            onChange={(range) => setAlignmentFilter('directorHeterogeneity', range)}
            format={(value) => value.toFixed(2)}
          />
          <RangeSlider
            label="评分"
            min={domains.rating[0]}
            max={domains.rating[1]}
            step={0.1}
            value={alignmentFilters.rating}
            onChange={(range) => setAlignmentFilter('rating', range)}
            format={(value) => value.toFixed(1)}
          />
          <RangeSlider
            label="票房"
            min={domains.numVotes[0]}
            max={domains.numVotes[1]}
            step={Math.max(1, Math.round((domains.numVotes[1] - domains.numVotes[0]) / 100))}
            value={alignmentFilters.numVotes}
            onChange={(range) => setAlignmentFilter('numVotes', range)}
            format={formatCompact}
            scale="log"
          />
          <button type="button" className="view-axis-toggle" onClick={resetFilters}>
            重置
          </button>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Transformation Alignment view">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="view-bg" rx={8} />

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={Math.max(0, geometry.t0x - MARGIN.left)}
          height={HEIGHT - MARGIN.top - MARGIN.bottom}
          className="view-alignment-zone view-alignment-zone--left"
        />

        <line
          x1={geometry.t0x}
          y1={MARGIN.top}
          x2={geometry.t0x}
          y2={HEIGHT - MARGIN.bottom}
          className="view-t0-axis"
        />
        <text x={geometry.t0x + 6} y={MARGIN.top + 12} className="view-t0-label">
          T=0
        </text>

        {geometry.yTicks.map((tick) => (
          <g key={`y-${tick.value}`}>
            <line
              x1={MARGIN.left - 4}
              y1={tick.y}
              x2={MARGIN.left}
              y2={tick.y}
              className="view-axis"
            />
            <text x={MARGIN.left - 8} y={tick.y + 3} className="view-axis-tick" textAnchor="end">
              {tick.value.toFixed(2)}
            </text>
          </g>
        ))}

        {geometry.xTicks.map((tick) => (
          <g key={`x-${tick.value}`}>
            <line
              x1={tick.x}
              y1={HEIGHT - MARGIN.bottom}
              x2={tick.x}
              y2={HEIGHT - MARGIN.bottom + 4}
              className="view-axis"
            />
            <text
              x={tick.x}
              y={HEIGHT - MARGIN.bottom + 15}
              className="view-axis-tick"
              textAnchor="middle"
            >
              {tick.value}
            </text>
          </g>
        ))}

        {/* 分层绘制（后画在上）：每个样式桶合并为单条 path，上下文沉底、同侪与选中浮顶 */}
        {view.contextOutD && (
          <path d={view.contextOutD} className="view-track view-track--context-out" />
        )}
        {view.noneD && <path d={view.noneD} className="view-track view-track--none" />}
        {view.contextInSuccessD && (
          <path d={view.contextInSuccessD} className="view-track view-track--success" />
        )}
        {view.contextInSnapbackD && (
          <path d={view.contextInSnapbackD} className="view-track view-track--snapback" />
        )}
        {view.peerSuccessD && (
          <path
            d={view.peerSuccessD}
            className="view-track view-track--success view-track--peer"
          />
        )}
        {view.peerSnapbackD && (
          <path
            d={view.peerSnapbackD}
            className="view-track view-track--snapback view-track--peer"
          />
        )}
        {view.selectedItem && (
          <path
            d={view.selectedItem.path}
            className={`view-track view-track--${view.selectedItem.outcome} view-track--selected`}
          />
        )}

        {/* 选中 tau 的对齐辅助竖线 */}
        {view.selectedGuideX !== null && (
          <line
            x1={view.selectedGuideX}
            y1={MARGIN.top}
            x2={view.selectedGuideX}
            y2={HEIGHT - MARGIN.bottom}
            className="view-selected-guide"
          />
        )}

        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          className="view-axis view-axis--subtle"
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={HEIGHT - MARGIN.bottom}
          className="view-axis view-axis--subtle"
        />
        <text
          x={(MARGIN.left + WIDTH - MARGIN.right) / 2}
          y={HEIGHT - 4}
          className="view-axis-label"
          textAnchor="middle"
        >
          tau = seqIndex - t0Index
        </text>
        <text
          x={12}
          y={(MARGIN.top + HEIGHT - MARGIN.bottom) / 2}
          className="view-axis-label"
          transform={`rotate(-90 12 ${(MARGIN.top + HEIGHT - MARGIN.bottom) / 2})`}
          textAnchor="middle"
        >
          {geometry.yLabel}
        </text>
      </svg>

      <ChartTooltip
        label={`τ 范围 [${geometry.tauMin}, ${geometry.tauMax}]`}
        detail={tooltipDetail}
        tone={selectedActorId !== null ? 'active' : 'default'}
      />
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
