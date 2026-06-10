import { useMemo } from 'react';
import { DetailsPanel } from './components/DetailsPanel';
import { InteractionGuide } from './components/InteractionGuide';
import { ViewPanel, type ViewPanelArea } from './components/ViewPanel';
import { Toggle } from './components/controls/Toggle';
import { useDataRuntime } from './data/dataRuntimeContext';
import type { MarkovStage } from './data/types';
import {
  getCohortActorIds,
  getDominantClusterId,
  getMarkovMatrixForCohort,
} from './store/selectors';
import { type AlignmentFilters, useVizStore } from './store/useVizStore';
import { AlignmentView } from './views/AlignmentView';
import { ClusterView } from './views/ClusterView';
import { MarkovView } from './views/MarkovView';
import {
  AlignmentLegend,
  ClusterLegend,
  GenreColorLegend,
  MarkovLegend,
  RiverLegend,
} from './views/PanelLegends';
import { RiverView } from './views/RiverView';
import './App.css';
import './components/DetailsPanel.css';
import './views/Views.css';

interface ReadyPanel {
  area: ViewPanelArea;
  title: string;
  legend: JSX.Element;
  content: JSX.Element;
  toolbar?: JSX.Element;
}

interface ReadyInteractionState {
  totalActors: number;
  cohortActorCount: number;
  dominantClusterId: number | null;
  selectedActorName: string | null;
  selectedFilmIndex: number | null;
  stage: MarkovStage;
  filtersActive: boolean;
  detailsOpen: boolean;
}

const PANEL_CONFIGS = [
  { area: 'cluster', title: 'A · Genre-Space Cluster' },
  { area: 'river', title: 'B · Career River' },
  { area: 'alignment', title: 'C · Transformation Alignment' },
  { area: 'markov', title: 'D · Markov Transition Gate' },
] as const satisfies ReadonlyArray<{ area: ViewPanelArea; title: string }>;
type PanelConfig = (typeof PANEL_CONFIGS)[number];

function StageToggle() {
  const stage = useVizStore((state) => state.markovStage);
  const setMarkovStage = useVizStore((state) => state.setMarkovStage);

  return (
    <Toggle<MarkovStage>
      ariaLabel="Markov stage switch"
      value={stage}
      onChange={setMarkovStage}
      options={[
        { label: 'early', value: 'early' },
        { label: 'mid', value: 'mid' },
        { label: 'late', value: 'late' },
      ]}
    />
  );
}

function hasConstrainedFilters(filters: AlignmentFilters) {
  return Object.values(filters).some(([min, max]) => Number.isFinite(min) || Number.isFinite(max));
}

export function App() {
  const loadState = useDataRuntime();
  const stage = useVizStore((state) => state.markovStage);
  const brushedActorIds = useVizStore((state) => state.brushedActorIds);
  // 视图 B（River）的单演员/cohort 模式仍由 App 汇总后透传；
  // 其余视图（A/C/D、DetailsPanel）直接订阅 store，App 保持布局与接线职责。
  const selectedActorId = useVizStore((state) => state.selectedActorId);
  const selectedFilmIndex = useVizStore((state) => state.selectedFilmIndex);
  const alignmentFilters = useVizStore((state) => state.alignmentFilters);
  const detailsOpen = useVizStore((state) => state.detailsOpen);
  const selectActor = useVizStore((state) => state.selectActor);
  const selectSpike = useVizStore((state) => state.selectSpike);
  const openDetails = useVizStore((state) => state.openDetails);

  const metaText = useMemo(() => {
    if (loadState.status !== 'ready') {
      return '等待数据契约加载…';
    }
    return `数据已加载：genres=${loadState.bundle.genres.length} · actors=${loadState.bundle.actors.length} · films=${loadState.bundle.films.length} · entropy=${loadState.bundle.entropy.length} · markov=${loadState.bundle.markov.length} · alignment=${loadState.bundle.alignment.length}`;
  }, [loadState]);

  const readyInteraction = useMemo<ReadyInteractionState | null>(() => {
    if (loadState.status !== 'ready') {
      return null;
    }

    const allActorIds = loadState.bundle.actors.map((actor) => actor.id);
    const cohortActorIds = getCohortActorIds(allActorIds, brushedActorIds);
    const dominantClusterId = getDominantClusterId(loadState.indexes, cohortActorIds);
    const selectedActorName =
      selectedActorId !== null
        ? (loadState.indexes.actorsById.get(selectedActorId)?.name ?? null)
        : null;

    return {
      totalActors: allActorIds.length,
      cohortActorCount: cohortActorIds.length,
      dominantClusterId,
      selectedActorName,
      selectedFilmIndex,
      stage,
      filtersActive: hasConstrainedFilters(alignmentFilters),
      detailsOpen,
    };
  }, [
    alignmentFilters,
    brushedActorIds,
    detailsOpen,
    loadState,
    selectedActorId,
    selectedFilmIndex,
    stage,
  ]);

  const readyPanels = useMemo(() => {
    if (loadState.status !== 'ready') {
      return null;
    }

    const allActorIds = loadState.bundle.actors.map((actor) => actor.id);
    const cohortActorIds = getCohortActorIds(allActorIds, brushedActorIds);
    const dominantClusterId = getDominantClusterId(loadState.indexes, cohortActorIds);
    const markovMatrix = getMarkovMatrixForCohort(loadState.indexes, stage, dominantClusterId);

    const panels: ReadyPanel[] = [
      {
        ...PANEL_CONFIGS[0],
        legend: <ClusterLegend />,
        content: (
          <ClusterView actors={loadState.bundle.actors} genres={loadState.bundle.genres} />
        ),
      },
      {
        ...PANEL_CONFIGS[1],
        legend: <RiverLegend />,
        content: (
          <RiverView
            bundle={loadState.bundle}
            indexes={loadState.indexes}
            cohortActorIds={cohortActorIds}
            isCohortMode={brushedActorIds.size > 0}
            selectedActorId={selectedActorId}
            selectedFilmIndex={selectedFilmIndex}
            onSpikeSelect={(actorId, filmIndex) => {
              selectActor(actorId);
              selectSpike(filmIndex);
              openDetails();
            }}
          />
        ),
      },
      {
        ...PANEL_CONFIGS[2],
        legend: <AlignmentLegend />,
        content: <AlignmentView tracks={loadState.bundle.alignment} />,
      },
      {
        ...PANEL_CONFIGS[3],
        legend: <MarkovLegend />,
        toolbar: <StageToggle />,
        content: <MarkovView matrix={markovMatrix} />,
      },
    ];

    return panels;
  }, [
    brushedActorIds,
    loadState,
    openDetails,
    selectActor,
    selectSpike,
    selectedActorId,
    selectedFilmIndex,
    stage,
  ]);

  const renderLoadingPanel = (panel: PanelConfig) => (
    <ViewPanel
      key={panel.area}
      area={panel.area}
      title={panel.title}
      toolbar={panel.area === 'markov' ? <StageToggle /> : undefined}
      legend={<span className="status-text">Legend 占位</span>}
      status={loadState.status}
      message={loadState.status === 'error' ? loadState.message : undefined}
    />
  );

  const renderReadyPanel = (panel: ReadyPanel) => (
    <ViewPanel
      key={panel.area}
      area={panel.area}
      title={panel.title}
      toolbar={panel.toolbar}
      legend={panel.legend}
      status="ready"
    >
      {panel.content}
    </ViewPanel>
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 className="app-title">CastLock-Vis</h1>
        <p className="app-subtitle">
          演员类型锁定与转型窗口期可视分析系统（S5 联动基线 · S6 视觉定稿）
        </p>
        <div className="app-meta">
          <span className="status-text">{metaText}</span>
        </div>
      </header>

      {loadState.status === 'ready' && <GenreColorLegend genres={loadState.bundle.genres} />}

      {readyInteraction && <InteractionGuide {...readyInteraction} />}

      <section className="app-grid">
        <div className="app-grid__row app-grid__row--top">
          {loadState.status !== 'ready' && PANEL_CONFIGS.slice(0, 2).map(renderLoadingPanel)}
          {loadState.status === 'ready' && readyPanels?.slice(0, 2).map(renderReadyPanel)}
        </div>

        <div className="app-grid__row app-grid__row--bottom">
          {loadState.status !== 'ready' && PANEL_CONFIGS.slice(2).map(renderLoadingPanel)}
          {loadState.status === 'ready' && readyPanels?.slice(2).map(renderReadyPanel)}
        </div>
      </section>

      {loadState.status === 'ready' && <DetailsPanel />}
    </main>
  );
}
