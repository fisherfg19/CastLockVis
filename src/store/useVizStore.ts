import { create } from 'zustand';
import type { MarkovStage } from '../data/types';

export interface AlignmentFilters {
  directorHeterogeneity: [number, number];
  rating: [number, number];
  numVotes: [number, number];
}

export interface DetailsPanelPosition {
  x: number;
  y: number;
}

interface VizState {
  brushedActorIds: Set<string>;
  selectedActorId: string | null;
  selectedFilmIndex: number | null;
  markovStage: MarkovStage;
  alignmentFilters: AlignmentFilters;
  detailsOpen: boolean;
  detailsPanelPosition: DetailsPanelPosition;
  setBrush: (actorIds: Iterable<string>) => void;
  clearBrush: () => void;
  selectActor: (actorId: string | null) => void;
  selectSpike: (filmIndex: number | null) => void;
  setMarkovStage: (stage: MarkovStage) => void;
  setAlignmentFilter: <K extends keyof AlignmentFilters>(
    key: K,
    value: AlignmentFilters[K],
  ) => void;
  openDetails: () => void;
  closeDetails: () => void;
  moveDetailsPanel: (delta: DetailsPanelPosition) => void;
  resetDetailsPanelPosition: () => void;
}

const DEFAULT_ALIGNMENT_FILTERS: AlignmentFilters = {
  directorHeterogeneity: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
  rating: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
  numVotes: [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
};

export const useVizStore = create<VizState>((set) => ({
  brushedActorIds: new Set<string>(),
  selectedActorId: null,
  selectedFilmIndex: null,
  markovStage: 'early',
  alignmentFilters: DEFAULT_ALIGNMENT_FILTERS,
  detailsOpen: false,
  detailsPanelPosition: { x: 0, y: 0 },
  setBrush: (actorIds) => set({ brushedActorIds: new Set(actorIds) }),
  clearBrush: () => set({ brushedActorIds: new Set() }),
  selectActor: (actorId) => set({ selectedActorId: actorId }),
  selectSpike: (filmIndex) => set({ selectedFilmIndex: filmIndex }),
  setMarkovStage: (stage) => set({ markovStage: stage }),
  setAlignmentFilter: (key, value) =>
    set((state) => ({
      alignmentFilters: {
        ...state.alignmentFilters,
        [key]: value,
      },
    })),
  openDetails: () => set({ detailsOpen: true }),
  closeDetails: () => set({ detailsOpen: false }),
  moveDetailsPanel: (delta) =>
    set((state) => ({
      detailsPanelPosition: {
        x: state.detailsPanelPosition.x + delta.x,
        y: state.detailsPanelPosition.y + delta.y,
      },
    })),
  resetDetailsPanelPosition: () => set({ detailsPanelPosition: { x: 0, y: 0 } }),
}));
