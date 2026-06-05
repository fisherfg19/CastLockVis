import { useMemo, useRef, useState } from 'react';
import { ChartTooltip } from '../../components/common/ChartTooltip';
import type { Actor } from '../../data/types';
import { useVizStore } from '../../store/useVizStore';
import {
  buildGenreTokenLookup,
  clusterHullPath,
  clusterSymbolPath,
  linearScale,
  withPadding,
} from './chartUtils';

interface ClusterSampleViewProps {
  actors: Actor[];
  genres: string[];
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
const BRUSH_CLICK_THRESHOLD = 3; // 拖动小于该 SVG 单位视作点击（选演员 / 清除）
const POINT_HIT_RADIUS = 8; // 单击命中演员点的半径（SVG 单位）

interface BrushRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ChartPoint {
  actor: Actor;
  x: number;
  y: number;
  tokenIndex: number;
  clusterId: number;
}

/** 找到离 (x,y) 最近、且在命中半径内的演员点。 */
function nearestPoint(
  points: ChartPoint[],
  x: number,
  y: number,
  radius: number,
): ChartPoint | null {
  let best: ChartPoint | null = null;
  let bestDistSq = radius * radius;
  for (const point of points) {
    const dx = point.x - x;
    const dy = point.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = point;
    }
  }
  return best;
}

/** 把屏幕坐标换算到 SVG viewBox 坐标，兼容 width:100% 的等比缩放。 */
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function ClusterSampleView({ actors, genres }: ClusterSampleViewProps) {
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
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [brushRect, setBrushRect] = useState<BrushRect | null>(null);

  const genreTokenLookup = useMemo(() => buildGenreTokenLookup(genres), [genres]);

  const hoveredActor = useMemo(
    () => actors.find((actor) => actor.id === hoveredActorId) ?? null,
    [actors, hoveredActorId],
  );

  const selectedActor = useMemo(
    () => actors.find((actor) => actor.id === selectedActorId) ?? null,
    [actors, selectedActorId],
  );

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
    return <div className="sample-chart__empty">actors.json 为空，无法渲染静态散点。</div>;
  }

  const points = chart.points;

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const local = clientToSvg(svg, event.clientX, event.clientY);
    if (!local) {
      return;
    }
    dragStart.current = local;
    setBrushRect({ x: local.x, y: local.y, w: 0, h: 0 });
    svg.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const start = dragStart.current;
    const svg = svgRef.current;
    if (!start || !svg) {
      return;
    }
    const local = clientToSvg(svg, event.clientX, event.clientY);
    if (!local) {
      return;
    }
    setBrushRect({
      x: Math.min(start.x, local.x),
      y: Math.min(start.y, local.y),
      w: Math.abs(local.x - start.x),
      h: Math.abs(local.y - start.y),
    });
  };

  const handlePointerUp = () => {
    const start = dragStart.current;
    const rect = brushRect;
    dragStart.current = null;
    setBrushRect(null);
    if (!start || !rect) {
      return;
    }

    // 极小拖动 = 单击。命中某演员点 → 单选该演员（B 切到该演员、C 高亮其轨迹）；
    // 点空白 → 清除 brush + 选择，回到全局态。
    if (rect.w < BRUSH_CLICK_THRESHOLD && rect.h < BRUSH_CLICK_THRESHOLD) {
      const hit = nearestPoint(points, start.x, start.y, POINT_HIT_RADIUS);
      if (hit) {
        selectActor(hit.actor.id);
        selectSpike(null); // 在 A 选人不携带具体作品序号
        closeDetails();
      } else {
        // 点空白仅清除群落框选，保留当前选中演员（B 维持该演员，等同"默认演员被每次选取更新"）。
        clearBrush();
      }
      return;
    }

    // 拖框 = 群落选择（链路 1）。进入群落平均态，清除单演员选择。
    const ids = points
      .filter(
        (point) =>
          point.x >= rect.x &&
          point.x <= rect.x + rect.w &&
          point.y >= rect.y &&
          point.y <= rect.y + rect.h,
      )
      .map((point) => point.actor.id);
    if (ids.length === 0) {
      clearBrush();
    } else {
      setBrush(ids);
    }
    clearSelection();
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
    <figure className="sample-chart sample-chart--cluster">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="Genre-Space Cluster static sample"
        className="sample-chart__brushable"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="sample-bg" rx={8} />

        {chart.tickXs.map((x) => (
          <line
            key={`vx-${x}`}
            x1={x}
            y1={MARGIN.top}
            x2={x}
            y2={HEIGHT - MARGIN.bottom}
            className="sample-grid"
          />
        ))}
        {chart.tickYs.map((y) => (
          <line
            key={`hy-${y}`}
            x1={MARGIN.left}
            y1={y}
            x2={WIDTH - MARGIN.right}
            y2={y}
            className="sample-grid"
          />
        ))}

        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-axis"
        />
        <line
          x1={MARGIN.left}
          y1={MARGIN.top}
          x2={MARGIN.left}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-axis"
        />

        {/* 群落凸包：颜色按 clusterId，圈出每个 cohort 的占位区域 */}
        {chart.hulls.map((hull) => {
          const token = ((hull.clusterId % CLUSTER_TOKENS) + CLUSTER_TOKENS) % CLUSTER_TOKENS;
          return (
            <path
              key={`hull-${hull.clusterId}`}
              d={hull.path}
              className="sample-hull"
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
                'sample-point',
                isActive ? 'sample-point--active' : '',
                isBrushed ? 'sample-point--selected' : '',
                isDimmed ? 'sample-point--dimmed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ fill: `var(--genre-${tokenIndex})` }}
              onMouseEnter={() => setHoveredActorId(actor.id)}
              onMouseLeave={() => setHoveredActorId(null)}
            />
          );
        })}

        {/* 框选矩形：拖动时实时绘制 */}
        {brushRect && brushRect.w > 0 && brushRect.h > 0 && (
          <rect
            x={brushRect.x}
            y={brushRect.y}
            width={brushRect.w}
            height={brushRect.h}
            className="sample-brush-box"
          />
        )}
      </svg>

      <ChartTooltip
        label={tooltipLabel}
        detail={tooltipDetail}
        tone={hoveredActor ? 'active' : 'default'}
      />
    </figure>
  );
}
