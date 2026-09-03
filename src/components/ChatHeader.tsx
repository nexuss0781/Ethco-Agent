import React, { useState, useEffect } from 'react';
import {
  Menu,
  Plus,
  Brain,
  ChevronDown,
  Check,
  FolderGit2,
  Globe,
  Lock,
  Loader2,
  Search,
  GitBranch,
  Star,
  ExternalLink,
  Download,
  MessageSquare,
  X,
} from 'lucide-react';
import { ModelOption, Conversation } from '../types';
import { AVAILABLE_MODELS } from '../constants/models';
import { GitHubService, GitHubRepo, ImportedRepo, SelectedRepoContext } from '../lib/github';
import { getDynamicLucideIcon } from '../lib/icons';

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
  selectedReposList?: SelectedRepoContext[];
  onToggleSelectRepo?: (repo: SelectedRepoContext) => void;
  hasUnread?: boolean;
  activeConversation?: Conversation;
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
  selectedReposList = [],
  onToggleSelectRepo,
  hasUnread = true,
  activeConversation,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [reposList, setReposList] = useState<GitHubRepo[]>([]);
  const [importedList, setImportedList] = useState<ImportedRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);

  // Search & Branch management
  const [repoSearch, setRepoSearch] = useState('');
  const [activeBranchMenuRepo, setActiveBranchMenuRepo] = useState<string | null>(null);
  const [selectedBranches, setSelectedBranches] = useState<Record<string, string>>({});
  const [repoBranchesMap, setRepoBranchesMap] = useState<Record<string, string[]>>({});
  const [branchLoadingRepo, setBranchLoadingRepo] = useState<string | null>(null);
  const [cloningRepoName, setCloningRepoName] = useState<string | null>(null);

  const loadDropdownRepos = async () => {
    setReposLoading(true);
    try {
      const [ghRepos, impRepos] = await Promise.all([
        GitHubService.fetchRepos().catch(() => []),
        GitHubService.getImportedRepos().catch(() => []),
      ]);
      setReposList(ghRepos || []);
      setImportedList(impRepos || []);

      // Initialize selected branches map from repos default_branch
      const branchMap: Record<string, string> = {};
      (ghRepos || []).forEach((r) => {
        branchMap[r.full_name || r.name] = r.default_branch || 'main';
      });
      (impRepos || []).forEach((r) => {
        branchMap[r.name] = r.branch || 'main';
      });
      setSelectedBranches((prev) => ({ ...branchMap, ...prev }));
    } catch {} finally {
      setReposLoading(false);
    }
  };

  const handleToggleRepoDropdown = () => {
    const nextState = !repoDropdownOpen;
    setRepoDropdownOpen(nextState);
    if (nextState) {
      loadDropdownRepos();
    } else {
      setActiveBranchMenuRepo(null);
    }
  };

  // Fetch branches for a specific repository when user clicks the branch dropdown
  const handleToggleBranchDropdown = async (e: React.MouseEvent, repoKey: string, fullName: string) => {
    e.stopPropagation();
    if (activeBranchMenuRepo === repoKey) {
      setActiveBranchMenuRepo(null);
      return;
    }

    setActiveBranchMenuRepo(repoKey);

    // If branches are already cached, don't refetch
    if (repoBranchesMap[repoKey] && repoBranchesMap[repoKey].length > 0) {
      return;
    }

    setBranchLoadingRepo(repoKey);
    try {
      const branches = await GitHubService.fetchBranches(fullName, repoKey);
      setRepoBranchesMap((prev) => ({
        ...prev,
        [repoKey]: branches && branches.length > 0 ? branches : ['main', 'master'],
      }));
    } catch {
      setRepoBranchesMap((prev) => ({
        ...prev,
        [repoKey]: ['main', 'master'],
      }));
    } finally {
      setBranchLoadingRepo(null);
    }
  };

  const handleSelectBranch = (e: React.MouseEvent, repoKey: string, branchName: string) => {
    e.stopPropagation();
    setSelectedBranches((prev) => ({ ...prev, [repoKey]: branchName }));
    setActiveBranchMenuRepo(null);
    
    // If repo is already selected, update its branch
    if (onToggleSelectRepo) {
      const existing = selectedReposList.find((r) => r.name === repoKey || r.fullName === repoKey);
      if (existing) {
        onToggleSelectRepo({ ...existing, branch: branchName });
      }
    }
  };

  const handleToggleRepoSelectFromList = (repo: GitHubRepo) => {
    const repoKey = repo.full_name || repo.name;
    const branch = selectedBranches[repoKey] || repo.default_branch || 'main';
    const repoContext: SelectedRepoContext = {
      name: repo.name,
      fullName: repo.full_name,
      branch: branch,
      cloneUrl: repo.clone_url,
      htmlUrl: repo.html_url,
      isPrivate: repo.private,
      description: repo.description || undefined,
      language: repo.language || undefined,
    };
    if (onToggleSelectRepo) {
      onToggleSelectRepo(repoContext);
    }
  };

  // Filter repositories based on search
  const query = repoSearch.trim().toLowerCase();
  const filteredImported = importedList.filter((imp) =>
    imp.name.toLowerCase().includes(query) || (imp.branch && imp.branch.toLowerCase().includes(query))
  );
  const filteredRepos = reposList.filter(
    (repo) =>
      repo.name.toLowerCase().includes(query) ||
      (repo.full_name && repo.full_name.toLowerCase().includes(query)) ||
      (repo.description && repo.description.toLowerCase().includes(query)) ||
      (repo.language && repo.language.toLowerCase().includes(query))
  );

  const totalMatching = filteredImported.length + filteredRepos.length;

  return (
    <header className="relative z-20 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-[#181816] border-b border-[#262623] shrink-0">
      {/* Left: Sidebar Toggle, New Chat Button & Ethco tier selector */}
      <div className="flex items-center gap-2">
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          className="relative p-2 rounded-lg text-[#b4b4aa] hover:text-[#ecece7] hover:bg-[#262623] transition-colors focus:outline-none cursor-pointer"
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
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#b4b4aa] hover:text-[#ecece7] bg-[#222220] hover:bg-[#2a2a26] border border-[#33332e] transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Chat</span>
        </button>

        <div className="relative">
          <button
            id="btn-ethco-tier-dropdown"
            onClick={() => setModelDropdownOpen((open) => !open)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-[#222220] hover:bg-[#2a2a26] border border-[#d97757]/40 text-[#f0a282] transition-colors cursor-pointer"
            title="Choose Ethco model tier"
          >
            <span className="max-w-[125px] sm:max-w-none truncate">{selectedModel.name}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setModelDropdownOpen(false)} />
              <div id="ethco-tier-dropdown-menu" className="absolute left-0 mt-2 w-64 p-1.5 bg-[#161614] border border-[#2c2c28] rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-2 text-[10px] uppercase tracking-wider font-semibold text-[#85857a]">Ethco model tier</div>
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelectModel(model);
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer font-mono ${
                      model.id === selectedModel.id ? 'bg-[#d97757]/15 text-[#f0a282]' : 'text-[#b4b4aa] hover:bg-[#252522] hover:text-[#ecece7]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold truncate">{model.name}</span>
                      <span className="block text-[10px] font-sans text-[#85857a] truncate">{model.description}</span>
                    </span>
                    {model.id === selectedModel.id && <Check className="w-3.5 h-3.5 text-[#d97757] shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Active Conversation Title & Contextual Lucide Icon */}
      <div className="hidden md:flex items-center">
        {activeConversation && activeConversation.title && activeConversation.title !== 'New Chat' && activeConversation.title !== 'New Conversation' && (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#20201d] border border-[#2b2b27] text-xs text-[#ecece7] max-w-xs shadow-xs animate-in fade-in duration-200">
            {(() => {
              const ActiveIcon = getDynamicLucideIcon(activeConversation.icon);
              return <ActiveIcon className="w-3.5 h-3.5 text-[#d97757] shrink-0" />;
            })()}
            <span className="truncate font-medium text-[12px]">{activeConversation.title}</span>
          </div>
        )}
      </div>

      {/* Right: Model Selector & Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Thinking Mode Toggle Pill */}
        <button
          id="btn-toggle-thinking"
          onClick={onToggleThinking}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            thinkingEnabled
              ? 'bg-[#d97757]/15 border-[#d97757]/40 text-[#f0a282]'
              : 'bg-[#222220] border-[#33332e] text-[#85857a] hover:text-[#b4b4aa]'
          }`}
          title="Toggle Extended Reasoning Mode"
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Thinking: {thinkingEnabled ? 'High' : 'Off'}</span>
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
            <span className="max-w-[110px] sm:max-w-none truncate">
              {selectedRepoName ? selectedRepoName : 'Repositories'}
            </span>
            <ChevronDown className={`w-3 h-3 text-[#85857a] transition-transform ${repoDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {repoDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => {
                  setRepoDropdownOpen(false);
                  setActiveBranchMenuRepo(null);
                }}
              />
              <div
                id="git-repos-dropdown-menu"
                className="absolute right-0 mt-2 w-[340px] sm:w-[420px] bg-[#161614] border border-[#2c2c28] rounded-2xl shadow-2xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
              >
                {/* 1. Header Bar with Manage / Import link */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#262622] bg-[#1a1a17]">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-[#252521] border border-[#33332e] flex items-center justify-center">
                      <FolderGit2 className="w-3 h-3 text-[#d97757]" />
                    </div>
                    <span className="text-xs font-semibold text-[#ecece7]">
                      Git Repositories
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#22221f] text-[#85857a] font-mono">
                      {totalMatching}
                    </span>
                  </div>
                  {onOpenGitHubModal && (
                    <button
                      onClick={() => {
                        setRepoDropdownOpen(false);
                        onOpenGitHubModal();
                      }}
                      className="text-[11px] text-[#d97757] hover:text-[#e08668] hover:underline cursor-pointer font-medium flex items-center gap-1"
                    >
                      <span>Manage All</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {/* 2. Sticky Search Bar at Top of Dropdown */}
                <div className="p-2.5 bg-[#181815] border-b border-[#242420]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#85857a]" />
                    <input
                      type="text"
                      placeholder="Search repository or branch..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      autoFocus
                      className="w-full pl-8.5 pr-7 py-1.5 bg-[#10100e] border border-[#2b2b27] focus:border-[#d97757] rounded-xl text-xs text-[#ecece7] placeholder-[#66665e] outline-none transition-all"
                    />
                    {repoSearch && (
                      <button
                        onClick={() => setRepoSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#85857a] hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Repositories Scrollable Area - Formatted to show ~5 cards at once */}
                <div className="max-h-[380px] overflow-y-auto p-2 space-y-1.5 divide-y-0">
                  {reposLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                      <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                      <span className="text-xs">Loading repositories & branches...</span>
                    </div>
                  ) : totalMatching === 0 ? (
                    <div className="py-8 text-center text-xs text-[#85857a] space-y-2">
                      <p>No matching repositories found.</p>
                      {onOpenGitHubModal && (
                        <button
                          onClick={() => {
                            setRepoDropdownOpen(false);
                            onOpenGitHubModal();
                          }}
                          className="px-3 py-1 bg-[#22221f] hover:bg-[#2a2a26] text-[#ecece7] rounded-lg border border-[#33332e] text-[11px] cursor-pointer"
                        >
                          Import Repository by URL
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Cloned / Workspace Repos */}
                      {filteredImported.length > 0 && (
                        <div className="space-y-1.5 pb-1">
                          <div className="px-2 py-0.5 text-[10px] font-semibold text-[#85857a] uppercase tracking-wider flex items-center justify-between">
                            <span>Workspace Cloned ({filteredImported.length})</span>
                          </div>
                          {filteredImported.map((imp) => {
                            const repoKey = imp.name;
                            const currentBranch = selectedBranches[repoKey] || imp.branch || 'main';
                            const isBranchMenuOpen = activeBranchMenuRepo === repoKey;
                            const availableBranches = repoBranchesMap[repoKey] || [currentBranch, 'main', 'master'];

                            return (
                              <div
                                key={`imp-${imp.path || imp.name}`}
                                className="group p-2.5 rounded-xl bg-[#1a1a17] hover:bg-[#20201d] border border-[#282824] hover:border-[#383833] transition-all flex items-center justify-between gap-2.5 relative"
                              >
                                {/* Left Info */}
                                <div
                                  onClick={() => {
                                    setSelectedRepoName(imp.name);
                                    setRepoDropdownOpen(false);
                                    if (onSelectRepoForChat) {
                                      onSelectRepoForChat(imp);
                                    }
                                  }}
                                  className="min-w-0 flex-1 cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <FolderGit2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="font-semibold text-xs text-[#ecece7] group-hover:text-white truncate">
                                      {imp.name}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                      Active
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-[#787870] truncate mt-0.5">
                                    Local workspace repository ready for AI context
                                  </div>
                                </div>

                                {/* Right: Branch Dropdown & Chat Action */}
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {/* Branch Dropdown Button */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => handleToggleBranchDropdown(e, repoKey, imp.name)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#22221f] hover:bg-[#2c2c28] border border-[#33332e] text-[10px] font-mono text-[#b4b4aa] hover:text-[#ecece7] transition-colors cursor-pointer"
                                      title="Switch branch"
                                    >
                                      <GitBranch className="w-2.5 h-2.5 text-[#d97757]" />
                                      <span className="max-w-[70px] truncate">{currentBranch}</span>
                                      <ChevronDown className="w-2.5 h-2.5 text-[#85857a]" />
                                    </button>

                                    {/* Branch Popover */}
                                    {isBranchMenuOpen && (
                                      <div
                                        className="absolute right-0 top-full mt-1 w-44 p-1 bg-[#1c1c19] border border-[#383832] rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] uppercase font-semibold text-[#85857a] border-b border-[#282824]">
                                          Select Branch
                                        </div>
                                        {branchLoadingRepo === repoKey ? (
                                          <div className="py-2 text-center text-[10px] text-[#85857a]">
                                            Loading branches...
                                          </div>
                                        ) : (
                                          availableBranches.map((b) => (
                                            <button
                                              key={b}
                                              onClick={(e) => handleSelectBranch(e, repoKey, b)}
                                              className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                                                b === currentBranch
                                                  ? 'bg-[#d97757]/20 text-[#f0a282]'
                                                  : 'text-[#b4b4aa] hover:bg-[#252522] hover:text-[#ecece7]'
                                              }`}
                                            >
                                              <span className="truncate">{b}</span>
                                              {b === currentBranch && <Check className="w-3 h-3 text-[#d97757]" />}
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Select for Chat Button */}
                                  <button
                                    onClick={() => {
                                      setSelectedRepoName(imp.name);
                                      setRepoDropdownOpen(false);
                                      if (onSelectRepoForChat) {
                                        onSelectRepoForChat(imp);
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-[#252521] hover:bg-[#d97757] text-[#ecece7] hover:text-white border border-[#33332e] hover:border-[#d97757] transition-all cursor-pointer"
                                    title="Use in Chat"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* GitHub Cloud Repositories */}
                      {filteredRepos.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {filteredImported.length > 0 && (
                            <div className="px-2 py-0.5 text-[10px] font-semibold text-[#85857a] uppercase tracking-wider">
                              <span>GitHub Cloud ({filteredRepos.length})</span>
                            </div>
                          )}
                          {filteredRepos.map((repo) => {
                            const repoKey = repo.full_name || repo.name;
                            const currentBranch = selectedBranches[repoKey] || repo.default_branch || 'main';
                            const isBranchMenuOpen = activeBranchMenuRepo === repoKey;
                            const isCloning = cloningRepoName === repoKey;
                            const availableBranches = repoBranchesMap[repoKey] || [currentBranch, 'main', 'master'];

                            return (
                              <div
                                key={`gh-${repo.id || repo.name}`}
                                onClick={() => handleToggleRepoSelectFromList(repo)}
                                className={`group p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 relative cursor-pointer ${
                                  selectedReposList.some((r) => r.name === repo.name || r.fullName === (repo.full_name || repo.name))
                                    ? 'bg-[#1e1b18] border-[#d97757]/50 shadow-xs'
                                    : 'bg-[#181816] hover:bg-[#20201d] border-[#262622] hover:border-[#383832]'
                                }`}
                              >
                                {/* Left Info */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors border ${
                                        selectedReposList.some((r) => r.name === repo.name || r.fullName === (repo.full_name || repo.name))
                                          ? 'bg-[#d97757] border-[#d97757] text-white'
                                          : 'bg-transparent border-transparent'
                                      }`}
                                    >
                                      {selectedReposList.some((r) => r.name === repo.name || r.fullName === (repo.full_name || repo.name)) ? (
                                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                                      ) : (
                                        <span title={repo.private ? "Private" : "Public"}>
                                          {repo.private ? (
                                            <Lock className="w-3.5 h-3.5 text-[#d97757]" />
                                          ) : (
                                            <Globe className="w-3.5 h-3.5 text-[#85857a]" />
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-semibold text-xs text-[#ecece7] group-hover:text-white truncate">
                                      {repo.name}
                                    </span>
                                  </div>

                                  {repo.description && (
                                    <p className="text-[10px] text-[#737373] truncate mt-0.5">
                                      {repo.description}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-2 mt-1 text-[9px] text-[#66665e]">
                                    {repo.language && (
                                      <span className="flex items-center gap-1 text-[#a3a39e]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#d97757]" />
                                        {repo.language}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-0.5">
                                      <Star className="w-2.5 h-2.5 text-[#85857a]" />
                                      {repo.stargazers_count || 0}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Branch Dropdown (Removed Import button) */}
                                <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <div className="relative">
                                    <button
                                      onClick={(e) => handleToggleBranchDropdown(e, repoKey, repo.full_name || repo.name)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#20201d] hover:bg-[#2a2a26] border border-[#2e2e2a] text-[10px] font-mono text-[#b4b4aa] hover:text-[#ecece7] transition-colors cursor-pointer"
                                      title="Change branch"
                                    >
                                      <GitBranch className="w-2.5 h-2.5 text-[#85857a]" />
                                      <span className="max-w-[70px] truncate">{currentBranch}</span>
                                      <ChevronDown className="w-2.5 h-2.5 text-[#85857a]" />
                                    </button>

                                    {/* Branch Popover */}
                                    {isBranchMenuOpen && (
                                      <div
                                        className="absolute right-0 top-full mt-1 w-44 p-1 bg-[#1c1c19] border border-[#383832] rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] uppercase font-semibold text-[#85857a] border-b border-[#282824]">
                                          Select Branch
                                        </div>
                                        {branchLoadingRepo === repoKey ? (
                                          <div className="py-2 text-center text-[10px] text-[#85857a]">
                                            Loading branches...
                                          </div>
                                        ) : (
                                          availableBranches.map((b) => (
                                            <button
                                              key={b}
                                              onClick={(e) => handleSelectBranch(e, repoKey, b)}
                                              className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                                                b === currentBranch
                                                  ? 'bg-[#d97757]/20 text-[#f0a282]'
                                                  : 'text-[#b4b4aa] hover:bg-[#252522] hover:text-[#ecece7]'
                                              }`}
                                            >
                                              <span className="truncate">{b}</span>
                                              {b === currentBranch && <Check className="w-3 h-3 text-[#d97757]" />}
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 4. Dropdown Footer */}
                <div className="p-2 border-t border-[#242420] bg-[#141412] flex items-center justify-between text-[10px] text-[#85857a] px-3">
                  <span>Scroll to view all repositories</span>
                  {onOpenGitHubModal && (
                    <button
                      onClick={() => {
                        setRepoDropdownOpen(false);
                        onOpenGitHubModal();
                      }}
                      className="text-[#d97757] hover:underline cursor-pointer"
                    >
                      Open Import Center &rarr;
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        
</div>
      </div>
    </header>
  );
};
