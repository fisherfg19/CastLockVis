export function ClusterLegend() {
  return (
    <div className="panel-legend-grid">
      <span className="legend-item">
        <svg className="legend-glyphs" viewBox="0 0 64 12" aria-hidden>
          <circle cx={6} cy={6} r={3.4} />
          <rect x={17} y={2.6} width={6.8} height={6.8} />
          <polygon points="33,2 36.4,9.6 29.6,9.6" />
          <polygon points="46,1.6 49.6,6 46,10.4 42.4,6" />
          <polygon points="58,1.6 60.2,5 63.6,5.6 61,8 61.6,11.4 58,9.8 54.4,11.4 55,8 52.4,5.6 55.8,5" />
        </svg>
        <span>形状 + 凸包 = 群落 (cluster)</span>
      </span>
      <span className="legend-item">填色 = 早期主导类型（见上方共享色图例）</span>
      <span className="legend-item">
        <span className="legend-dot legend-dot--active" />
        <span>hover: 放大 + 描边高亮</span>
      </span>
    </div>
  );
}

interface GenreColorLegendProps {
  genres: string[];
}

export function GenreColorLegend({ genres }: GenreColorLegendProps) {
  return (
    <section className="genre-legend-block" aria-label="Genre color legend">
      <h3 className="genre-legend-title">Genre Color Map (A/B Shared)</h3>
      <div className="genre-legend-grid">
        {genres.map((genre, index) => (
          <span key={genre} className="genre-legend-item">
            <span
              className="genre-legend-chip"
              style={{ backgroundColor: `var(--genre-${index + 1})` }}
              aria-hidden
            />
            <span className="genre-legend-name">{genre}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function RiverLegend() {
  return (
    <div className="panel-legend-grid">
      <span className="legend-item">
        <span className="legend-river-band" />
        <span>流层厚度 = 类型占比（滑窗，颜色见共享图例）</span>
      </span>
      <span className="legend-item">
        <span className="legend-line" />
        <span>白线 = Shannon entropy</span>
      </span>
      <span className="legend-item">
        <span className="legend-dot-row">
          <span className="legend-dot legend-dot--sm" />
          <span className="legend-dot legend-dot--lg" />
        </span>
        <span>圆点: y=rating, 半径=numVotes</span>
      </span>
    </div>
  );
}

export function MarkovLegend() {
  return (
    <div className="panel-legend-grid">
      <span className="legend-item">
        <span className="legend-ramp" />
        <span>色深 = 转移概率（低→高）</span>
      </span>
      <span className="legend-item">
        <span className="legend-chip legend-chip--snap" />
        <span>对角线红格 = 类型锁定（stay）</span>
      </span>
    </div>
  );
}

export function AlignmentLegend() {
  return (
    <div className="panel-legend-grid">
      <span className="legend-item">
        <span className="legend-vline" />
        <span>虚线竖轴 = T=0（转型起点）</span>
      </span>
      <span className="legend-item">
        <span className="legend-line legend-line--success" />
        <span>绿线 = success</span>
      </span>
      <span className="legend-item">
        <span className="legend-line legend-line--snap" />
        <span>红线 = snapback</span>
      </span>
    </div>
  );
}
