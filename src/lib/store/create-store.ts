import { create } from 'zustand';
import type { Template } from '@/types/template';

interface CreateState {
  selectedTemplate: Template | null;
  selectTemplate: (template: Template) => void;
  reset: () => void;
}

export const useCreateStore = create<CreateState>((set) => ({
  selectedTemplate: null,
  selectTemplate: (template) => set({ selectedTemplate: template }),
  reset: () => set({ selectedTemplate: null }),
}));
