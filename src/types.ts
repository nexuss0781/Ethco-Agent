export type ActionMode = 'planning' | 'build' | 'chat';

export interface ToolInvocation {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'completed' | 'error';
  timestamp?: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'file';
  mimeType: string;
  data: string; // Base64 or text preview
  size?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  thinkingContent?: string;
  toolInvocations?: ToolInvocation[];
  isStreaming?: boolean;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  isPinned?: boolean;
  tags?: string[];
  model?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  versionBadge: string;
  description: string;
  thinkingSupported: boolean;
  geminiModel: string;
}

export interface PromptSuggestion {
  id: string;
  label: string;
  iconName: string;
  prompt: string;
  category: 'Write' | 'Learn' | 'Code' | 'Life stuff' | "Claude's choice" | "Ethco's choice";
  subtitle?: string;
}
