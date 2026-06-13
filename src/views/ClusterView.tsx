import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { BrushLayer } from '../components/controls/BrushLayer';
import { ChartTooltip } from '../components/common/ChartTooltip';
import type { Actor } from '../data/types';
import { useVizStore } from '../store/useVizStore';
import {
  buildGenreTokenLookup,
  clusterHullPath,
  clusterSymbolPath,
  linearScale,
  withPadding,
} from './chartUtils';

interface ClusterViewProps {
  actors: Actor[];
  genres: string[];
}

interface ClusterSummaryItem {
  clusterId: number;
  count: number;
  percent: number;
  barPercent: number;
  actorIds: string[];
  token: number;
}

const WIDTH = 620;
const HEIGHT = 320;
const MARGIN = { top: 20, right: 18, bottom: 34, left: 34 };
const POINT_R = 3.4;
const POINT_R_ACTIVE = 5.4;
const CLUSTER_TOKENS = 8; // tokens.css 提供 --cluster-0..7
const HULL_KEEP_QUANTILE = 0.85; // 凸包只包住每簇最近 85% 的点，剔除离群点导致的虚胖
const HULL_PAD_PX = 10; // 凸包外扩像素（让 Music 这类小簇可见）
const HULL_MIN_RADIUS = 18; // 凸包最小半径（让坍缩成点的 Western/Musical 仍可见）

export function ClusterView({ actors, genres }: ClusterViewProps) {
  const [hoveredActorId, setHoveredActorId] = useState<string | null>(null);

  const brushedActorIds = useVizStore((state) => state.brushedActorIds);
  const setBrush = useVizStore((state) => state.setBrush);
  const clearBrush = useVizStore((state) => state.clearBrush);
  const selectedActorId = useVizStore((state) => state.selectedActorId);
  const selectActor = useVizStore((state) => state.selectActor);
  const selectSpike = useVizStore((state) => state.selectSpike);
  const closeDetails = useVizStore((state) => state.closeDetails);

  const clearSelection = () => {
    selectActor(null);
    selectSpike(null);
    closeDetails();
  };

  const svgRef = useRef<SVGSVGElement>(null);

  const genreTokenLookup = useMemo(() => buildGenreTokenLookup(genres), [genres]);

  const hoveredActor = useMemo(
    () => actors.find((actor) => actor.id === hoveredActorId) ?? null,
    [actors, hoveredActorId],
  );

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.id === selectedActorId) ?? null,
    [actors, selectedActorId],
  );

  const clusterSummary = useMemo<ClusterSummaryItem[]>(() => {
    const total = actors.length || 1;
    const byCluster = new Map<number, { count: number; actorIds: string[] }>();

    for (const actor of actors) {
      const current = byCluster.get(actor.clusterId) ?? { count: 0, actorIds: [] };
      current.count += 1;
      current.actorIds.push(actor.id);
      byCluster.set(actor.clusterId, current);
    }

    const maxCount = Math.max(...[...byCluster.values()].map((summary) => summary.count), 1);

    return [...byCluster.entries()]
      .sort(([leftClusterId], [rightClusterId]) => leftClusterId - rightClusterId)
      .map(([clusterId, summary]) => ({
        clusterId,
        count: summary.count,
        percent: (summary.count / total) * 100,
        barPercent: (summary.count / maxCount) * 100,
        actorIds: summary.actorIds,
        token: ((clusterId % CLUSTER_TOKENS) + CLUSTER_TOKENS) % CLUSTER_TOKENS,
      }));
  }, [actors]);

  const chart = useMemo(() => {
    if (actors.length === 0) {
      return null;
    }

    const xValues = actors.map((actor) => actor.projection[0]);
    const yValues = actors.map((actor) => actor.projection[1]);
    const [xMin, xMax] = withPadding(Math.min(...xValues), Math.max(...xValues), 0.12);
    const [yMin, yMax] = withPadding(Math.min(...yValues), Math.max(...yValues), 0.12);

    const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
    const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

    const points = actors.map((actor) => {
      const x = linearScale(actor.projection[0], xMin, xMax, MARGIN.left, MARGIN.left + innerWidth);
      const y = linearScale(actor.projection[1], yMin, yMax, MARGIN.top + innerHeight, MARGIN.top);
      const tokenIndex = genreTokenLookup.get(actor.dominantEarlyGenre) ?? 1;
      return { actor, x, y, tokenIndex, clusterId: actor.clusterId };
    });

    // 每个群落的凸包（≥3 点才有面），外扩一点留出呼吸空间。
    const byCluster = new Map<number, Array<{ x: number; y: number }>>();
    for (const point of points) {
      const list = byCluster.get(point.clusterId) ?? [];
      list.push({ x: point.x, y: point.y });
      byCluster.set(point.clusterId, list);
    }
    const hulls = [...byCluster.entries()]
      .map(([clusterId, pts]) => ({
        clusterId,
        path: clusterHullPath(pts, {
          keepQuantile: HULL_KEEP_QUANTILE,
          padPx: HULL_PAD_PX,
          minRadius: HULL_MIN_RADIUS,
        }),
      }))
      .filter((hull) => hull.path !== '');

    const tickXs = Array.from({ length: 6 }, (_, index) => MARGIN.left + (innerWidth * index) / 5);
    const tickYs = Array.from({ length: 5 }, (_, index) => MARGIN.top + (innerHeight * index) / 4);

    return { points, hulls, tickXs, tickYs, innerWidth, innerHeight };
  }, [actors, genreTokenLookup]);

  if (!chart) {
    return <div className="view-chart__empty">actors.json 为空，无法渲染静态散点。</div>;
  }

  const points = chart.points;

  // 拖框结束：空列表回到全局态，否则进入群落平均态；任一情况都清掉单演员选择。
  const handleBrush = (ids: string[]) => {
    if (ids.length === 0) {
      clearBrush();
    } else {
      setBrush(ids);
    }
    clearSelection();
  };

  // 单击命中演员点（链路 2 起点）：单选该演员，不携带具体作品序号。
  const handleSelectPoint = (actorId: string) => {
    selectActor(actorId);
    selectSpike(null);
    closeDetails();
  };

  const hasBrush = brushedActorIds.size > 0;
  const tooltipLabel = hoveredActor
    ? hoveredActor.name
    : hasBrush
      ? `框选 ${brushedActorIds.size} 位演员`
      : selectedActor
        ? `已选中 ${selectedActor.name}`
        : `Actors: ${actors.length}`;
  const tooltipDetail = hoveredActor
    ? `cluster ${hoveredActor.clusterId} · early=${hoveredActor.dominantEarlyGenre}`
    : hasBrush
      ? '点击空白清除选区'
      : selectedActor
        ? `cluster ${selectedActor.clusterId} · 单击演员切换 / 点空白清除`
        : `clusters: ${chart.hulls.length} · 单击选演员 · 拖框选群落`;

  return (
    <figure className="view-chart view-chart--cluster">
      <div className="view-cluster-layout">
        <div className="view-cluster-main">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            aria-label="Genre-Space Cluster view"
            className="view-chart__brushable"
          >
            <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="view-bg" rx={8} />

            {chart.tickXs.map((x) => (
              <line
                key={`vx-${x}`}
                x1={x}
                y1={MARGIN.top}
                x2={x}
                y2={HEIGHT - MARGIN.bottom}
                className="view-grid"
              />
            ))}
            {chart.tickYs.map((y) => (
              <line
                key={`hy-${y}`}
                x1={MARGIN.left}
                y1={y}
                x2={WIDTH - MARGIN.right}
                y2={y}
                className="view-grid"
              />
            ))}

            <line
              x1={MARGIN.left}
              y1={HEIGHT - MARGIN.bottom}
              x2={WIDTH - MARGIN.right}
              y2={HEIGHT - MARGIN.bottom}
              className="view-axis"
            />
            <line
              x1={MARGIN.left}
              y1={MARGIN.top}
              x2={MARGIN.left}
              y2={HEIGHT - MARGIN.bottom}
              className="view-axis"
            />

            {/* 群落凸包：颜色按 clusterId，圈出每个 cohort 的占位区域 */}
            {chart.hulls.map((hull) => {
              const token = ((hull.clusterId % CLUSTER_TOKENS) + CLUSTER_TOKENS) % CLUSTER_TOKENS;
              return (
                <path
                  key={`hull-${hull.clusterId}`}
                  d={hull.path}
                  className="view-hull"
                  style={{ fill: `var(--cluster-${token})`, stroke: `var(--cluster-${token})` }}
                />
              );
            })}

            {/* 演员点：形状=群落(cluster)，填色=早期主导类型(genre) */}
            {chart.points.map(({ actor, x, y, tokenIndex, clusterId }) => {
              const isHovered = hoveredActorId === actor.id;
              // 单击选中的演员（链路 2 起点）：保持高亮，且 brush 激活时不被调暗。
              const isActorSelected = selectedActorId === actor.id;
              // 群落框选命中的演员：沿用 main 的 brush 视觉（--selected 描边 + 放大）。
              const isBrushed = brushedActorIds.has(actor.id);
              const isActive = isHovered || isActorSelected;
              const isDimmed = hasBrush && !isBrushed && !isActorSelected;
              return (
                <path
                  key={actor.id}
                  d={clusterSymbolPath(
                    clusterId,
                    x,
                    y,
                    isActive || isBrushed ? POINT_R_ACTIVE : POINT_R,
                  )}
                  className={[
                    'view-point',
                    isActive ? 'view-point--active' : '',
                    isBrushed ? 'view-point--selected' : '',
                    isDimmed ? 'view-point--dimmed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ fill: `var(--genre-${tokenIndex})` }}
                  onMouseEnter={() => setHoveredActorId(actor.id)}
                  onMouseLeave={() => setHoveredActorId(null)}
                />
              );
            })}

            {/* 通用框选层：绑定拖框/单击逻辑并绘制框选矩形 */}
            <BrushLayer
              svgRef={svgRef}
              points={points}
              onBrush={handleBrush}
              onSelectPoint={handleSelectPoint}
              onClearBrush={clearBrush}
            />
          </svg>
        </div>

        <aside className="cluster-composition" aria-label="Cluster composition">
          <div className="cluster-composition__list">
            {clusterSummary.map(({ clusterId, count, percent, barPercent, token }) => (
              <div
                key={clusterId}
                className="cluster-composition__row"
                data-cluster-id={clusterId}
                style={
                  {
                    '--cluster-color': `var(--cluster-${token})`,
                    '--cluster-bar-percent': `${barPercent}%`,
                  } as CSSProperties
                }
              >
                <span className="cluster-composition__bar" aria-hidden>
                  <span className="cluster-composition__bar-fill" />
                </span>
                <span className="cluster-composition__label">C{clusterId}</span>
                <span className="cluster-composition__metric">
                  <strong>{count}</strong>
                  <span>{percent.toFixed(1)}%</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <ChartTooltip
        label={tooltipLabel}
        detail={tooltipDetail}
        tone={hoveredActor ? 'active' : 'default'}
      />
    </figure>
  );
}
