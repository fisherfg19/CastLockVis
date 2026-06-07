import './RangeSlider.css';

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  /** 当前区间；±Infinity 视作未约束，回落到 [min, max] 显示。 */
  value: [number, number];
  onChange: (range: [number, number]) => void;
  format?: (value: number) => string;
  /**
   * 刻度映射方式。`'log'` 让滑块在对数空间均匀移动——适合长尾分布
   * （如票房：绝大多数样本挤在低值区，少数样本远在高值区）。默认线性。
   */
  scale?: 'linear' | 'log';
}

/** 对数刻度下滑块的内部分辨率（位置 0..LOG_STEPS 线性，值在对数空间插值）。 */
const LOG_STEPS = 1000;

export function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  scale = 'linear',
}: RangeSliderProps) {
  const lo = Number.isFinite(value[0]) ? value[0] : min;
  const hi = Number.isFinite(value[1]) ? value[1] : max;
  const fmt = format ?? ((value: number) => `${value}`);

  const isLog = scale === 'log' && min > 0 && max > min;
  // 对数模式：原生滑块工作在 [0, LOG_STEPS] 的线性位置上，再换算回真实值。
  const logMin = isLog ? Math.log(min) : 0;
  const logMax = isLog ? Math.log(max) : 0;
  const toPos = (v: number) =>
    isLog
      ? Math.round(((Math.log(Math.min(Math.max(v, min), max)) - logMin) / (logMax - logMin)) * LOG_STEPS)
      : v;
  const fromPos = (pos: number) =>
    isLog ? Math.exp(logMin + (pos / LOG_STEPS) * (logMax - logMin)) : pos;

  const inputMin = isLog ? 0 : min;
  const inputMax = isLog ? LOG_STEPS : max;
  const inputStep = isLog ? 1 : step;

  return (
    <div className="range-slider" role="group" aria-label={label}>
      <div className="range-slider__head">
        <span className="range-slider__label">{label}</span>
        <span className="range-slider__value">
          {fmt(lo)}–{fmt(hi)}
        </span>
      </div>
      <div className="range-slider__inputs">
        <input
          type="range"
          aria-label={`${label} 下限`}
          min={inputMin}
          max={inputMax}
          step={inputStep}
          value={toPos(lo)}
          onChange={(event) => onChange([Math.min(fromPos(Number(event.target.value)), hi), hi])}
        />
        <input
          type="range"
          aria-label={`${label} 上限`}
          min={inputMin}
          max={inputMax}
          step={inputStep}
          value={toPos(hi)}
          onChange={(event) => onChange([lo, Math.max(fromPos(Number(event.target.value)), lo)])}
        />
      </div>
    </div>
  );
}
