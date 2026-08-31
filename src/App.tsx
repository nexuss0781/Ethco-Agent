import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatHeader } from './components/ChatHeader';
import { EmptyState } from './components/EmptyState';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatInput } from './components/ChatInput';
import { UpgradeModal } from './components/UpgradeModal';
import { Conversation, Message, Attachment, ModelOption, ActionMode, ToolInvocation } from './types';
import { StorageService } from './lib/storage';
import { AVAILABLE_MODELS } from './data/models';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    StorageService.getLocalConversations()
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => StorageService.getActiveConversationId() || conversations[0]?.id || null
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(AVAILABLE_MODELS[0]);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode>('planning');
  const [isLoading, setIsLoading] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync with server on initial mount for multi-session persistence
  useEffect(() => {
    StorageService.syncFromServer().then((synced) => {
      if (synced && synced.length > 0) {
        setConversations(synced);
        if (!activeConversationId) {
          setActiveConversationId(synced[0].id);
        }
      }
    });
  }, []);

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
  }, []);

  // Get active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  // Start new chat
  const handleNewChat = () => {
    const newConvo = StorageService.createNewConversation('New Chat', selectedModel.id);
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
      targetConvo = StorageService.createNewConversation('New Chat', selectedModel.id);
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
      model: selectedModel.id,
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
      // Send conversation context to streaming API
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
          model: selectedModel.geminiModel,
          actionMode: currentMode,
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#181816] text-[#ecece7]">
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
      />

      {/* Main Conversation Stage */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-[#181816]">
        {/* Top Header */}
        <ChatHeader
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNewChat={handleNewChat}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          thinkingEnabled={thinkingEnabled}
          onToggleThinking={() => setThinkingEnabled(!thinkingEnabled)}
          onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
        />

        {/* Center Area: Empty State OR Message Stream */}
        <div className="flex-1 overflow-hidden flex flex-col justify-between">
          {!hasMessages ? (
            <div className="flex-1 overflow-y-auto flex items-center justify-center">
              <EmptyState onSelectPrompt={(prompt) => handleSendMessage(prompt, [])} />
            </div>
          ) : (
            <ChatMessageList
              messages={activeConversation?.messages || []}
              onRegenerate={handleRegenerate}
              isLoading={isLoading}
            />
          )}

          {/* Bottom Chat Input Card */}
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            onStopGeneration={handleStopGeneration}
            selectedModel={selectedModel}
            onOpenModelSelector={() => {}}
            thinkingEnabled={thinkingEnabled}
            actionMode={actionMode}
            onSelectActionMode={setActionMode}
          />
        </div>
      </main>

      {/* Upgrade Plan Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
      />
    </div>
  );
}
