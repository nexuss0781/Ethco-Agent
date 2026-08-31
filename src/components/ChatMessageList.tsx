import React, { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Message } from '../types';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatMessageListProps {
  messages: Message[];
  onRegenerate: () => void;
  isLoading: boolean;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  onRegenerate,
  isLoading,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Auto-scroll on new message chunks
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, isLoading]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isAtBottom);
  };

  return (
    <div className="relative flex-1 w-full overflow-hidden flex flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-[#22221f]/50"
      >
        <div className="pt-2 pb-6">
          {messages.map((message, idx) => {
            const isLatestAssistant =
              message.role === 'assistant' &&
              idx === messages.length - 1 &&
              !isLoading;

            return (
              <ChatMessageItem
                key={message.id || `msg-${idx}`}
                message={message}
                isLatestAssistant={isLatestAssistant}
                onRegenerate={onRegenerate}
              />
            );
          })}
        </div>
      </div>

      {/* Floating Scroll-to-Bottom Pill */}
      {showScrollBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#242421] hover:bg-[#2d2d28] border border-[#383832] text-xs text-[#ecece7] shadow-lg transition-all animate-in fade-in zoom-in-95 cursor-pointer"
        >
          <ChevronDown className="w-3.5 h-3.5 text-[#d97757]" />
          <span>Latest</span>
        </button>
      )}
    </div>
  );
};
