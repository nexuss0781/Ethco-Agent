import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { ChatHeader } from '../components/ChatHeader';
import { EmptyState } from '../components/EmptyState';
import { ChatMessageList } from '../components/ChatMessageList';
import { ChatInput } from '../components/ChatInput';
import { UpgradeModal } from '../components/UpgradeModal';
import { GitHubImportModal } from '../components/GitHubImportModal';
import { SettingsModal } from '../components/SettingsModal';
import { ImportedRepo, GitHubService, SelectedRepoContext } from '../lib/github';
import { Conversation, Message, Attachment, ModelOption, ActionMode, ToolInvocation } from '../types';
import { StorageService } from '../lib/storage';
import { AVAILABLE_MODELS } from '../constants/models';
import { getUser, signInWithGoogle, signInWithGithub, logout } from '../lib/auth';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    StorageService.getLocalConversations()
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => StorageService.getActiveConversationId() || conversations[0]?.id || null
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode>('planning');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Multi-select repositories state for AI Agent
  const [selectedRepos, setSelectedRepos] = useState<SelectedRepoContext[]>(() =>
    GitHubService.getSelectedRepos()
  );

  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleToggleSelectRepo = (repo: SelectedRepoContext) => {
    setSelectedRepos((prev) => {
      const exists = prev.some((r) => r.fullName === repo.fullName || r.name === repo.name);
      let updated: SelectedRepoContext[];
      if (exists) {
        // If same branch, remove; if branch changed, update branch
        const existing = prev.find((r) => r.fullName === repo.fullName || r.name === repo.name);
        if (existing && existing.branch !== repo.branch) {
          updated = prev.map((r) => (r.fullName === repo.fullName || r.name === repo.name ? repo : r));
        } else {
          updated = prev.filter((r) => r.fullName !== repo.fullName && r.name !== repo.name);
        }
      } else {
        updated = [...prev, repo];
      }
      GitHubService.saveSelectedRepos(updated);
      return updated;
    });
  };

  const handleSelectAllRepos = (reposToSelect: SelectedRepoContext[]) => {
    setSelectedRepos(reposToSelect);
    GitHubService.saveSelectedRepos(reposToSelect);
  };

  const handleClearSelectedRepos = () => {
    setSelectedRepos([]);
    GitHubService.saveSelectedRepos([]);
  };

  const handleRemoveSelectedRepo = (repoName: string) => {
    setSelectedRepos((prev) => {
      const updated = prev.filter((r) => r.name !== repoName && r.fullName !== repoName);
      GitHubService.saveSelectedRepos(updated);
      return updated;
    });
  };

  // Sync with server on initial mount for multi-session persistence and fetch user
  useEffect(() => {
    StorageService.syncFromServer().then((synced) => {
      if (synced && synced.length > 0) {
        setConversations(synced);
        if (!activeConversationId) {
          setActiveConversationId(synced[0].id);
        }
      }
    });
    
    getUser().then(usr => {
      if (usr) { setUser(usr); } else { navigate('/auth'); }
    });

    // Check if returned from GitHub OAuth redirect
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('github_auth') === 'success') {
      setIsSettingsModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [navigate]);

  // Global Keyboard shortcuts (Cmd+K / Ctrl+K for new chat, Esc to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
      if (e.key === 'Escape') {
        setIsUpgradeModalOpen(false);
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Get active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Start new chat
  const handleNewChat = () => {
    const newConvo = StorageService.createNewConversation('New Chat', "auto");
    setConversations(StorageService.getLocalConversations());
    setActiveConversationId(newConvo.id);
  };

  // Select conversation
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    StorageService.setActiveConversationId(id);
  };

  // Delete conversation
  const handleDeleteConversation = (id: string) => {
    const remaining = StorageService.deleteConversation(id);
    setConversations([...remaining]);
    if (activeConversationId === id) {
      setActiveConversationId(remaining[0]?.id || null);
    }
  };

  // Toggle pin
  const handleTogglePin = (id: string) => {
    const updated = StorageService.togglePin(id);
    setConversations([...updated]);
  };

  // Rename conversation
  const handleRenameConversation = (id: string, newTitle: string) => {
    const updated = StorageService.updateConversation(id, { title: newTitle });
    setConversations([...updated]);
  };

  // Stop active streaming generation
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // Send message flow
  const handleSendMessage = async (text: string, attachments: Attachment[] = [], mode?: ActionMode) => {
    if (!text && attachments.length === 0) return;

    const currentMode = mode || actionMode;
    let targetConvo = activeConversation;
    let isBrandNew = false;

    // If no active conversation or active has no messages, ensure target convo exists
    if (!targetConvo) {
      targetConvo = StorageService.createNewConversation('New Chat', "auto");
      isBrandNew = true;
      setActiveConversationId(targetConvo.id);
    }

    const userMessage: Message = {
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const assistantPlaceholderId = 'msg_ast_' + Date.now();
    const assistantMessage: Message = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      thinkingContent: thinkingEnabled
        ? `Reasoning step (${currentMode.toUpperCase()} mode): Analyzing inquiry in depth, evaluating core nuances, and formulating structured response...`
        : undefined,
      model: "auto",
    };

    const updatedMessages = [...(targetConvo.messages || []), userMessage, assistantMessage];
    const updatedConvo: Conversation = {
      ...targetConvo,
      messages: updatedMessages,
      updatedAt: Date.now(),
    };

    // Update local state immediately
    const updatedList = StorageService.updateConversation(targetConvo.id, updatedConvo);
    setConversations([...updatedList]);
    setIsLoading(true);

    // Abort previous if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Send conversation context to streaming API with selected repositories context
      const messagesForBackend = updatedMessages
        .slice(0, -1) // omit the empty placeholder
        .map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        }));

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesForBackend,
          thinkingEnabled,
          model: 'omniroute/auto',
          actionMode: currentMode,
          selectedRepos: selectedRepos.map((r) => ({
            name: r.name,
            fullName: r.fullName,
            branch: r.branch,
            cloneUrl: r.cloneUrl,
            isPrivate: r.isPrivate,
            language: r.language,
          })),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let accumulatedTools: ToolInvocation[] = [];

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.replace('data: ', '').trim();
                if (!jsonStr) continue;

                try {
                  const parsed = JSON.parse(jsonStr);

                  if (parsed.toolEvent) {
                    const evt = parsed.toolEvent;
                    if (evt.type === 'tool_start') {
                      accumulatedTools = [
                        ...accumulatedTools,
                        {
                          id: evt.id,
                          name: evt.name,
                          args: evt.args,
                          status: 'running',
                          timestamp: Date.now(),
                        },
                      ];
                    } else if (evt.type === 'tool_finish') {
                      accumulatedTools = accumulatedTools.map((t) =>
                        t.id === evt.id
                          ? { ...t, result: evt.result, status: evt.result?.error ? 'error' : 'completed' }
                          : t
                      );
                    }

                    // Update UI state with new tool call state
                    setConversations((prevConvos) =>
                      prevConvos.map((c) => {
                        if (c.id === targetConvo?.id) {
                          const msgs = c.messages.map((m) =>
                            m.id === assistantPlaceholderId
                              ? { ...m, toolInvocations: [...accumulatedTools], isStreaming: true }
                              : m
                          );
                          return { ...c, messages: msgs, updatedAt: Date.now() };
                        }
                        return c;
                      })
                    );
                  } else if (parsed.text) {
                    accumulatedText += parsed.text;

                    // Update streaming message in state
                    setConversations((prevConvos) =>
                      prevConvos.map((c) => {
                        if (c.id === targetConvo?.id) {
                          const msgs = c.messages.map((m) =>
                            m.id === assistantPlaceholderId
                              ? {
                                  ...m,
                                  content: accumulatedText,
                                  toolInvocations: [...accumulatedTools],
                                  isStreaming: true,
                                }
                              : m
                          );
                          return { ...c, messages: msgs, updatedAt: Date.now() };
                        }
                        return c;
                      })
                    );
                  } else if (parsed.error) {
                    if (!accumulatedText) {
                      accumulatedText = parsed.error;
                    } else {
                      accumulatedText += `\n\n*(Note: ${parsed.error})*`;
                    }
                  }
                } catch (err) {
                  // ignore JSON parse error in intermediate chunks
                }
              }
            }
          }
        }
      }

      // Mark streaming done and save to persistent storage
      const finalizedMessages = updatedMessages.map((m) =>
        m.id === assistantPlaceholderId
          ? {
              ...m,
              content: accumulatedText || 'I am ready to help. What shall we think through next?',
              toolInvocations: accumulatedTools.length > 0 ? accumulatedTools : undefined,
              isStreaming: false,
            }
          : m
      );

      const finalizedConvo: Conversation = {
        ...targetConvo,
        messages: finalizedMessages,
        updatedAt: Date.now(),
      };

      StorageService.updateConversation(targetConvo.id, finalizedConvo);
      setConversations(StorageService.getLocalConversations());

      // If this was the first turn or title is default, generate an intelligent title
      if (
        (isBrandNew || targetConvo.title === 'New Chat' || targetConvo.title === 'New Conversation') &&
        text.trim()
      ) {
        fetch('/api/chat/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: text,
            assistantMessage: accumulatedText.substring(0, 100),
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.title) {
              handleRenameConversation(targetConvo.id, data.title);
            }
          })
          .catch((e) => console.warn('Title generation error:', e));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream generation aborted by user.');
      } else {
        console.error('Chat error:', error);
        // Display friendly error in assistant bubble
        setConversations((prevConvos) =>
          prevConvos.map((c) => {
            if (c.id === targetConvo?.id) {
              const msgs = c.messages.map((m) =>
                m.id === assistantPlaceholderId
                  ? {
                      ...m,
                      content: `I encountered an issue connecting to the reasoning service. Please verify network connectivity and try again.\n\n*Error details: ${error.message}*`,
                      isStreaming: false,
                    }
                  : m
              );
              return { ...c, messages: msgs };
            }
            return c;
          })
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Regenerate last assistant response
  const handleRegenerate = () => {
    if (!activeConversation || activeConversation.messages.length === 0) return;
    let lastUserIndex = -1;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      if (activeConversation.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;

    const lastUserMessage = activeConversation.messages[lastUserIndex];
    // Trim back messages up to the user message
    const trimmedMessages = activeConversation.messages.slice(0, lastUserIndex);
    const updatedConvo: Conversation = {
      ...activeConversation,
      messages: trimmedMessages,
    };
    StorageService.updateConversation(activeConversation.id, updatedConvo);
    setConversations(StorageService.getLocalConversations());

    // Resend user message
    handleSendMessage(lastUserMessage.content, lastUserMessage.attachments || []);
  };

  const hasMessages = Boolean(activeConversation && activeConversation.messages.length > 0);

  // Extract active plan / todos if agent planned tasks in this conversation
  const activeTodos = React.useMemo(() => {
    if (!activeConversation || !activeConversation.messages) return null;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      const msg = activeConversation.messages[i];
      if (msg.toolInvocations) {
        for (let j = msg.toolInvocations.length - 1; j >= 0; j--) {
          const tool = msg.toolInvocations[j];
          if (tool.name === 'todowrite' && (tool.result?.todos || tool.args?.todos)) {
            const list = tool.result?.todos || tool.args?.todos;
            if (Array.isArray(list) && list.length > 0) {
              return {
                todos: list,
                summary: tool.result?.summary,
              };
            }
          }
        }
      }
    }
    return null;
  }, [activeConversation]);

  const handleSelectRepoForChat = (repo: ImportedRepo, initialPrompt?: string) => {
    const prompt = initialPrompt || `I've imported repository \`${repo.name}\` at \`${repo.path}\` (branch: \`${repo.branch}\`). Please inspect its code structure and help me build features or debug it.`;
    handleSendMessage(prompt, []);
  };

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full overflow-hidden bg-[#181816] text-[#ecece7]">
      {/* Responsive Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onTogglePin={handleTogglePin}
        onRenameConversation={handleRenameConversation}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
        onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        user={user}
        onLoginGoogle={signInWithGoogle}
        onLoginGithub={signInWithGithub}
        onLogout={logout}
      />

      {/* Main Conversation Stage */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-[#181816]">
        {/* Top Header */}
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewChat={handleNewChat}
          thinkingEnabled={thinkingEnabled}
          onToggleThinking={() => setThinkingEnabled(!thinkingEnabled)}
          onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
          onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
          onSelectRepoForChat={handleSelectRepoForChat}
          selectedReposList={selectedRepos}
          onToggleSelectRepo={handleToggleSelectRepo}
        />

        {/* Center Area: Empty State OR Message Stream */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
          {!hasMessages ? (
            <div className="flex-1 flex flex-col justify-center items-center px-3 sm:px-4 min-h-0 overflow-y-auto">
              <div className="w-full max-w-2xl flex flex-col items-center justify-center my-auto py-2">
                <EmptyState onSelectPrompt={(prompt) => handleSendMessage(prompt, [])} />
              </div>
            </div>
          ) : (
            <ChatMessageList
              messages={activeConversation?.messages || []}
              onRegenerate={handleRegenerate}
              isLoading={isLoading}
            />
          )}

          {/* Bottom Chat Input Card */}
          <div className="shrink-0 w-full z-10">
            <ChatInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              onStopGeneration={handleStopGeneration}
          thinkingEnabled={thinkingEnabled}
              actionMode={actionMode}
              onSelectActionMode={setActionMode}
              activeTodos={activeTodos}
              selectedRepos={selectedRepos}
              onRemoveSelectedRepo={handleRemoveSelectedRepo}
              onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
            />
          </div>
        </div>
      </main>

      {/* Upgrade Plan Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />

      {/* GitHub Authorization & Repository Multi-Select Modal */}
      <GitHubImportModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        onSelectRepoForChat={handleSelectRepoForChat}
        selectedReposList={selectedRepos}
        onToggleSelectRepo={handleToggleSelectRepo}
        onSelectAllRepos={handleSelectAllRepos}
        onClearSelectedRepos={handleClearSelectedRepos}
      />

      {/* Settings Modal (GitHub Authorization & Persistence) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        user={user}
      />
    </div>
  );
}
