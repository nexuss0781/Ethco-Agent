import { ModelOption } from '../types';

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'claude-3-7-sonnet',
    name: 'Sonnet 3.7',
    versionBadge: 'Latest · Hybrid Thinking',
    description: 'Most intelligent model with dynamic reasoning and state-of-the-art coding.',
    thinkingSupported: true,
    geminiModel: 'gemini-flash-latest',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Sonnet 3.5',
    versionBadge: 'High Intelligence',
    description: 'Fast, articulate, and highly capable for everyday reasoning.',
    thinkingSupported: true,
    geminiModel: 'gemini-flash-latest',
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Haiku 3.5',
    versionBadge: 'Ultra Fast',
    description: 'Rapid response time for quick drafting and lightweight tasks.',
    thinkingSupported: false,
    geminiModel: 'gemini-3.1-flash-lite',
  },
  {
    id: 'claude-3-opus',
    name: 'Opus 3',
    versionBadge: 'Deep Analysis',
    description: 'Specialized for long-form prose and deep conceptual analysis.',
    thinkingSupported: true,
    geminiModel: 'gemini-flash-latest',
  },
];
