import { PromptSuggestion } from '../types';

export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  {
    id: 'write-1',
    label: 'Write',
    iconName: 'PenLine',
    category: 'Write',
    prompt: 'Help me draft an engaging, well-structured essay arguing why thoughtful constraint drives creative breakthroughs in architecture and software design.',
    subtitle: 'Draft essays, stories, emails, or memos',
  },
  {
    id: 'learn-1',
    label: 'Learn',
    iconName: 'GraduationCap',
    category: 'Learn',
    prompt: 'Explain the intuition behind how Transformers and Self-Attention mechanisms work, using a vivid analogy of an orchestra or discussion table.',
    subtitle: 'Deep dive into complex topics and concepts',
  },
  {
    id: 'code-1',
    label: 'Code',
    iconName: 'Code2',
    category: 'Code',
    prompt: 'Write an elegant, type-safe implementation of an async concurrent worker pool with rate-limiting and retry logic in TypeScript.',
    subtitle: 'Design algorithms, debug, and review architectures',
  },
  {
    id: 'life-1',
    label: 'Life stuff',
    iconName: 'Coffee',
    category: 'Life stuff',
    prompt: 'Help me build a realistic, energizing 4-week habit routine that balances deep work blocks, recovery, and mindful daily breaks.',
    subtitle: 'Plan routines, draft polite communications, organize goals',
  },
  {
    id: 'choice-1',
    label: "Ethco's choice",
    iconName: 'Lightbulb',
    category: "Ethco's choice",
    prompt: 'Walk me through an intriguing philosophical thought experiment about identity and continuity (like the Ship of Theseus or Star Trek Teleporter), and examine its modern implications for AI and consciousness.',
    subtitle: 'Curated philosophical and creative inquiries',
  },
];
