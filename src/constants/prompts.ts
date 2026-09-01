import { PromptSuggestion } from '../types';

export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  {
    id: 'write',
    label: 'Write',
    iconName: 'PenLine',
    prompt: 'Help me draft an insightful essay on the evolution of distributed systems and autonomous AI agents.',
    category: 'Write',
  },
  {
    id: 'learn',
    label: 'Learn',
    iconName: 'GraduationCap',
    prompt: 'Explain how vector embeddings and cosine similarity search work in semantic search applications.',
    category: 'Learn',
  },
  {
    id: 'code',
    label: 'Code',
    iconName: 'Code2',
    prompt: 'Write a clean TypeScript implementation of an LRU Cache with O(1) get and put operations.',
    category: 'Code',
  },
  {
    id: 'life-stuff',
    label: 'Life stuff',
    iconName: 'Coffee',
    prompt: 'Give me a structured weekly workout and nutrition plan focused on progressive strength training and stamina.',
    category: 'Life stuff',
  },
  {
    id: 'ethcos-choice',
    label: "Ethco's choice",
    iconName: 'Lightbulb',
    prompt: 'Synthesize the most promising technological breakthroughs in clean energy and compute infrastructure.',
    category: "Ethco's choice",
  },
];
