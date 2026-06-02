import { useMemo, useState } from 'react';
import type { Actor } from '../../data/types';
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

export function ClusterSampleView({ actors, genres }: ClusterSampleViewProps) {
  const [hoveredActorId, setHoveredActorId] = useState<string | null>(null);

  const genreTokenLookup = useMemo(() => buildGenreTokenLookup(genres), [genres]);

  const hoveredActor = useMemo(
    () => actors.find((actor) => actor.id === hoveredActorId) ?? null,
    [actors, hoveredActorId],
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

  return (
    <figure className="sample-chart sample-chart--cluster">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Genre-Space Cluster static sample">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="sample-bg" rx={8} />

        {chart.tickXs.map((x) => (
          <line key={`vx-${x}`} x1={x} y1={MARGIN.top} x2={x} y2={HEIGHT - MARGIN.bottom} className="sample-grid" />
        ))}
        {chart.tickYs.map((y) => (
          <line key={`hy-${y}`} x1={MARGIN.left} y1={y} x2={WIDTH - MARGIN.right} y2={y} className="sample-grid" />
        ))}

        <line
          x1={MARGIN.left}
          y1={HEIGHT - MARGIN.bottom}
          x2={WIDTH - MARGIN.right}
          y2={HEIGHT - MARGIN.bottom}
          className="sample-axis"
        />
        <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={HEIGHT - MARGIN.bottom} className="sample-axis" />

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
          return (
            <path
              key={actor.id}
              d={clusterSymbolPath(clusterId, x, y, isHovered ? POINT_R_ACTIVE : POINT_R)}
              className={`sample-point ${isHovered ? 'sample-point--active' : ''}`}
              style={{ fill: `var(--genre-${tokenIndex})` }}
              onMouseEnter={() => setHoveredActorId(actor.id)}
              onMouseLeave={() => setHoveredActorId(null)}
            />
          );
        })}
      </svg>

      <figcaption className="sample-chart__caption">
        {hoveredActor
          ? `${hoveredActor.name} · cluster ${hoveredActor.clusterId} · early=${hoveredActor.dominantEarlyGenre}`
          : `Actors: ${actors.length} · clusters: ${chart.hulls.length} · 形状=群落, 颜色=早期类型`}
      </figcaption>
    </figure>
  );
}
