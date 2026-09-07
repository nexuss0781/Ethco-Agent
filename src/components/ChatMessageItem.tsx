import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Copy,
  Check,
  Volume2,
  VolumeX,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Brain,
  FileText,
  User,
} from 'lucide-react';
import { Message } from '../types';
import { ToolInvocationsList } from './ToolInvocationsList';

interface ChatMessageItemProps {
  message: Message;
  onRegenerate?: () => void;
  isLatestAssistant?: boolean;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onBranchVersion?: (messageId: string, newIndex: number) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onRegenerate,
  isLatestAssistant = false,
  onEditMessage,
  onRetryMessage,
  onBranchVersion,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');

  const isUser = message.role === 'user';

  const versions = isUser && Array.isArray(message.versions) && message.versions.length > 1
    ? message.versions
    : null;
  const versionIndex = versions ? Math.max(0, Math.min(message.versionIndex ?? versions.length - 1, versions.length - 1)) : null;

  // Copy full message content
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Copy specific code block
  const handleCopyCode = (codeText: string, id: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const startEdit = () => {
    setEditDraft(message.content);
    setEditing(true);
  };

  const saveEdit = () => {
    if (!onEditMessage) return;
    onEditMessage(message.id, editDraft);
    setEditing(false);
  };

  // Text to Speech playback using Web Speech API
  const handleToggleSpeech = () => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div
      id={`message-${message.id}`}
      className={`group w-full py-4 sm:py-5 px-3 sm:px-6 transition-colors ${
        isUser ? 'flex justify-end' : 'flex justify-start'
      }`}
    >
      <div className={`w-full max-w-4xl flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-7 h-7 rounded-full bg-surface-2 border border-line flex items-center justify-center text-fg-soft">
              <User className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="relative w-7 h-7 flex items-center justify-center">
              <img
                src="/assets/Todo.png"
                alt="Ethco"
                className="w-8 h-8 object-contain -ml-0.5"
              />
            </div>
          )}
        </div>

        {/* Message Content Container */}
        <div className={`flex flex-col min-w-0 flex-1 ${isUser ? 'items-end' : 'items-start'}`}>
          {/* User Attached Images or Files */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="rounded-xl overflow-hidden border border-line bg-surface max-w-[200px]"
                >
                  {att.type === 'image' ? (
                    <img
                      src={att.data}
                      alt={att.name}
                      className="max-h-48 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="p-2.5 flex items-center gap-2 text-xs text-fg">
                      <FileText className="w-4 h-4 text-teal" />
                      <span className="truncate">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reasoning / Thinking Process Accordion (if available) */}
          {!isUser && message.thinkingContent && (
            <div className="w-full mb-3 rounded-xl bg-surface border border-line-soft overflow-hidden text-xs">
              <button
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-teal" />
                  <span>Thinking process</span>
                </div>
                {thinkingExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {thinkingExpanded && (
                <div className="px-3.5 py-2.5 bg-canvas border-t border-line-soft text-fg-soft leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
                  {message.thinkingContent}
                </div>
              )}
            </div>
          )}

          {/* Tool Invocations (view_file, create_file, edit_file, etc.) */}
          {!isUser && message.toolInvocations && message.toolInvocations.length > 0 && (
            <ToolInvocationsList tools={message.toolInvocations} />
          )}

          {/* Message Body */}
          {isUser && editing ? (
            <div className="w-full max-w-[85%] flex flex-col items-end gap-2">
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false);
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveEdit();
                }}
                rows={Math.min(8, Math.max(2, editDraft.split('\n').length))}
                className="w-full resize-y rounded-2xl bg-canvas border border-brand/60 text-fg text-sm sm:text-[15px] leading-relaxed p-3 focus:outline-none focus:ring-2 focus:ring-brand/30"
                aria-label="Edit prompt"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand text-on-brand hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save &amp; Regenerate
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-fg-soft hover:text-fg hover:bg-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              {editDraft.trim() === '' && (
                <span className="text-[11px] text-fg-muted">Empty edit erases this prompt and all later history.</span>
              )}
            </div>
          ) : (
            <div
              className={`text-sm sm:text-[15px] leading-relaxed ${
                isUser
                  ? 'px-4 py-3 rounded-2xl bg-surface-2 text-fg border border-line max-w-[85%] whitespace-pre-wrap'
                  : 'w-full text-fg'
              }`}
            >
              {isUser ? (
                message.content
              ) : (
              <div className="markdown-body">
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      const codeId = `code_${Math.random().toString(36).substr(2, 6)}`;

                      if (!inline && match) {
                        return (
                          <div className="relative my-3 rounded-xl overflow-hidden border border-line bg-canvas-deep">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line-soft text-xs text-fg-muted">
                              <span className="font-mono text-[11px] lowercase">
                                {match[1]}
                              </span>
                              <button
                                onClick={() => handleCopyCode(codeString, codeId)}
                                className="flex items-center gap-1 hover:text-fg hover:bg-hover transition-colors p-1 rounded"
                                title="Copy code"
                              >
                                {copiedCodeId === codeId ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span className="text-[10px] text-emerald-400">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span className="text-[10px]">Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <pre className="!m-0 !p-3.5 !bg-transparent overflow-x-auto text-[13px] font-mono leading-relaxed text-fg">
                              <code>{codeString}</code>
                            </pre>
                          </div>
                        );
                      }

                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>

                {/* Streaming indicator cursor */}
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 ml-1 bg-brand animate-pulse align-middle" />
                )}
              </div>
            )}
          </div>
          )}

          {/* Version branch chip for edited user prompts */}
          {isUser && versions && versionIndex !== null && onBranchVersion && (
            <div className="flex items-center gap-1 mt-1.5 select-none">
              <button
                onClick={() => onBranchVersion(message.id, versionIndex - 1)}
                disabled={versionIndex <= 0}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 border border-line text-fg-soft hover:text-fg disabled:opacity-35 disabled:cursor-default transition-colors cursor-pointer"
                title="Previous version"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-surface border border-line text-fg-muted tabular-nums">
                {versionIndex + 1}/{versions.length}
              </span>
              <button
                onClick={() => onBranchVersion(message.id, versionIndex + 1)}
                disabled={versionIndex >= versions.length - 1}
                className="flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-md bg-surface-2 border border-line text-fg-soft hover:text-fg disabled:opacity-35 disabled:cursor-default transition-colors cursor-pointer"
                title="Next version"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Action Toolbar for User prompts: Edit / Copy / Retry */}
          {isUser && !editing && (
            <div className="flex items-center gap-1 mt-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity text-fg-muted">
              {onEditMessage && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 text-xs hover:text-fg p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all"
                  title="Edit prompt"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Edit</span>
                </button>
              )}
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1 text-xs hover:text-fg p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all"
                title="Copy prompt"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copy</span>
                  </>
                )}
              </button>
              {onRetryMessage && (
                <button
                  onClick={() => onRetryMessage(message.id)}
                  className="flex items-center gap-1 text-xs hover:text-fg p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all"
                  title="Retry prompt"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Action Toolbar for Assistant Response */}
          {!isUser && !message.isStreaming && message.content && (
            <div className="inline-flex items-center gap-1 mt-2.5 pt-1 rounded-lg bg-surface/60 ring-1 ring-line/60 px-1.5 py-1 text-fg-muted opacity-90 hover:opacity-100 hover:ring-line transition-all">
              {/* Copy Message */}
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1 text-xs hover:text-fg p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all"
                title="Copy full response"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copy</span>
                  </>
                )}
              </button>

              {/* Text to Speech */}
              <button
                onClick={handleToggleSpeech}
                className={`flex items-center gap-1 text-xs p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all ${
                  isSpeaking ? 'text-teal' : 'hover:text-fg'
                }`}
                title={isSpeaking ? 'Stop speech' : 'Read aloud'}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5 animate-pulse" />
                    <span className="text-[11px]">Stop</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Read</span>
                  </>
                )}
              </button>

              {/* Regenerate Response */}
              {isLatestAssistant && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="flex items-center gap-1 text-xs text-fg-soft hover:text-fg p-1.5 rounded-md hover:bg-hover active:scale-95 transition-all"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Retry</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
