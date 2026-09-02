import { ModelOption } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'omniroute-auto',
    name: 'OmniRoute (Auto)',
    versionBadge: 'Dynamic',
    description: 'Automatically routes to the best available live model via OmniRoute.',
    thinkingSupported: true,
    geminiModel: 'omniroute/auto',
  },
];
