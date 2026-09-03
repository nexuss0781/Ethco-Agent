import { ModelOption } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'ethco-1.0-instant',
    name: 'Ethco 1.0 instant',
    versionBadge: 'Fast',
    description: 'Earliest possible first token via OmniRouter fast routing.',
    thinkingSupported: true,
    geminiModel: 'omniroute/agent-fast',
  },
  {
    id: 'ethco-1.0',
    name: 'Ethco 1.0',
    versionBadge: 'Balanced',
    description: 'Balanced provider startup time and model quality.',
    thinkingSupported: true,
    geminiModel: 'omniroute/agent-balanced',
  },
  {
    id: 'ethco-1.0-max',
    name: 'Ethco 1.0 max',
    versionBadge: 'Quality',
    description: 'Escalates through quality candidates for the strongest responses.',
    thinkingSupported: true,
    geminiModel: 'omniroute/quality',
  },
];
