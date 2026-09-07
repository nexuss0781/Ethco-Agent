import React, { useState, useEffect } from 'react';
import {
  Menu,
  ChevronDown,
  Check,
  FolderGit2,
  Github,
  Globe,
  Lock,
  Loader2,
  Search,
  GitBranch,
  Star,
  ExternalLink,
  Download,
  MessageSquare,
  Settings,
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
  onOpenSettings?: () => void;
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
  onOpenSettings,
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
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
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
        GitHubService.fetchRepos().catch((err: any) => {
          // Not authorized or clean failure — lead with the authorize prompt
          if (String(err?.message || '').includes('GITHUB_UNAUTHORIZED')) {
            setGithubConnected(false);
          } else {
            setGithubConnected((prev) => prev ?? false);
          }
          return [];
        }),
        GitHubService.getImportedRepos().catch(() => []),
      ]);
      if (ghRepos && ghRepos.length > 0) setGithubConnected(true);
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
      GitHubService.getStatus()
        .then((status) => setGithubConnected(!!(status.connected && status.user)))
        .catch(() => {});
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
    <header className="relative z-20 flex items-center justify-between px-3 sm:px-5 py-2.5 bg-canvas border-b border-line-soft shrink-0">
      {/* Left: Sidebar Toggle, New Chat Button & Ethco tier selector */}
      <div className="flex items-center gap-2">
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleSidebar}
          className="md:hidden relative p-2 rounded-lg text-fg-soft hover:text-fg hover:bg-hover transition-colors focus:outline-none cursor-pointer"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-teal ring-2 ring-line-soft" />
          )}
        </button>

        <div className="relative">
          <button
            id="btn-ethco-tier-dropdown"
            onClick={() => setModelDropdownOpen((open) => !open)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-surface hover:bg-hover border border-teal/40 text-teal-fg transition-colors cursor-pointer"
            title="Choose Ethco model tier"
          >
            {(() => {
              const ModelIcon = getDynamicLucideIcon(selectedModel.icon);
              return <ModelIcon className="w-3.5 h-3.5 text-teal shrink-0" />;
            })()}
            <span className="max-w-[125px] sm:max-w-none truncate">{selectedModel.name}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${modelDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setModelDropdownOpen(false)} />
              <div id="ethco-tier-dropdown-menu" className="absolute left-0 mt-2 w-64 p-1.5 bg-raised border border-line rounded-2xl shadow-2xl z-40 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2.5 py-2 text-[10px] uppercase tracking-wider font-semibold text-fg-muted">Ethco model tier</div>
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      onSelectModel(model);
                      setModelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer font-mono ${
                      model.id === selectedModel.id ? 'bg-brand/15 text-teal-fg' : 'text-fg-soft hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-md bg-brand/15 text-teal shrink-0 border border-teal/30">
                        {(() => {
                          const ModelIcon = getDynamicLucideIcon(model.icon);
                          return <ModelIcon className="w-3.5 h-3.5" />;
                        })()}
                      </div>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold truncate">{model.name}</span>
                        <span className="block text-[10px] font-sans text-fg-muted truncate">{model.description}</span>
                      </span>
                    </div>
                    {model.id === selectedModel.id && <Check className="w-3.5 h-3.5 text-teal shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Center: Active Conversation Title & Contextual Lucide Icon (context, not control) */}
      <div className="hidden md:flex items-center min-w-0 px-2">
        {activeConversation && activeConversation.title && activeConversation.title !== 'New Chat' && activeConversation.title !== 'New Conversation' && (
          <div className="flex items-center gap-2 min-w-0 max-w-xs text-fg-soft animate-in fade-in duration-200">
            {(() => {
              const ActiveIcon = getDynamicLucideIcon(activeConversation.icon);
              return <ActiveIcon className="w-3.5 h-3.5 text-teal/80 shrink-0" />;
            })()}
            <span className="truncate text-[13px] leading-tight">{activeConversation.title}</span>
          </div>
        )}
      </div>

      {/* Right: Model Selector & Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Git Repositories Dropdown */}
        <div className="relative">
          <button
            id="btn-git-repos-dropdown"
            onClick={handleToggleRepoDropdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-hover border border-line text-fg-soft hover:text-fg transition-colors cursor-pointer"
            title="Git Repositories"
          >
            <GitBranch className="w-3.5 h-3.5 text-teal" />
            <span className="max-w-[110px] sm:max-w-none truncate">
              {selectedRepoName ? selectedRepoName : 'Repositories'}
            </span>
            <ChevronDown className={`w-3 h-3 text-fg-muted transition-transform ${repoDropdownOpen ? 'rotate-180' : ''}`} />
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
                className="absolute right-0 mt-2 w-[340px] sm:w-[420px] bg-raised border border-line rounded-2xl shadow-2xl z-40 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
              >
                {/* 1. Header Bar with Manage / Import link */}
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line-soft bg-surface">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-surface-2 border border-line flex items-center justify-center">
                      <GitBranch className="w-3 h-3 text-teal" />
                    </div>
                    <span className="text-xs font-semibold text-fg">
                      Git Repositories
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface text-fg-muted font-mono">
                      {totalMatching}
                    </span>
                  </div>
                  {onOpenGitHubModal && (
                    <button
                      onClick={() => {
                        setRepoDropdownOpen(false);
                        onOpenGitHubModal();
                      }}
                      className="text-[11px] text-teal hover:text-teal-fg hover:underline cursor-pointer font-medium flex items-center gap-1"
                    >
                      <span>Manage All</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {/* 2. Sticky Search Bar at Top of Dropdown */}
                <div className="p-2.5 bg-canvas border-b border-line-soft">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                    <input
                      type="text"
                      placeholder="Search repository or branch..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      autoFocus
                      className="w-full pl-8.5 pr-7 py-1.5 bg-canvas-deep border border-line-soft focus:border-teal rounded-xl text-xs text-fg placeholder-fg-muted outline-none transition-all"
                    />
                    {repoSearch && (
                      <button
                        onClick={() => setRepoSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Repositories Scrollable Area - Formatted to show ~5 cards at once */}
                <div className="max-h-[380px] overflow-y-auto p-2 space-y-1.5 divide-y-0">
                  {reposLoading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-fg-muted">
                      <Loader2 className="w-5 h-5 animate-spin text-teal" />
                      <span className="text-xs">Loading repositories & branches...</span>
                    </div>
                  ) : totalMatching === 0 ? (
                    githubConnected === false || githubConnected === null ? (
                      <div className="py-8 text-center flex flex-col items-center gap-3 px-4">
                        <div className="w-14 h-14 rounded-2xl bg-surface border border-line flex items-center justify-center">
                          <Github className="w-7 h-7 text-teal" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-fg">Authorize GitHub to view your repositories</p>
                          <p className="text-[11px] text-fg-muted mt-1 max-w-xs mx-auto">
                            Connect your GitHub account to browse and import your repositories into Ethco.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <a
                            id="btn-header-authorize-github"
                            href={GitHubService.getLoginUrl()}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-brand hover:bg-brand-strong text-white transition-all shadow-xs cursor-pointer"
                          >
                            <Github className="w-3.5 h-3.5" />
                            <span>Authorize GitHub</span>
                          </a>
                          {onOpenSettings && (
                            <button
                              id="btn-header-open-settings"
                              onClick={() => {
                                setRepoDropdownOpen(false);
                                onOpenSettings();
                              }}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-fg bg-surface hover:bg-hover border border-line-soft hover:border-line transition-all cursor-pointer"
                            >
                              <Settings className="w-3.5 h-3.5 text-fg-muted" />
                              <span>Open Settings</span>
                            </button>
                          )}
                        </div>
                        {onOpenGitHubModal && (
                          <button
                            onClick={() => {
                              setRepoDropdownOpen(false);
                              onOpenGitHubModal();
                            }}
                            className="text-[11px] text-teal hover:text-teal-fg hover:underline cursor-pointer mt-1"
                          >
                            Manage All Repositories
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-fg-muted space-y-2">
                        <p>No matching repositories found.</p>
                        {onOpenGitHubModal && (
                          <button
                            onClick={() => {
                              setRepoDropdownOpen(false);
                              onOpenGitHubModal();
                            }}
                            className="px-3 py-1 bg-surface hover:bg-hover text-fg rounded-lg border border-line text-[11px] cursor-pointer"
                          >
                            Import Repository by URL
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <>
                      {/* Cloned / Workspace Repos */}
                      {filteredImported.length > 0 && (
                        <div className="space-y-1.5 pb-1">
                          <div className="px-2 py-0.5 text-[10px] font-semibold text-fg-muted uppercase tracking-wider flex items-center justify-between">
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
                                className="group p-2.5 rounded-xl bg-surface hover:bg-hover border border-line-soft hover:border-line transition-all flex items-center justify-between gap-2.5 relative"
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
                                    <span className="font-semibold text-xs text-fg group-hover:text-white truncate">
                                      {imp.name}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                      Active
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-fg-muted truncate mt-0.5">
                                    Local workspace repository ready for AI context
                                  </div>
                                </div>

                                {/* Right: Branch Dropdown & Chat Action */}
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {/* Branch Dropdown Button */}
                                  <div className="relative">
                                    <button
                                      onClick={(e) => handleToggleBranchDropdown(e, repoKey, imp.name)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface hover:bg-hover border border-line text-[10px] font-mono text-fg-soft hover:text-fg transition-colors cursor-pointer"
                                      title="Switch branch"
                                    >
                                      <GitBranch className="w-2.5 h-2.5 text-teal" />
                                      <span className="max-w-[70px] truncate">{currentBranch}</span>
                                      <ChevronDown className="w-2.5 h-2.5 text-fg-muted" />
                                    </button>

                                    {/* Branch Popover */}
                                    {isBranchMenuOpen && (
                                      <div
                                        className="absolute right-0 top-full mt-1 w-44 p-1 bg-surface border border-line rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] uppercase font-semibold text-fg-muted border-b border-line-soft">
                                          Select Branch
                                        </div>
                                        {branchLoadingRepo === repoKey ? (
                                          <div className="py-2 text-center text-[10px] text-fg-muted">
                                            Loading branches...
                                          </div>
                                        ) : (
                                          availableBranches.map((b) => (
                                            <button
                                              key={b}
                                              onClick={(e) => handleSelectBranch(e, repoKey, b)}
                                              className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                                                b === currentBranch
                                                  ? 'bg-brand/20 text-teal-fg'
                                                  : 'text-fg-soft hover:bg-hover hover:text-fg'
                                              }`}
                                            >
                                              <span className="truncate">{b}</span>
                                              {b === currentBranch && <Check className="w-3 h-3 text-teal" />}
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
                                    className="p-1.5 rounded-lg bg-surface-2 hover:bg-brand text-fg hover:text-white border border-line hover:border-teal transition-all cursor-pointer"
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
                            <div className="px-2 py-0.5 text-[10px] font-semibold text-fg-muted uppercase tracking-wider">
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
                                    ? 'bg-surface-3 border-teal/50 shadow-xs'
                                    : 'bg-canvas hover:bg-hover border-line-soft hover:border-line'
                                }`}
                              >
                                {/* Left Info */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 transition-colors border ${
                                        selectedReposList.some((r) => r.name === repo.name || r.fullName === (repo.full_name || repo.name))
                                          ? 'bg-brand border-teal text-white'
                                          : 'bg-transparent border-transparent'
                                      }`}
                                    >
                                      {selectedReposList.some((r) => r.name === repo.name || r.fullName === (repo.full_name || repo.name)) ? (
                                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                                      ) : (
                                        <span title={repo.private ? "Private" : "Public"}>
                                          {repo.private ? (
                                            <Lock className="w-3.5 h-3.5 text-teal" />
                                          ) : (
                                            <Globe className="w-3.5 h-3.5 text-fg-muted" />
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <span className="font-semibold text-xs text-fg group-hover:text-white truncate">
                                      {repo.name}
                                    </span>
                                  </div>

                                  {repo.description && (
                                    <p className="text-[10px] text-fg-muted truncate mt-0.5">
                                      {repo.description}
                                    </p>
                                  )}

                                  <div className="flex items-center gap-2 mt-1 text-[9px] text-fg-muted">
                                    {repo.language && (
                                      <span className="flex items-center gap-1 text-fg-soft">
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                                        {repo.language}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-0.5">
                                      <Star className="w-2.5 h-2.5 text-fg-muted" />
                                      {repo.stargazers_count || 0}
                                    </span>
                                  </div>
                                </div>

                                {/* Right: Branch Dropdown (Removed Import button) */}
                                <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  <div className="relative">
                                    <button
                                      onClick={(e) => handleToggleBranchDropdown(e, repoKey, repo.full_name || repo.name)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface hover:bg-hover border border-line-soft text-[10px] font-mono text-fg-soft hover:text-fg transition-colors cursor-pointer"
                                      title="Change branch"
                                    >
                                      <GitBranch className="w-2.5 h-2.5 text-fg-muted" />
                                      <span className="max-w-[70px] truncate">{currentBranch}</span>
                                      <ChevronDown className="w-2.5 h-2.5 text-fg-muted" />
                                    </button>

                                    {/* Branch Popover */}
                                    {isBranchMenuOpen && (
                                      <div
                                        className="absolute right-0 top-full mt-1 w-44 p-1 bg-surface border border-line rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-48 overflow-y-auto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] uppercase font-semibold text-fg-muted border-b border-line-soft">
                                          Select Branch
                                        </div>
                                        {branchLoadingRepo === repoKey ? (
                                          <div className="py-2 text-center text-[10px] text-fg-muted">
                                            Loading branches...
                                          </div>
                                        ) : (
                                          availableBranches.map((b) => (
                                            <button
                                              key={b}
                                              onClick={(e) => handleSelectBranch(e, repoKey, b)}
                                              className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                                                b === currentBranch
                                                  ? 'bg-brand/20 text-teal-fg'
                                                  : 'text-fg-soft hover:bg-hover hover:text-fg'
                                              }`}
                                            >
                                              <span className="truncate">{b}</span>
                                              {b === currentBranch && <Check className="w-3 h-3 text-teal" />}
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
                <div className="p-2 border-t border-line-soft bg-canvas-deep flex items-center justify-between text-[10px] text-fg-muted px-3">
                  <span>Scroll to view all repositories</span>
                  {onOpenGitHubModal && (
                    <button
                      onClick={() => {
                        setRepoDropdownOpen(false);
                        onOpenGitHubModal();
                      }}
                      className="text-teal hover:underline cursor-pointer"
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
