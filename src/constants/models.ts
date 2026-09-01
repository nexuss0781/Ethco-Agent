import { ModelOption } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'ethco-3-7-sonnet',
    name: 'Ethco 3.7 Sonnet',
    versionBadge: 'Hybrid Reasoning',
    description: 'Most intelligent model with dynamic extended thinking and coding capabilities.',
    thinkingSupported: true,
    geminiModel: 'gemini-2.5-flash',
  },
  {
    id: 'ethco-3-5-sonnet',
    name: 'Ethco 3.5 Sonnet',
    versionBadge: 'Fast & Precise',
    description: 'Balanced intelligence and speed for general tasks and rapid code generation.',
    thinkingSupported: false,
    geminiModel: 'gemini-2.5-flash',
  },
  {
    id: 'ethco-3-5-haiku',
    name: 'Ethco 3.5 Haiku',
    versionBadge: 'Instant Speed',
    description: 'Lightweight model designed for sub-second responses and quick queries.',
    thinkingSupported: false,
    geminiModel: 'gemini-2.5-flash',
  },
  {
    id: 'ethco-3-opus',
    name: 'Ethco 3 Opus',
    versionBadge: 'Deep Analysis',
    description: 'Comprehensive reasoning model for complex architecture and deep writing.',
    thinkingSupported: true,
    geminiModel: 'gemini-2.5-pro',
  },
];
