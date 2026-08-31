import { Conversation } from '../types';

const STORAGE_KEY = 'claude_chatbot_conversations_v1';
const ACTIVE_CONVO_KEY = 'claude_chatbot_active_id_v1';

// Seed demo conversations if first-time user
const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'seed-conv-1',
    title: 'Architecting Clean Full-Stack Microservices',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    isPinned: true,
    model: 'claude-3-7-sonnet',
    messages: [
      {
        id: 'msg-1-1',
        role: 'user',
        content: 'What are the key architectural trade-offs between monolithic modularity and event-driven microservices for a high-growth SaaS platform?',
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
      },
      {
        id: 'msg-1-2',
        role: 'assistant',
        content: `When evaluating **modular monoliths** versus **event-driven microservices**, the core decision centers on operational complexity, team boundaries, and velocity.

### 1. The Modular Monolith Advantage
- **Zero Network Latency**: In-memory function calls rather than RPC/HTTP serializations.
- **Single Deployment Pipeline**: Atomic updates without distributed migration orchestration.
- **Transactional Consistency**: Native ACID database transactions across domain boundaries.

### 2. When Event-Driven Microservices Excel
- **Independent Scaling Vectors**: Decoupling compute-heavy workflows (e.g. video processing) from high-throughput read paths.
- **Autonomous Team Ownership**: Conway's Law in practice—each engineering squad manages their own schema lifecycle.
- **Fault Isolation**: Cascading failure prevention with asynchronous dead-letter queues.

> **Recommendation**: Start with a strictly bounded modular monolith using domain-driven design (DDD). Extract services only when team size or distinct scaling characteristics demand independent deployment units.`,
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2 + 1000 * 15,
        thinkingContent: 'Analyzed domain-driven boundaries, Conway\'s Law, distributed transactions, and practical engineering trade-offs.',
      },
    ],
  },
  {
    id: 'seed-conv-2',
    title: 'Exploration of Consciousness & Epistemology',
    createdAt: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    updatedAt: Date.now() - 1000 * 60 * 60 * 5,
    isPinned: false,
    model: 'claude-3-7-sonnet',
    messages: [
      {
        id: 'msg-2-1',
        role: 'user',
        content: 'Can you explore the concept of Qualia and why the "Hard Problem" of consciousness remains so philosophically elusive?',
        timestamp: Date.now() - 1000 * 60 * 60 * 5,
      },
      {
        id: 'msg-2-2',
        role: 'assistant',
        content: `The **Hard Problem of Consciousness**, coined by philosopher David Chalmers in 1995, contrasts sharply with the "easy problems" of cognitive neuroscience.

### The Contrast
- **Easy Problems**: Explaining how the brain integrates information, categorizes sensory stimuli, focuses attention, and generates motor responses. These are functionally tractable through neural correlates.
- **The Hard Problem**: Why should all this physical information processing be accompanied by an inner subjective life? Why does it *feel like something* to see the redness of a sunset or feel the sting of cold water?

### The Elusiveness of Qualia
*Qualia* are the raw, subjective properties of experiential states. Even if we map every synapse firing in the visual cortex when observing a rose, an explanatory gap remains between the objective electro-chemical substrate and the subjective qualitative experience.

This tension sits at the frontier of philosophy of mind, physicalism, and panpsychism.`,
        timestamp: Date.now() - 1000 * 60 * 60 * 5 + 1000 * 12,
        thinkingContent: 'Framed David Chalmers\' distinction between functional computation and phenomenal consciousness.',
      },
    ],
  },
];

let syncTimeout: any = null;

export const StorageService = {
  // Get all conversations from LocalStorage
  getLocalConversations(): Conversation[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
    // Fallback to seed data and store it
    this.saveLocalConversations(SEED_CONVERSATIONS);
    return SEED_CONVERSATIONS;
  },

  // Save conversations to LocalStorage and trigger server sync
  saveLocalConversations(conversations: Conversation[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      this.triggerServerSync(conversations);
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  },

  // Server sync for persistent cross-session storage
  triggerServerSync(conversations: Conversation[]) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      try {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversations }),
        });
      } catch (err) {
        console.warn('Server sync deferred:', err);
      }
    }, 800);
  },

  // Fetch from server on app load to merge
  async syncFromServer(): Promise<Conversation[]> {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.conversations) && data.conversations.length > 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.conversations));
          return data.conversations;
        }
      }
    } catch (e) {
      console.warn('Server fetch unavailable, using local:', e);
    }
    return this.getLocalConversations();
  },

  // Active conversation ID
  getActiveConversationId(): string | null {
    return localStorage.getItem(ACTIVE_CONVO_KEY);
  },

  setActiveConversationId(id: string | null) {
    if (id) {
      localStorage.setItem(ACTIVE_CONVO_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CONVO_KEY);
    }
  },

  // Create new conversation
  createNewConversation(initialTitle = 'New Chat', model = 'claude-3-7-sonnet'): Conversation {
    const newConvo: Conversation = {
      id: 'convo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: initialTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      isPinned: false,
      model,
    };

    const convos = this.getLocalConversations();
    const updated = [newConvo, ...convos];
    this.saveLocalConversations(updated);
    this.setActiveConversationId(newConvo.id);
    return newConvo;
  },

  // Update existing conversation
  updateConversation(id: string, updates: Partial<Conversation>): Conversation[] {
    const convos = this.getLocalConversations();
    const index = convos.findIndex((c) => c.id === id);
    if (index !== -1) {
      convos[index] = {
        ...convos[index],
        ...updates,
        updatedAt: Date.now(),
      };
      this.saveLocalConversations(convos);
    }
    return convos;
  },

  // Delete conversation
  deleteConversation(id: string): Conversation[] {
    const convos = this.getLocalConversations();
    const filtered = convos.filter((c) => c.id !== id);
    this.saveLocalConversations(filtered);
    if (this.getActiveConversationId() === id) {
      this.setActiveConversationId(filtered[0]?.id || null);
    }
    return filtered;
  },

  // Toggle pin
  togglePin(id: string): Conversation[] {
    const convos = this.getLocalConversations();
    const index = convos.findIndex((c) => c.id === id);
    if (index !== -1) {
      convos[index].isPinned = !convos[index].isPinned;
      this.saveLocalConversations(convos);
    }
    return convos;
  },

  // Export conversation as Markdown
  exportConversationMarkdown(convo: Conversation) {
    let md = `# ${convo.title}\n\n*Date: ${new Date(convo.createdAt).toLocaleString()}*\n\n---\n\n`;
    for (const msg of convo.messages) {
      const sender = msg.role === 'user' ? '👤 User' : '✳ Claude';
      md += `### ${sender}\n\n${msg.content}\n\n---\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${convo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'chat'}.md`;
    link.click();
    URL.revokeObjectURL(url);
  },

  // Export all conversations as JSON
  exportAllJson(conversations: Conversation[]) {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(conversations, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `claude_conversations_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  },
};
