import { useMemo } from 'react';
import { DetailsPanel } from './components/DetailsPanel';
import { ViewPanel } from './components/ViewPanel';
import { Toggle } from './components/controls/Toggle';
import { useDataRuntime } from './data/dataRuntimeContext';
import type { MarkovStage } from './data/types';
import {
  getCohortActorIds,
  getDominantClusterId,
  getFilteredAlignmentTracks,
  getMarkovMatrixForCohort,
} from './store/selectors';
import { type AlignmentFilters, useVizStore } from './store/useVizStore';
import { AlignmentSampleView } from './views/static-samples/AlignmentSampleView';
import { ClusterSampleView } from './views/static-samples/ClusterSampleView';
import { MarkovSampleView } from './views/static-samples/MarkovSampleView';
import {
  AlignmentLegend,
  ClusterLegend,
  GenreColorLegend,
  MarkovLegend,
  RiverLegend,
} from './views/static-samples/PanelLegends';
import { RiverSampleView } from './views/static-samples/RiverSampleView';
import './App.css';
import './views/static-samples/staticSamples.css';

interface ReadyPanel {
  title: string;
  legend: JSX.Element;
  content: JSX.Element;
  toolbar?: JSX.Element;
}

const PANEL_TITLES = [
  'A · Genre-Space Cluster',
  'B · Career River',
  'C · Transformation Alignment',
  'D · Markov Transition Gate',
] as const;

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

function ClusterToolbar() {
  const brushedActorIds = useVizStore((state) => state.brushedActorIds);
  const clearBrush = useVizStore((state) => state.clearBrush);

  if (brushedActorIds.size === 0) {
    return <span className="status-text">global cohort</span>;
  }

  return (
    <div className="cluster-toolbar">
      <span className="status-text">{brushedActorIds.size} selected</span>
      <button className="panel-action-button" type="button" onClick={clearBrush}>
        Clear
      </button>
    </div>
  );
}

function AlignmentToolbar() {
  const filters = useVizStore((state) => state.alignmentFilters);
  const setAlignmentFilter = useVizStore((state) => state.setAlignmentFilter);
  const resetAlignmentFilters = useVizStore((state) => state.resetAlignmentFilters);
  const selectedActorId = useVizStore((state) => state.selectedActorId);
  const selectedFilmIndex = useVizStore((state) => state.selectedFilmIndex);
  const clearSelection = useVizStore((state) => state.clearSelection);

  return (
    <div className="alignment-toolbar">
      <FilterSelect
        label="rating"
        value={filterKeyForRange(filters.rating)}
        onChange={(value) => setAlignmentFilter('rating', rangeForFilter('rating', value))}
        options={[
          { value: 'all', label: 'all' },
          { value: 'high', label: '>=7' },
          { value: 'low', label: '<7' },
        ]}
      />
      <FilterSelect
        label="votes"
        value={filterKeyForRange(filters.numVotes)}
        onChange={(value) => setAlignmentFilter('numVotes', rangeForFilter('numVotes', value))}
        options={[
          { value: 'all', label: 'all' },
          { value: 'high', label: '>=100k' },
          { value: 'low', label: '<100k' },
        ]}
      />
      <FilterSelect
        label="director"
        value={filterKeyForRange(filters.directorHeterogeneity)}
        onChange={(value) =>
          setAlignmentFilter(
            'directorHeterogeneity',
            rangeForFilter('directorHeterogeneity', value),
          )
        }
        options={[
          { value: 'all', label: 'all' },
          { value: 'high', label: '>=4' },
          { value: 'low', label: '<4' },
        ]}
      />
      <button className="panel-action-button" type="button" onClick={resetAlignmentFilters}>
        Reset
      </button>
      {(selectedActorId !== null || selectedFilmIndex !== null) && (
        <button className="panel-action-button" type="button" onClick={clearSelection}>
          Clear Select
        </button>
      )}
    </div>
  );
}

type FilterKey = 'all' | 'high' | 'low';

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: FilterKey;
  options: Array<{ value: FilterKey; label: string }>;
  onChange: (value: FilterKey) => void;
}) {
  return (
    <label className="filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as FilterKey)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function filterKeyForRange(range: [number, number]): FilterKey {
  const [min, max] = range;
  if (min === Number.NEGATIVE_INFINITY && max === Number.POSITIVE_INFINITY) {
    return 'all';
  }
  if (min !== Number.NEGATIVE_INFINITY) {
    return 'high';
  }
  return 'low';
}

function rangeForFilter(key: keyof AlignmentFilters, value: FilterKey): [number, number] {
  if (value === 'all') {
    return [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  }

  const thresholdByKey: Record<keyof AlignmentFilters, number> = {
    rating: 7,
    numVotes: 100000,
    directorHeterogeneity: 4,
  };
  const threshold = thresholdByKey[key];
  return value === 'high'
    ? [threshold, Number.POSITIVE_INFINITY]
    : [Number.NEGATIVE_INFINITY, threshold - Number.EPSILON];
}

export function App() {
  const loadState = useDataRuntime();
  const stage = useVizStore((state) => state.markovStage);
  const brushedActorIds = useVizStore((state) => state.brushedActorIds);
  const selectedActorId = useVizStore((state) => state.selectedActorId);
  const selectedFilmIndex = useVizStore((state) => state.selectedFilmIndex);
  const detailsOpen = useVizStore((state) => state.detailsOpen);
  const alignmentFilters = useVizStore((state) => state.alignmentFilters);
  const setBrush = useVizStore((state) => state.setBrush);
  const clearBrush = useVizStore((state) => state.clearBrush);
  const selectActor = useVizStore((state) => state.selectActor);
  const selectSpike = useVizStore((state) => state.selectSpike);
  const openDetails = useVizStore((state) => state.openDetails);
  const closeDetails = useVizStore((state) => state.closeDetails);

  const metaText = useMemo(() => {
    if (loadState.status !== 'ready') {
      return '等待数据契约加载…';
    }
    return `数据已加载：genres=${loadState.bundle.genres.length} · actors=${loadState.bundle.actors.length} · films=${loadState.bundle.films.length} · entropy=${loadState.bundle.entropy.length} · markov=${loadState.bundle.markov.length} · alignment=${loadState.bundle.alignment.length}`;
  }, [loadState]);

  const readyPanels = useMemo(() => {
    if (loadState.status !== 'ready') {
      return null;
    }

    const allActorIds = loadState.bundle.actors.map((actor) => actor.id);
    const cohortActorIds = getCohortActorIds(allActorIds, brushedActorIds);
    const dominantClusterId = getDominantClusterId(loadState.indexes, cohortActorIds);
    const markovMatrix = getMarkovMatrixForCohort(loadState.indexes, stage, dominantClusterId);
    const filteredAlignmentTracks = getFilteredAlignmentTracks(loadState.bundle, alignmentFilters);

    const panels: ReadyPanel[] = [
      {
        title: PANEL_TITLES[0],
        legend: <ClusterLegend />,
        toolbar: <ClusterToolbar />,
        content: (
          <ClusterSampleView
            actors={loadState.bundle.actors}
            genres={loadState.bundle.genres}
            brushedActorIds={brushedActorIds}
            onBrush={setBrush}
            onClearBrush={clearBrush}
          />
        ),
      },
      {
        title: PANEL_TITLES[1],
        legend: <RiverLegend />,
        content: (
          <RiverSampleView
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
        title: PANEL_TITLES[2],
        legend: <AlignmentLegend />,
        toolbar: <AlignmentToolbar />,
        content: (
          <AlignmentSampleView
            tracks={filteredAlignmentTracks}
            selectedActorId={selectedActorId}
            selectedFilmIndex={selectedFilmIndex}
          />
        ),
      },
      {
        title: PANEL_TITLES[3],
        legend: <MarkovLegend />,
        toolbar: <StageToggle />,
        content: <MarkovSampleView matrix={markovMatrix} />,
      },
    ];

    return panels;
  }, [
    alignmentFilters,
    brushedActorIds,
    clearBrush,
    openDetails,
    loadState,
    selectActor,
    selectSpike,
    selectedActorId,
    selectedFilmIndex,
    setBrush,
    stage,
  ]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 className="app-title">CastLock-Vis</h1>
        <p className="app-subtitle">
          演员类型锁定与转型窗口期可视分析系统（S1 骨架 + S2/S3 静态样例）
        </p>
        <div className="app-meta">
          <span className="status-text">{metaText}</span>
        </div>
      </header>

      {loadState.status === 'ready' && <GenreColorLegend genres={loadState.bundle.genres} />}

      <section className="app-grid">
        {loadState.status !== 'ready' &&
          PANEL_TITLES.map((title) => (
            <ViewPanel
              key={title}
              title={title}
              toolbar={title.startsWith('D') ? <StageToggle /> : undefined}
              legend={<span className="status-text">Legend 占位</span>}
              status={loadState.status}
              message={loadState.status === 'error' ? loadState.message : undefined}
            />
          ))}

        {loadState.status === 'ready' &&
          readyPanels?.map((panel) => (
            <ViewPanel
              key={panel.title}
              title={panel.title}
              toolbar={panel.toolbar}
              legend={panel.legend}
              status="ready"
            >
              {panel.content}
            </ViewPanel>
          ))}
      </section>

      {loadState.status === 'ready' && (
        <DetailsPanel
          actorId={selectedActorId}
          filmIndex={selectedFilmIndex}
          indexes={loadState.indexes}
          open={detailsOpen}
          onClose={closeDetails}
        />
      )}
    </main>
  );
}
