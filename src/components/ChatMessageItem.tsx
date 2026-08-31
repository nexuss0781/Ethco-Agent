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
  Brain,
  FileText,
  User,
} from 'lucide-react';
import { Message } from '../types';

interface ChatMessageItemProps {
  message: Message;
  onRegenerate?: () => void;
  isLatestAssistant?: boolean;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onRegenerate,
  isLatestAssistant = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const isUser = message.role === 'user';

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
      <div className={`w-full max-w-3xl flex gap-3 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-7 h-7 rounded-full bg-[#2a2a26] border border-[#383832] flex items-center justify-center text-[#b4b4aa]">
              <User className="w-3.5 h-3.5" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-[#222220] border border-[#33332e] flex items-center justify-center shadow-xs">
              <span className="text-[#d97757] font-serif font-bold text-base leading-none select-none">
                ✳
              </span>
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
                  className="rounded-xl overflow-hidden border border-[#33332e] bg-[#222220] max-w-[200px]"
                >
                  {att.type === 'image' ? (
                    <img
                      src={att.data}
                      alt={att.name}
                      className="max-h-48 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="p-2.5 flex items-center gap-2 text-xs text-[#ecece7]">
                      <FileText className="w-4 h-4 text-[#d97757]" />
                      <span className="truncate">{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reasoning / Thinking Process Accordion (if available) */}
          {!isUser && message.thinkingContent && (
            <div className="w-full mb-3 rounded-xl bg-[#1c1c19] border border-[#2a2a26] overflow-hidden text-xs">
              <button
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between text-[#85857a] hover:text-[#ecece7] hover:bg-[#222220] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-[#d97757]" />
                  <span>Thinking process</span>
                </div>
                {thinkingExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {thinkingExpanded && (
                <div className="px-3.5 py-2.5 bg-[#171715] border-t border-[#262622] text-[#a1a196] leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
                  {message.thinkingContent}
                </div>
              )}
            </div>
          )}

          {/* Message Body */}
          <div
            className={`text-sm sm:text-[15px] leading-relaxed ${
              isUser
                ? 'px-4 py-3 rounded-2xl bg-[#282824] text-[#f3f3ee] border border-[#33332e] max-w-[85%] whitespace-pre-wrap'
                : 'w-full text-[#ecece7]'
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
                          <div className="relative my-3 rounded-xl overflow-hidden border border-[#33332e] bg-[#121210]">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1b] border-b border-[#2d2d29] text-xs text-[#85857a]">
                              <span className="font-mono text-[11px] lowercase">
                                {match[1]}
                              </span>
                              <button
                                onClick={() => handleCopyCode(codeString, codeId)}
                                className="flex items-center gap-1 hover:text-[#ecece7] transition-colors p-1 rounded"
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
                            <pre className="!m-0 !p-3.5 !bg-transparent overflow-x-auto text-[13px] font-mono leading-relaxed text-[#e5e5dc]">
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
                  <span className="inline-block w-2 h-4 ml-1 bg-[#d97757] animate-pulse align-middle" />
                )}
              </div>
            )}
          </div>

          {/* Action Toolbar for Assistant Response */}
          {!isUser && !message.isStreaming && message.content && (
            <div className="flex items-center gap-2 mt-2 pt-1 opacity-80 hover:opacity-100 transition-opacity text-[#85857a]">
              {/* Copy Message */}
              <button
                onClick={handleCopyMessage}
                className="flex items-center gap-1 text-xs hover:text-[#ecece7] p-1.5 rounded-md hover:bg-[#222220] transition-colors"
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
                className={`flex items-center gap-1 text-xs p-1.5 rounded-md hover:bg-[#222220] transition-colors ${
                  isSpeaking ? 'text-[#d97757]' : 'hover:text-[#ecece7]'
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
                  className="flex items-center gap-1 text-xs hover:text-[#ecece7] p-1.5 rounded-md hover:bg-[#222220] transition-colors"
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
