import React, { useState } from 'react';
import { Menu, Plus, Brain, ChevronDown, Check } from 'lucide-react';
import { ModelOption } from '../types';
import { AVAILABLE_MODELS } from '../constants/models';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
  selectedModel: ModelOption;
  onSelectModel: (model: ModelOption) => void;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  onOpenUpgradeModal: () => void;
  onOpenGitHubModal?: () => void;
  hasUnread?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  onToggleSidebar,
  onNewChat,
  selectedModel,
  onSelectModel,
  thinkingEnabled,
  onToggleThinking,
  onOpenUpgradeModal,
  onOpenGitHubModal,
  hasUnread = true,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  return (
    <header className="relative z-20 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-[#181816] border-b border-[#262623] shrink-0">
      {/* Left: Sidebar Toggle & New Chat Button */}
      <div className="flex items-center gap-2">
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          className="relative p-2 rounded-lg text-[#b4b4aa] hover:text-[#ecece7] hover:bg-[#262623] transition-colors focus:outline-none"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#3b82f6] ring-2 ring-[#181816]" />
          )}
        </button>

        <button
          id="btn-header-new-chat"
          onClick={onNewChat}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#b4b4aa] hover:text-[#ecece7] bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Center: Free Plan / Upgrade Pill (As in screenshot) */}
      <div className="flex items-center">
        <button
          id="btn-plan-pill"
          onClick={onOpenUpgradeModal}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] text-[#b4b4aa] transition-colors cursor-pointer"
        >
          <span className="text-[#85857a]">Free plan</span>
          <span className="text-[#85857a]">·</span>
          <span className="text-[#d97757] font-medium hover:underline">Upgrade</span>
        </button>
      </div>

      {/* Right: Model Selector & Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Thinking Mode Toggle Pill */}
        <button
          id="btn-toggle-thinking"
          onClick={onToggleThinking}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            thinkingEnabled
              ? 'bg-[#d97757]/15 border-[#d97757]/40 text-[#f0a282]'
              : 'bg-[#222220] border-[#33332e] text-[#85857a] hover:text-[#b4b4aa]'
          }`}
          title="Toggle Extended Reasoning Mode"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Thinking: {thinkingEnabled ? 'High' : 'Off'}</span>
        </button>

        {/* Model Selector Dropdown */}
        <div className="relative">
          <button
            id="btn-model-selector"
            onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] text-[#ecece7] transition-colors"
          >
            <span className="max-w-[100px] sm:max-w-none truncate">{selectedModel.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#85857a]" />
          </button>

          {modelDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setModelDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1.5 w-64 p-1.5 bg-[#222220] border border-[#33332e] rounded-xl shadow-xl z-40 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1.5 text-[11px] font-medium text-[#85857a] uppercase tracking-wider">
                  Select Model
                </div>
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelectModel(model);
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start justify-between transition-colors ${
                      selectedModel.id === model.id
                        ? 'bg-[#2f2f2a] text-[#ecece7]'
                        : 'text-[#b4b4aa] hover:bg-[#282824] hover:text-[#ecece7]'
                    }`}
                  >
                    <div>
                      <div className="font-medium flex items-center gap-1.5">
                        <span>{model.name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-[#181816] text-[#85857a] rounded border border-[#33332e]">
                          {model.versionBadge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#85857a] mt-0.5 leading-snug">
                        {model.description}
                      </p>
                    </div>
                    {selectedModel.id === model.id && (
                      <Check className="w-4 h-4 text-[#d97757] shrink-0 ml-2 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
