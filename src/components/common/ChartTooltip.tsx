import type { ReactNode } from 'react';
import './ChartTooltip.css';

interface ChartTooltipProps {
  label: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'active' | 'muted';
}

export function ChartTooltip({ label, detail, tone = 'default' }: ChartTooltipProps) {
  return (
    <figcaption className={`chart-tooltip chart-tooltip--${tone}`}>
      <span className="chart-tooltip__label">{label}</span>
      {detail !== undefined && <span className="chart-tooltip__detail">{detail}</span>}
    </figcaption>
  );
}
