import { useMemo, useState } from 'react';
import { ChartTooltip } from '../../components/common/ChartTooltip';
import type { MarkovMatrix } from '../../data/types';
import { linearScale } from './chartUtils';

interface MarkovSampleViewProps {
  matrix: MarkovMatrix | null;
}

const WIDTH = 620;
const HEIGHT = 320;
const MARGIN = { top: 18, right: 18, bottom: 82, left: 112 };

interface HoverCell {
  row: number;
  col: number;
  value: number;
}

export function MarkovSampleView({ matrix }: MarkovSampleViewProps) {
  const [hoverCell, setHoverCell] = useState<HoverCell | null>(null);

  const chart = useMemo(() => {
    if (!matrix || matrix.genres.length === 0) {
      return null;
    }

    const n = matrix.genres.length;
    const gridSize = Math.min(
      WIDTH - MARGIN.left - MARGIN.right,
      HEIGHT - MARGIN.top - MARGIN.bottom,
    );
    const cellSize = gridSize / n;

    const cells = matrix.matrix.flatMap((row, rowIndex) =>
      row.map((value, colIndex) => {
        const x = MARGIN.left + colIndex * cellSize;
        const y = MARGIN.top + rowIndex * cellSize;
        return {
          row: rowIndex,
          col: colIndex,
          value,
          x,
          y,
          isDiagonal: rowIndex === colIndex,
          intensity: Math.round(linearScale(value, 0, 1, 8, 90)),
        };
      }),
    );

    return { n, cellSize, cells };
  }, [matrix]);

  if (!chart || !matrix) {
    return <div className="sample-chart__empty">当前 stage 无可用矩阵。</div>;
  }

  return (
    <figure className="sample-chart sample-chart--markov">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="Markov Transition static sample">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="sample-bg" rx={8} />

        {chart.cells.map((cell) => (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={cell.x}
            y={cell.y}
            width={chart.cellSize - 0.75}
            height={chart.cellSize - 0.75}
            className={`sample-markov-cell ${cell.isDiagonal ? 'sample-markov-cell--diag' : ''}`}
            style={{ opacity: cell.intensity / 100 }}
            onMouseEnter={() => setHoverCell({ row: cell.row, col: cell.col, value: cell.value })}
            onMouseLeave={() => setHoverCell(null)}
          />
        ))}

        {matrix.genres.map((genre, index) => {
          const y = MARGIN.top + index * chart.cellSize + chart.cellSize * 0.65;
          return (
            <text
              key={`row-${genre}`}
              x={MARGIN.left - 8}
              y={y}
              className="sample-matrix-label"
              textAnchor="end"
            >
              {shortGenre(genre)}
            </text>
          );
        })}

        {matrix.genres.map((genre, index) => {
          const x = MARGIN.left + index * chart.cellSize + chart.cellSize * 0.55;
          const y = MARGIN.top + chart.n * chart.cellSize + 14;
          return (
            <text
              key={`col-${genre}`}
              x={x}
              y={y}
              className="sample-matrix-label sample-matrix-label--x"
              transform={`rotate(60 ${x} ${y})`}
              textAnchor="start"
            >
              {shortGenre(genre)}
            </text>
          );
        })}
      </svg>

      <ChartTooltip
        label={`cohort ${matrix.cohortId} · stage ${matrix.stage}`}
        detail={
          hoverCell
            ? `${matrix.genres[hoverCell.col]} → ${matrix.genres[hoverCell.row]} = ${hoverCell.value.toFixed(3)}`
            : 'hover cell 查看转移概率'
        }
        tone={hoverCell ? 'active' : 'default'}
      />
    </figure>
  );
}

function shortGenre(genre: string): string {
  if (genre.length <= 7) {
    return genre;
  }
  return `${genre.slice(0, 6)}.`;
}
