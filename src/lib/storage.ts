import { Conversation } from '../types';
import { isSupabaseConfigured, saveToSupabase, loadFromSupabase } from './supabase';

const STORAGE_KEY = 'claude_chatbot_conversations_v1';
const ACTIVE_CONVO_KEY = 'claude_chatbot_active_id_v1';

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
    return [];
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

      if (isSupabaseConfigured) {
        try {
          await saveToSupabase('conversations', { id: 'user_conversations', data: conversations, updated_at: new Date().toISOString() });
        } catch (sbErr) {
          console.warn('Supabase sync deferred:', sbErr);
        }
      }
    }, 800);
  },

  // Fetch from server on app load to merge
  async syncFromServer(): Promise<Conversation[]> {
    if (isSupabaseConfigured) {
      try {
        const sbData = await loadFromSupabase('conversations');
        if (sbData && sbData.length > 0 && sbData[0].data) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sbData[0].data));
          return sbData[0].data;
        }
      } catch (sbErr) {
        console.warn('Supabase load fallback:', sbErr);
      }
    }

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
      const sender = msg.role === 'user' ? '👤 User' : '✳ Ethco';
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
