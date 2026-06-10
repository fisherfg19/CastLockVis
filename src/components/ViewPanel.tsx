import type { ReactNode } from 'react';
import './ViewPanel.css';

type ViewStatus = 'ready' | 'empty' | 'loading' | 'error';
export type ViewPanelArea = 'cluster' | 'river' | 'alignment' | 'markov';

interface ViewPanelProps {
  title: string;
  area?: ViewPanelArea;
  className?: string;
  toolbar?: ReactNode;
  legend?: ReactNode;
  children?: ReactNode;
  status?: ViewStatus;
  message?: string;
}

export function ViewPanel({
  title,
  area,
  className,
  toolbar,
  legend,
  children,
  status = 'ready',
  message,
}: ViewPanelProps) {
  const fallbackTextByStatus: Record<ViewStatus, string> = {
    ready: '',
    empty: '暂无数据',
    loading: '数据加载中…',
    error: '数据加载失败',
  };

  const content =
    status === 'ready' ? (
      children
    ) : (
      <div className={`view-panel__state view-panel__state--${status}`}>
        {message ?? fallbackTextByStatus[status]}
      </div>
    );
  const panelClassName = [
    'view-panel',
    area ? `view-panel--${area}` : null,
    className ?? null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={panelClassName} data-panel-area={area}>
      <header className="view-panel__header">
        <h2 className="view-panel__title">{title}</h2>
        <div className="view-panel__toolbar">{toolbar}</div>
      </header>
      <div className="view-panel__legend">{legend}</div>
      <div className="view-panel__content">{content}</div>
    </section>
  );
}
