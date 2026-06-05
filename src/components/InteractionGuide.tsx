import type { MarkovStage } from '../data/types';
import './InteractionGuide.css';

interface InteractionGuideProps {
  totalActors: number;
  cohortActorCount: number;
  dominantClusterId: number | null;
  selectedActorName: string | null;
  selectedFilmIndex: number | null;
  stage: MarkovStage;
  filtersActive: boolean;
  detailsOpen: boolean;
}

export function InteractionGuide({
  totalActors,
  cohortActorCount,
  dominantClusterId,
  selectedActorName,
  selectedFilmIndex,
  stage,
  filtersActive,
  detailsOpen,
}: InteractionGuideProps) {
  const hasCohort = cohortActorCount !== totalActors;
  const hasSelection = selectedActorName !== null;
  const cohortStatus = hasCohort
    ? `${cohortActorCount} actors · cluster ${dominantClusterId ?? 'n/a'}`
    : `${totalActors} actors · global`;
  const selectionStatus = hasSelection
    ? `${selectedActorName}${selectedFilmIndex !== null ? ` · N${selectedFilmIndex}` : ''}`
    : 'none selected';
  const detailStatus = detailsOpen ? 'details open' : 'details closed';

  return (
    <section
      className="interaction-guide"
      aria-label="Current linked analysis queue"
      aria-live="polite"
    >
      <div className="interaction-guide__label">Linked Queue</div>
      <div className="interaction-guide__items">
        <GuideItem
          title="A→B/D"
          status={`${cohortStatus} · ${stage}`}
          hint="Brush A"
          active={hasCohort}
        />
        <GuideItem
          title="A/B→C"
          status={`${selectionStatus} · ${detailStatus}`}
          hint="Select actor or peak"
          active={hasSelection}
        />
        <GuideItem
          title="C Filter"
          status={filtersActive ? 'controls constrained' : 'all controls'}
          hint="Adjust sliders"
          active={filtersActive}
        />
      </div>
    </section>
  );
}

function GuideItem({
  title,
  status,
  hint,
  active,
}: {
  title: string;
  status: string;
  hint: string;
  active: boolean;
}) {
  return (
    <div className={`interaction-guide__item${active ? ' is-active' : ''}`}>
      <span className="interaction-guide__title">{title}</span>
      <span className="interaction-guide__status">{status}</span>
      <span className="interaction-guide__hint">{hint}</span>
    </div>
  );
}
