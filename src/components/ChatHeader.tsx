import React, { useState } from 'react';
import { Menu, Plus, Brain, ChevronDown, Check, FolderGit2, Globe, Lock, Loader2 } from 'lucide-react';
import { ModelOption } from '../types';
import { AVAILABLE_MODELS } from '../constants/models';
import { GitHubService, ImportedRepo } from '../lib/github';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  onNewChat: () => void;
  selectedModel: ModelOption;
  onSelectModel: (model: ModelOption) => void;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  onOpenUpgradeModal: () => void;
  onOpenGitHubModal?: () => void;
  onSelectRepoForChat?: (repo: ImportedRepo, initialPrompt?: string) => void;
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
  onSelectRepoForChat,
  hasUnread = true,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [reposList, setReposList] = useState<any[]>([]);
  const [importedList, setImportedList] = useState<any[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);

  const loadDropdownRepos = async () => {
    setReposLoading(true);
    try {
      const [ghRepos, impRepos] = await Promise.all([
        GitHubService.fetchRepos().catch(() => []),
        GitHubService.getImportedRepos().catch(() => []),
      ]);
      setReposList(ghRepos || []);
      setImportedList(impRepos || []);
    } catch {} finally {
      setReposLoading(false);
    }
  };

  const handleToggleRepoDropdown = () => {
    const nextState = !repoDropdownOpen;
    setRepoDropdownOpen(nextState);
    if (nextState) {
      loadDropdownRepos();
    }
  };

  return (
    <header className="relative z-20 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-[#181816] border-b border-[#262623] shrink-0">
      {/* Left: Sidebar Toggle, New Chat Button & Git Repositories Dropdown */}
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

        {/* Git Repositories Dropdown */}
        <div className="relative">
          <button
            id="btn-git-repos-dropdown"
            onClick={handleToggleRepoDropdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] text-[#b4b4aa] hover:text-[#ecece7] transition-colors cursor-pointer"
            title="Git Repositories"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-[#d97757]" />
            <span className="max-w-[100px] sm:max-w-none truncate">
              {selectedRepoName ? selectedRepoName : 'Repositories'}
            </span>
            <ChevronDown className="w-3 h-3 text-[#85857a]" />
          </button>

          {repoDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setRepoDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-1.5 w-80 p-2 bg-[#222220] border border-[#33332e] rounded-xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-100 max-h-96 overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#33332e] mb-1">
                  <span className="text-[11px] font-semibold text-[#85857a] uppercase tracking-wider flex items-center gap-1.5">
                    <FolderGit2 className="w-3.5 h-3.5 text-[#d97757]" />
                    <span>Git Repositories</span>
                  </span>
                  {onOpenGitHubModal && (
                    <button
                      onClick={() => {
                        setRepoDropdownOpen(false);
                        onOpenGitHubModal();
                      }}
                      className="text-[11px] text-[#d97757] hover:underline cursor-pointer font-medium"
                    >
                      Manage / Import
                    </button>
                  )}
                </div>

                {reposLoading ? (
                  <div className="py-6 flex flex-col items-center justify-center gap-2 text-[#737373]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#d97757]" />
                    <span className="text-xs">Loading repositories...</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {importedList.length > 0 && (
                      <div className="pb-1 mb-1 border-b border-[#2d2d29]">
                        <div className="px-2 py-1 text-[10px] text-[#85857a] font-medium uppercase">
                          Workspace Cloned Repos ({importedList.length})
                        </div>
                        {importedList.map((imp) => (
                          <button
                            key={imp.path || imp.name}
                            onClick={() => {
                              setSelectedRepoName(imp.name);
                              setRepoDropdownOpen(false);
                              if (onSelectRepoForChat) {
                                onSelectRepoForChat(imp);
                              }
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between text-[#ecece7] hover:bg-[#2c2c28] transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FolderGit2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="truncate font-medium">{imp.name}</span>
                            </div>
                            <span className="text-[10px] text-[#737373] font-mono group-hover:text-white">
                              {imp.branch || 'main'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="px-2 py-1 text-[10px] text-[#85857a] font-medium uppercase">
                      GitHub Cloud Repos ({reposList.length})
                    </div>
                    {reposList.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#737373]">
                        No GitHub repositories found. Connect GitHub in settings or import via URL.
                      </div>
                    ) : (
                      reposList.slice(0, 15).map((repo) => (
                        <button
                          key={repo.id || repo.name}
                          onClick={() => {
                            setSelectedRepoName(repo.name);
                            setRepoDropdownOpen(false);
                            if (onOpenGitHubModal) {
                              onOpenGitHubModal();
                            }
                          }}
                          className="w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start justify-between text-[#b4b4aa] hover:bg-[#2c2c28] hover:text-[#ecece7] transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-medium text-white truncate flex items-center gap-1.5">
                              {repo.private ? (
                                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                              ) : (
                                <Globe className="w-3 h-3 text-[#85857a] shrink-0" />
                              )}
                              <span className="truncate">{repo.name}</span>
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-[#737373] truncate mt-0.5">
                                {repo.description}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-[#85857a] font-mono shrink-0 bg-[#1c1c1a] px-1.5 py-0.5 rounded border border-[#33332e]">
                            {repo.default_branch || 'main'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Empty / Flexible spacing */}
      <div className="hidden md:flex items-center"></div>

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
