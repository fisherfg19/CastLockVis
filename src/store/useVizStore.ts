import { create } from 'zustand';
import type { MarkovStage } from '../data/types';

export interface AlignmentFilters {
  directorHeterogeneity: [number, number];
  rating: [number, number];
  numVotes: [number, number];
}

interface VizState {
  brushedActorIds: Set<string>;
  selectedActorId: string | null;
  selectedFilmIndex: number | null;
  markovStage: MarkovStage;
  alignmentFilters: AlignmentFilters;
  detailsOpen: boolean;
  setBrush: (actorIds: Iterable<string>) => void;
  clearBrush: () => void;
  selectActor: (actorId: string | null) => void;
  selectSpike: (filmIndex: number | null) => void;
  clearSelection: () => void;
  setMarkovStage: (stage: MarkovStage) => void;
  setAlignmentFilter: <K extends keyof AlignmentFilters>(
    key: K,
    value: AlignmentFilters[K],
  ) => void;
  resetAlignmentFilters: () => void;
  openDetails: () => void;
  closeDetails: () => void;
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
  setBrush: (actorIds) => set({ brushedActorIds: new Set(actorIds) }),
  clearBrush: () => set({ brushedActorIds: new Set() }),
  selectActor: (actorId) => set({ selectedActorId: actorId }),
  selectSpike: (filmIndex) => set({ selectedFilmIndex: filmIndex }),
  clearSelection: () =>
    set({
      selectedActorId: null,
      selectedFilmIndex: null,
      detailsOpen: false,
    }),
  setMarkovStage: (stage) => set({ markovStage: stage }),
  setAlignmentFilter: (key, value) =>
    set((state) => ({
      alignmentFilters: {
        ...state.alignmentFilters,
        [key]: value,
      },
    })),
  resetAlignmentFilters: () => set({ alignmentFilters: DEFAULT_ALIGNMENT_FILTERS }),
  openDetails: () => set({ detailsOpen: true }),
  closeDetails: () => set({ detailsOpen: false }),
}));
