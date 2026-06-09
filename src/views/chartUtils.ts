export function linearScale(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): number {
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }
  const ratio = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + ratio * (rangeMax - rangeMin);
}

export function withPadding(min: number, max: number, paddingRatio = 0.08): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }
  const span = max - min;
  if (span === 0) {
    return [min - 1, max + 1];
  }
  const padding = span * paddingRatio;
  return [min - padding, max + padding];
}

export function buildGenreTokenLookup(genres: string[]): Map<string, number> {
  const lookup = new Map<string, number>();
  genres.forEach((genre, index) => {
    lookup.set(genre, index + 1);
  });
  return lookup;
}

export function pathFromBands(
  points: Array<{ x: number; y0: number; y1: number }>,
): string {
  if (points.length === 0) {
    return '';
  }

  const upper = points.map((point) => `${point.x},${point.y1}`);
  const lower = [...points].reverse().map((point) => `${point.x},${point.y0}`);

  return `M ${upper.join(' L ')} L ${lower.join(' L ')} Z`;
}

export function polylinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return '';
  }
  return `M ${points.map((point) => `${point.x},${point.y}`).join(' L ')}`;
}

interface Point2D {
  x: number;
  y: number;
}

/** Andrew monotone-chain convex hull (counter-clockwise). Returns ≤ input points. */
export function convexHull(points: Point2D[]): Point2D[] {
  const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length <= 2) {
    return pts;
  }
  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Push hull vertices outward from their centroid so the outline breathes around the points. */
export function expandPolygon(points: Point2D[], pad: number): Point2D[] {
  if (points.length === 0) {
    return points;
  }
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => ({ x: cx + (p.x - cx) * pad, y: cy + (p.y - cy) * pad }));
}

export function closedPolygonPath(points: Point2D[]): string {
  if (points.length === 0) {
    return '';
  }
  return `M ${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L ')} Z`;
}

/**
 * Convex hull of a cluster's *core*: drop the farthest points from the cluster's
 * (robust, median) center before hulling, so a few outliers can't balloon the
 * polygon over unrelated space. `keepQuantile` = fraction of nearest points kept
 * (e.g. 0.85 trims the farthest ~15%). Returns [] if fewer than 3 core points.
 */
export function robustHull(points: Point2D[], keepQuantile: number): Point2D[] {
  if (points.length < 3) {
    return [];
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const cx = median(points.map((p) => p.x));
  const cy = median(points.map((p) => p.y));
  const withDist = points.map((p) => ({ p, d: Math.hypot(p.x - cx, p.y - cy) }));
  const sortedDist = withDist.map((o) => o.d).sort((a, b) => a - b);
  const threshold = sortedDist[Math.floor(keepQuantile * (sortedDist.length - 1))];
  const core = withDist.filter((o) => o.d <= threshold).map((o) => o.p);
  return convexHull(core.length >= 3 ? core : points);
}

/** Push each vertex a fixed pixel distance outward from the polygon centroid. */
export function expandPolygonPx(points: Point2D[], padPx: number): Point2D[] {
  if (points.length === 0) {
    return points;
  }
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      return { x: p.x, y: p.y };
    }
    const scale = (d + padPx) / d;
    return { x: cx + dx * scale, y: cy + dy * scale };
  });
}

export function regularPolygon(cx: number, cy: number, r: number, sides: number): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return pts;
}

/**
 * Final SVG path for a cluster's hull: robust (outlier-trimmed) convex hull,
 * expanded by `padPx` for breathing room, with a `minRadius` floor so tight or
 * collapsed clusters (e.g. Western, Musical) still render instead of vanishing.
 * Tight-but-real hulls (e.g. Music) keep their shape, scaled up to the floor.
 */
export function clusterHullPath(
  points: Point2D[],
  options: { keepQuantile: number; padPx: number; minRadius: number },
): string {
  if (points.length === 0) {
    return '';
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const cx = median(points.map((p) => p.x));
  const cy = median(points.map((p) => p.y));

  const hull = robustHull(points, options.keepQuantile);
  let poly = hull.length >= 3 ? expandPolygonPx(hull, options.padPx) : [];
  const radius = poly.reduce((max, p) => Math.max(max, Math.hypot(p.x - cx, p.y - cy)), 0);

  if (poly.length < 3 || radius < 1e-3) {
    poly = regularPolygon(cx, cy, options.minRadius, 20); // collapsed → min circle
  } else if (radius < options.minRadius) {
    const scale = options.minRadius / radius; // tight-but-real → scale shape up to floor
    poly = poly.map((p) => ({ x: cx + (p.x - cx) * scale, y: cy + (p.y - cy) * scale }));
  }
  return closedPolygonPath(poly);
}

/**
 * SVG path `d` for one of 8 distinct cluster glyphs (circle, square, triangle-up,
 * diamond, triangle-down, plus, star, hexagon), centered at (cx, cy) with radius r.
 */
export function clusterSymbolPath(shapeIndex: number, cx: number, cy: number, r: number): string {
  const f = (n: number) => n.toFixed(2);
  const poly = (pts: Array<[number, number]>) =>
    `M ${pts.map(([x, y]) => `${f(cx + x)},${f(cy + y)}`).join(' L ')} Z`;

  switch (((shapeIndex % 8) + 8) % 8) {
    case 0: // circle
      return `M ${f(cx - r)},${f(cy)} a ${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0 a ${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0 Z`;
    case 1: // square
      return poly([
        [-r * 0.86, -r * 0.86],
        [r * 0.86, -r * 0.86],
        [r * 0.86, r * 0.86],
        [-r * 0.86, r * 0.86],
      ]);
    case 2: // triangle up
      return poly([
        [0, -r * 1.05],
        [r * 0.95, r * 0.72],
        [-r * 0.95, r * 0.72],
      ]);
    case 3: // diamond
      return poly([
        [0, -r * 1.18],
        [r * 1.02, 0],
        [0, r * 1.18],
        [-r * 1.02, 0],
      ]);
    case 4: // triangle down
      return poly([
        [0, r * 1.05],
        [r * 0.95, -r * 0.72],
        [-r * 0.95, -r * 0.72],
      ]);
    case 5: {
      // plus / cross
      const a = r * 0.42;
      const b = r * 1.08;
      return poly([
        [-a, -b],
        [a, -b],
        [a, -a],
        [b, -a],
        [b, a],
        [a, a],
        [a, b],
        [-a, b],
        [-a, a],
        [-b, a],
        [-b, -a],
        [-a, -a],
      ]);
    }
    case 6: {
      // 5-point star
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? r * 1.2 : r * 0.5;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      return poly(pts);
    }
    default: {
      // hexagon
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        pts.push([Math.cos(angle) * r, Math.sin(angle) * r]);
      }
      return poly(pts);
    }
  }
}
