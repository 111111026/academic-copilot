'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, PROVIDER_PRESETS } from '@/config/settings';
import type { Settings, LlmProvider } from '@/types/settings';

interface SettingsStore {
  settings: Settings;
  updateLlm: (partial: Partial<Settings['llm']>) => void;
  updateUi: (partial: Partial<Settings['ui']>) => void;
  setProvider: (provider: LlmProvider) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateLlm: (partial) =>
        set((s) => ({ settings: { ...s.settings, llm: { ...s.settings.llm, ...partial } } })),
      updateUi: (partial) =>
        set((s) => ({ settings: { ...s.settings, ui: { ...s.settings.ui, ...partial } } })),
      setProvider: (provider) =>
        set((s) => ({
          settings: {
            ...s.settings,
            llm: {
              ...s.settings.llm,
              provider,
              baseUrl: PROVIDER_PRESETS[provider].baseUrl || s.settings.llm.baseUrl,
              model: PROVIDER_PRESETS[provider].defaultModel || s.settings.llm.model,
            },
          },
        })),
    }),
    { name: 'ac-settings' },
  ),
);
