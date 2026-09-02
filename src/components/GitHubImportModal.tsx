import React, { useState, useEffect } from 'react';
import {
  Github,
  GitBranch,
  Star,
  Lock,
  Globe,
  Download,
  RefreshCw,
  Trash2,
  Check,
  ExternalLink,
  Search,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Sparkles,
  X,
  Loader2,
  Code2,
  FolderGit2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Mail,
} from 'lucide-react';
import { GitHubService, GitHubUser, GitHubRepo, ImportedRepo, SelectedRepoContext, fixMojibake } from '../lib/github';
import { getUser } from '../lib/auth';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepoForChat?: (repo: ImportedRepo, initialPrompt?: string) => void;
  selectedReposList?: SelectedRepoContext[];
  onToggleSelectRepo?: (repo: SelectedRepoContext) => void;
  onSelectAllRepos?: (repos: SelectedRepoContext[]) => void;
  onClearSelectedRepos?: () => void;
}

export const GitHubImportModal: React.FC<GitHubImportModalProps> = ({
  isOpen,
  onClose,
  onSelectRepoForChat,
  selectedReposList = [],
  onToggleSelectRepo,
  onSelectAllRepos,
  onClearSelectedRepos,
}) => {
  const [activeTab, setActiveTab] = useState<'my_repos' | 'url_clone' | 'imported'>('my_repos');
  const [statusLoading, setStatusLoading] = useState(true);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [authUser, setAuthUser] = useState<any | null>(null);

  // My repos state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');

  // Branch management
  const [selectedRepoBranches, setSelectedRepoBranches] = useState<Record<string, string>>({});
  const [repoBranchesMap, setRepoBranchesMap] = useState<Record<string, string[]>>({});
  const [branchLoadingRepo, setBranchLoadingRepo] = useState<string | null>(null);
  const [activeBranchMenuRepo, setActiveBranchMenuRepo] = useState<string | null>(null);

  // Local fallback selection state if parent props not provided
  const [localSelectedRepos, setLocalSelectedRepos] = useState<SelectedRepoContext[]>(() => GitHubService.getSelectedRepos());
  const effectiveSelectedRepos = onToggleSelectRepo ? selectedReposList : localSelectedRepos;

  // URL clone state
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneBranch, setCloneBranch] = useState('');
  const [cloneFolderName, setCloneFolderName] = useState('');
  const [cloneDepth, setCloneDepth] = useState<number | undefined>(1);
  const [cloning, setCloning] = useState(false);

  // Imported repos state
  const [importedRepos, setImportedRepos] = useState<ImportedRepo[]>([]);
  const [importedLoading, setImportedLoading] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [deletingRepo, setDeletingRepo] = useState<string | null>(null);

  // Tree modal / view
  const [selectedRepoTree, setSelectedRepoTree] = useState<{ name: string; tree: any[] } | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  // Notifications
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load status on open
  useEffect(() => {
    if (!isOpen) return;
    refreshStatus();
    loadImportedRepos();
    getUser().then((u) => setAuthUser(u)).catch(() => {});
  }, [isOpen]);

  // Listen to postMessage, BroadcastChannel, and storage when GitHub OAuth completes
  useEffect(() => {
    const handleGlobalMessage = async (event: MessageEvent) => {
      if (
        (event.data?.type === 'OAUTH_AUTH_SUCCESS' || event.data?.type === 'NEXUSS_AUTH_SUCCESS') &&
        event.data?.user
      ) {
        const u = { ...event.data.user };
        u.name = fixMojibake(u.name || u.login);
        u.login = fixMojibake(u.login || u.name || 'user');
        setGhUser(u);
        try {
          localStorage.setItem('ethco_github_user', JSON.stringify(u));
          if (event.data?.token) localStorage.setItem('ethco_github_token', event.data.token);
        } catch {}
        refreshStatus();
        getUser().then((usr) => setAuthUser(usr)).catch(() => {});
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('github_oauth_channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
          const u = { ...event.data.user };
          u.name = fixMojibake(u.name || u.login);
          u.login = fixMojibake(u.login || u.name || 'user');
          setGhUser(u);
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(u));
            if (event.data?.token) localStorage.setItem('ethco_github_token', event.data.token);
          } catch {}
          refreshStatus();
          getUser().then((usr) => setAuthUser(usr)).catch(() => {});
        }
      };
    } catch {}

    window.addEventListener('message', handleGlobalMessage);
    return () => {
      window.removeEventListener('message', handleGlobalMessage);
      if (bc) {
        try { bc.close(); } catch {}
      }
    };
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const refreshStatus = async () => {
    setStatusLoading(true);
    try {
      const status = await GitHubService.getStatus();
      setGhUser(status.user);
      loadUserRepos();
    } catch {
      // Ignored
    } finally {
      setStatusLoading(false);
    }
  };

  const loadUserRepos = async (query?: string) => {
    setReposLoading(true);
    try {
      const list = await GitHubService.fetchRepos(query);
      setRepos(list);

      // Initialize selected branches map from default_branch
      const branchMap: Record<string, string> = {};
      list.forEach((r) => {
        branchMap[r.full_name || r.name] = r.default_branch || 'main';
      });
      setSelectedRepoBranches((prev) => ({ ...branchMap, ...prev }));
    } catch (err: any) {
      console.warn('Failed to load repos:', err);
    } finally {
      setReposLoading(false);
    }
  };

  const loadImportedRepos = async () => {
    setImportedLoading(true);
    try {
      const list = await GitHubService.getImportedRepos();
      setImportedRepos(list);
    } catch (err: any) {
      console.warn('Failed to load imported repos:', err);
    } finally {
      setImportedLoading(false);
    }
  };

  // Branch fetching & selection
  const handleToggleBranchDropdown = async (e: React.MouseEvent, repoKey: string, fullName: string) => {
    e.stopPropagation();
    if (activeBranchMenuRepo === repoKey) {
      setActiveBranchMenuRepo(null);
      return;
    }
    setActiveBranchMenuRepo(repoKey);

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
    setSelectedRepoBranches((prev) => ({ ...prev, [repoKey]: branchName }));
    setActiveBranchMenuRepo(null);

    // If repo is already selected, update its branch in selected list
    if (onToggleSelectRepo) {
      const existing = selectedReposList.find((r) => r.name === repoKey || r.fullName === repoKey);
      if (existing) {
        onToggleSelectRepo({ ...existing, branch: branchName });
      }
    } else {
      setLocalSelectedRepos((prev) => {
        const next = prev.map((r) => (r.name === repoKey || r.fullName === repoKey ? { ...r, branch: branchName } : r));
        GitHubService.saveSelectedRepos(next);
        return next;
      });
    }
  };

  const handleToggleRepoSelect = (repo: GitHubRepo) => {
    const repoKey = repo.full_name || repo.name;
    const branch = selectedRepoBranches[repoKey] || repo.default_branch || 'main';
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
    } else {
      setLocalSelectedRepos((prev) => {
        const exists = prev.some((r) => r.fullName === repoContext.fullName || r.name === repoContext.name);
        const next = exists
          ? prev.filter((r) => r.fullName !== repoContext.fullName && r.name !== repoContext.name)
          : [...prev, repoContext];
        GitHubService.saveSelectedRepos(next);
        return next;
      });
    }
  };

  const handleSelectAllVisible = () => {
    const listToSelect: SelectedRepoContext[] = filteredRepos.map((repo) => {
      const repoKey = repo.full_name || repo.name;
      const branch = selectedRepoBranches[repoKey] || repo.default_branch || 'main';
      return {
        name: repo.name,
        fullName: repo.full_name,
        branch: branch,
        cloneUrl: repo.clone_url,
        htmlUrl: repo.html_url,
        isPrivate: repo.private,
        description: repo.description || undefined,
        language: repo.language || undefined,
      };
    });

    if (onSelectAllRepos) {
      onSelectAllRepos(listToSelect);
    } else {
      setLocalSelectedRepos(listToSelect);
      GitHubService.saveSelectedRepos(listToSelect);
    }
    showToast('success', `Selected ${listToSelect.length} repositories for AI agent.`);
  };

  const handleClearAllSelected = () => {
    if (onClearSelectedRepos) {
      onClearSelectedRepos();
    } else {
      setLocalSelectedRepos([]);
      GitHubService.saveSelectedRepos([]);
    }
    showToast('success', 'Cleared all selected repositories.');
  };

  // Handle GitHub Authorization
  const handleAuthorizeGitHub = async () => {
    try {
      setStatusLoading(true);
      const user = await GitHubService.authorizeOAuth();
      if (user) {
        setGhUser(user);
        showToast('success', `Successfully authorized as @${user.login || user.name}`);
        loadUserRepos();
      }
    } catch (err: any) {
      showToast('error', err.message || 'GitHub authorization failed');
    } finally {
      setStatusLoading(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    try {
      await GitHubService.disconnect();
      setGhUser(null);
      setRepos([]);
      showToast('success', 'Disconnected authorization.');
      refreshStatus();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to disconnect');
    }
  };

  // Handle Clone Specific Repo
  const handleCloneRepo = async (repo: GitHubRepo | { clone_url: string; name: string; full_name?: string; default_branch?: string }) => {
    const repoKey = repo.full_name || repo.name;
    const branchToClone = selectedRepoBranches[repoKey] || repo.default_branch || 'main';
    setCloning(true);
    try {
      const result = await GitHubService.cloneRepo({
        repoUrl: repo.clone_url,
        branch: branchToClone,
        folderName: repo.name,
      });
      showToast('success', `Repository '${result.name}' (${branchToClone}) successfully imported!`);
      await loadImportedRepos();
      await loadUserRepos(searchQuery);
      setActiveTab('imported');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to clone repository');
    } finally {
      setCloning(false);
    }
  };

  // Handle Clone from custom URL
  const handleCustomClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim()) return;
    setCloning(true);
    try {
      const result = await GitHubService.cloneRepo({
        repoUrl: cloneUrl.trim(),
        branch: cloneBranch.trim() || undefined,
        depth: cloneDepth,
        folderName: cloneFolderName.trim() || undefined,
      });
      showToast('success', `Repository '${result.name}' cloned to workspace!`);
      setCloneUrl('');
      setCloneBranch('');
      setCloneFolderName('');
      await loadImportedRepos();
      setActiveTab('imported');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to clone repository');
    } finally {
      setCloning(false);
    }
  };

  // Handle Sync / Pull
  const handleSyncRepo = async (repoName: string) => {
    setSyncingRepo(repoName);
    try {
      const res = await GitHubService.syncRepo(repoName);
      showToast('success', res.message || `Synced repos/${repoName}`);
      await loadImportedRepos();
    } catch (err: any) {
      showToast('error', err.message || 'Git pull failed');
    } finally {
      setSyncingRepo(null);
    }
  };

  // Handle Delete
  const handleDeleteRepo = async (repoName: string) => {
    if (!confirm(`Are you sure you want to delete the cloned repository '${repoName}' from workspace?`)) return;
    setDeletingRepo(repoName);
    try {
      await GitHubService.deleteImportedRepo(repoName);
      showToast('success', `Removed repos/${repoName}`);
      await loadImportedRepos();
      await loadUserRepos(searchQuery);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete repository');
    } finally {
      setDeletingRepo(null);
    }
  };

  // View File Tree
  const handleViewTree = async (repoName: string) => {
    setTreeLoading(true);
    try {
      const tree = await GitHubService.getRepoTree(repoName);
      setSelectedRepoTree({ name: repoName, tree });
    } catch (err: any) {
      showToast('error', err.message || 'Failed to load repo tree');
    } finally {
      setTreeLoading(false);
    }
  };

  // Filter repos
  const filteredRepos = repos.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.full_name && r.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLang =
      languageFilter === 'all' || (r.language && r.language.toLowerCase() === languageFilter.toLowerCase());
    return matchesSearch && matchesLang;
  });

  const languages = Array.from(new Set(repos.map((r) => r.language).filter(Boolean))) as string[];

  // Resolved user display info
  const displayName = ghUser?.name || authUser?.name || ghUser?.login || authUser?.email?.split('@')[0] || 'Authorized Developer';
  const displayUsername = ghUser?.login || authUser?.username || authUser?.login || (authUser?.email ? authUser.email.split('@')[0] : 'user');
  const displayAvatar = ghUser?.avatar_url || authUser?.avatar;
  const authEmail = authUser?.email || ghUser?.email;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => setActiveBranchMenuRepo(null)}
    >
      <div
        id="github-import-modal"
        className="relative w-full max-w-3xl bg-[#141412] border border-[#2b2b27] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#242421] bg-[#181815]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20201c] border border-[#33332e] flex items-center justify-center text-[#ecece7]">
              <Github className="w-4 h-4 text-[#d97757]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#ecece7] flex items-center gap-2">
                GitHub Repository Center
              </h2>
              <p className="text-[11px] text-[#85857a]">
                Browse, switch branches, and import repositories directly into your AI workspace.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Account Bar - Renders Authorized Real Name, Avatar, Username and Intact Auth Gmail */}
        <div className="px-5 py-3 bg-[#191916] border-b border-[#242421] flex flex-wrap items-center justify-between gap-3 text-xs">
          {ghUser || authUser ? (
            <div className="flex items-center gap-3">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-8 h-8 rounded-xl object-cover border border-[#d97757]/40 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-xl bg-[#252521] border border-[#d97757]/40 flex items-center justify-center shrink-0 text-[#d97757] font-bold text-xs">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs text-[#ecece7]">{displayName}</span>
                  <span className="text-[11px] font-mono text-[#d97757]">@{displayUsername}</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <ShieldCheck className="w-2.5 h-2.5" /> Authorized
                  </span>
                </div>
                {authEmail && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#85857a] mt-0.5">
                    <Mail className="w-3 h-3 text-[#737370]" />
                    <span className="font-mono text-[#a3a39b]">{authEmail}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#85857a]">
              <Lock className="w-3.5 h-3.5 text-[#d97757]" />
              <span>Connect GitHub to browse your private & public repositories</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {ghUser ? (
              <button
                onClick={handleDisconnect}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-[#85857a] hover:text-red-400 hover:bg-[#262622] border border-[#2b2b27] transition-colors cursor-pointer"
              >
                Disconnect
              </button>
            ) : (
              <a
                id="btn-github-authorize"
                href={GitHubService.getLoginUrl()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#d97757] hover:bg-[#e08668] text-white transition-all shadow-xs cursor-pointer"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Authorize GitHub</span>
              </a>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-5 py-2 text-xs flex items-center justify-between border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center px-5 pt-2 border-b border-[#242421] bg-[#141412] gap-2">
          <button
            onClick={() => setActiveTab('my_repos')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'my_repos'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>All Repositories</span>
            {repos.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#22221f] text-[#85857a]">
                {repos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('url_clone')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'url_clone'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Clone by URL</span>
          </button>

          <button
            onClick={() => setActiveTab('imported')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'imported'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Workspace Repos</span>
            {importedRepos.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#d97757]/20 text-[#d97757] font-semibold">
                {importedRepos.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: All Repositories List with Multi-Select, Branches Dropdown to Right, Scrollable showing 5 at once */}
        {activeTab === 'my_repos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search & Filter Header with Multi-Select Actions at Top of Dropdown / List */}
            <div className="p-3 bg-[#181815] border-b border-[#242421] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2 min-w-[220px]">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#85857a]" />
                  <input
                    type="text"
                    placeholder="Search repository name, branch or description..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.length > 2) {
                        loadUserRepos(e.target.value);
                      } else if (e.target.value === '') {
                        loadUserRepos();
                      }
                    }}
                    className="w-full pl-8.5 pr-3 py-1.5 bg-[#121210] border border-[#2b2b27] rounded-xl text-xs text-[#ecece7] placeholder-[#66665e] focus:outline-none focus:border-[#d97757]"
                  />
                </div>

                {languages.length > 0 && (
                  <select
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#121210] border border-[#2b2b27] rounded-xl text-xs text-[#ecece7] focus:outline-none focus:border-[#d97757]"
                  >
                    <option value="all">All Languages</option>
                    {languages.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => loadUserRepos(searchQuery)}
                  disabled={reposLoading}
                  className="p-1.5 rounded-xl text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#282824] transition-colors cursor-pointer"
                  title="Refresh Repositories"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reposLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Multi-Select Quick Action Bar */}
              {filteredRepos.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] text-[#85857a] font-medium hidden sm:inline">
                    Selected:{' '}
                    <strong className="text-[#d97757] font-semibold">{effectiveSelectedRepos.length}</strong>
                  </span>
                  <button
                    onClick={handleSelectAllVisible}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#22221e] hover:bg-[#2c2c27] text-[#ecece7] border border-[#33332e] transition-colors cursor-pointer"
                  >
                    Select All ({filteredRepos.length})
                  </button>
                  {effectiveSelectedRepos.length > 0 && (
                    <button
                      onClick={handleClearAllSelected}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-[#85857a] hover:text-red-400 hover:bg-[#262622] transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Repositories Scrollable Area - Renders ALL repos (supports 100+), sized to show ~5 cards at once */}
            <div className="max-h-[390px] sm:max-h-[420px] overflow-y-auto p-3 space-y-2">
              {reposLoading ? (
                <div className="py-14 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                  <span className="text-xs">Fetching all repositories & branches from GitHub...</span>
                </div>
              ) : filteredRepos.length > 0 ? (
                filteredRepos.map((repo) => {
                  const repoKey = repo.full_name || repo.name;
                  const currentBranch = selectedRepoBranches[repoKey] || repo.default_branch || 'main';
                  const isBranchMenuOpen = activeBranchMenuRepo === repoKey;
                  const availableBranches = repoBranchesMap[repoKey] || [currentBranch, 'main', 'master'];
                  const isSelected = effectiveSelectedRepos.some(
                    (r) => r.fullName === repo.full_name || r.name === repo.name
                  );

                  return (
                    <div
                      key={repo.id}
                      onClick={() => handleToggleRepoSelect(repo)}
                      className={`group p-3 rounded-xl border transition-all flex items-center justify-between gap-3 relative cursor-pointer ${
                        isSelected
                          ? 'bg-[#1e1b18] border-[#d97757]/50 shadow-xs'
                          : 'bg-[#181815] hover:bg-[#1f1f1c] border-[#242421] hover:border-[#383832]'
                      }`}
                    >
                      {/* Checkbox Tick for Multi-Select */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleRepoSelect(repo);
                        }}
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors border ${
                          isSelected
                            ? 'bg-[#d97757] border-[#d97757] text-white'
                            : 'bg-[#20201d] border-[#383832] group-hover:border-[#52524a]'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      {/* Left: Metadata */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span title={repo.private ? 'Private Repo' : 'Public Repo'}>
                            {repo.private ? (
                              <Lock className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
                            ) : (
                              <Globe className="w-3.5 h-3.5 text-[#85857a] shrink-0" />
                            )}
                          </span>
                          <a
                            href={repo.html_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold text-xs text-[#ecece7] hover:text-[#d97757] transition-colors truncate flex items-center gap-1"
                          >
                            {repo.full_name || repo.name}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>

                          {repo.is_imported && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Workspace Cloned
                            </span>
                          )}
                        </div>

                        {repo.description && (
                          <p className="text-[11px] text-[#85857a] mt-0.5 line-clamp-1">
                            {repo.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#66665e]">
                          {repo.language && (
                            <span className="flex items-center gap-1 text-[#b4b4aa]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#d97757]" />
                              {repo.language}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 text-[#85857a]" />
                            {repo.stargazers_count || 0}
                          </span>
                        </div>
                      </div>

                      {/* Right: Branch Dropdown Selector + Select Toggle Action Button */}
                      <div className="shrink-0 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {/* Branch Dropdown to the right */}
                        <div className="relative">
                          <button
                            onClick={(e) => handleToggleBranchDropdown(e, repoKey, repo.full_name || repo.name)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#20201d] hover:bg-[#2a2a26] border border-[#2e2e2a] text-[11px] font-mono text-[#ecece7] transition-colors cursor-pointer"
                            title="Select branch"
                          >
                            <GitBranch className="w-3 h-3 text-[#d97757]" />
                            <span className="max-w-[80px] sm:max-w-[110px] truncate">{currentBranch}</span>
                            <ChevronDown className={`w-3 h-3 text-[#85857a] transition-transform ${isBranchMenuOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Branch Popover Menu */}
                          {isBranchMenuOpen && (
                            <div
                              className="absolute right-0 top-full mt-1.5 w-48 p-1.5 bg-[#1c1c19] border border-[#383832] rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 max-h-52 overflow-y-auto"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="px-2 py-1 text-[9px] uppercase font-semibold text-[#85857a] border-b border-[#282824] flex items-center justify-between">
                                <span>Branches</span>
                                <span className="font-mono text-[#66665e]">{availableBranches.length}</span>
                              </div>
                              {branchLoadingRepo === repoKey ? (
                                <div className="py-3 text-center text-xs text-[#85857a] flex items-center justify-center gap-1.5">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d97757]" />
                                  <span>Loading...</span>
                                </div>
                              ) : (
                                availableBranches.map((b) => (
                                  <button
                                    key={b}
                                    onClick={(e) => handleSelectBranch(e, repoKey, b)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition-colors cursor-pointer ${
                                      b === currentBranch
                                        ? 'bg-[#d97757]/20 text-[#f0a282]'
                                        : 'text-[#b4b4aa] hover:bg-[#252522] hover:text-[#ecece7]'
                                    }`}
                                  >
                                    <span className="truncate">{b}</span>
                                    {b === currentBranch && <Check className="w-3.5 h-3.5 text-[#d97757]" />}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        {/* Select / Selected Button (Tick / Multi-select) */}
                        <button
                          onClick={() => handleToggleRepoSelect(repo)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#d97757] text-white shadow-xs'
                              : 'bg-[#22221e] text-[#85857a] hover:text-[#ecece7] hover:bg-[#282824] border border-[#33332e]'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Selected</span>
                            </>
                          ) : (
                            <span>Select</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-[#85857a] flex flex-col items-center justify-center gap-2">
                  <Github className="w-8 h-8 opacity-30 text-[#d97757]" />
                  <p className="text-xs font-medium text-[#ecece7]">No repositories found</p>
                  <p className="text-[11px] max-w-xs">
                    Try searching for any public GitHub repository above or use the "Clone by URL" tab to import directly.
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Selection Footer Bar */}
            {effectiveSelectedRepos.length > 0 && (
              <div className="p-3 bg-[#181815] border-t border-[#242421] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#ecece7]">
                  <span className="w-2 h-2 rounded-full bg-[#d97757]" />
                  <span>
                    <strong>{effectiveSelectedRepos.length}</strong> {effectiveSelectedRepos.length === 1 ? 'repository' : 'repositories'} selected for AI agent
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-xl text-xs font-medium bg-[#d97757] hover:bg-[#e08668] text-white shadow-xs transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Clone by URL */}
        {activeTab === 'url_clone' && (
          <form onSubmit={handleCustomClone} className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="block font-medium text-[#ecece7]">Repository URL or identifier</label>
              <input
                type="text"
                required
                placeholder="https://github.com/owner/repository or owner/repository"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                className="w-full px-3 py-2 bg-[#181815] border border-[#2b2b27] rounded-lg text-xs text-[#ecece7] placeholder-[#66665e] focus:outline-none focus:border-[#d97757]"
              />
              <p className="text-[11px] text-[#85857a]">
                Works with any accessible GitHub repository URL without requiring an API key.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block font-medium text-[#ecece7]">Specific Branch (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. main, master, feat/feature"
                  value={cloneBranch}
                  onChange={(e) => setCloneBranch(e.target.value)}
                  className="w-full px-3 py-2 bg-[#181815] border border-[#2b2b27] rounded-lg text-xs text-[#ecece7] placeholder-[#66665e] focus:outline-none focus:border-[#d97757]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-[#ecece7]">Destination Folder Name (Optional)</label>
                <input
                  type="text"
                  placeholder="Defaults to repository name"
                  value={cloneFolderName}
                  onChange={(e) => setCloneFolderName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#181815] border border-[#2b2b27] rounded-lg text-xs text-[#ecece7] placeholder-[#66665e] focus:outline-none focus:border-[#d97757]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={cloning}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#d97757] hover:bg-[#e08668] text-white font-medium text-xs shadow-md transition-all cursor-pointer"
              >
                {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{cloning ? 'Cloning Repository...' : 'Clone to Workspace'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Workspace Repos */}
        {activeTab === 'imported' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 bg-[#181815] border-b border-[#242421] flex items-center justify-between text-xs">
              <span className="text-[#85857a]">
                Cloned repositories available on your server filesystem under <code className="text-[#ecece7]">/repos/</code>
              </span>
              <button
                onClick={loadImportedRepos}
                className="p-1 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${importedLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {importedLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                  <span className="text-xs">Loading workspace repositories...</span>
                </div>
              ) : importedRepos.length > 0 ? (
                importedRepos.map((repo) => (
                  <div
                    key={repo.name}
                    className="p-3.5 rounded-xl bg-[#181815] border border-[#242421] hover:border-[#383832] transition-all flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold text-xs text-[#ecece7] truncate">{repo.name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#22221e] text-[#85857a] border border-[#2b2b27]">
                          {repo.branch || 'main'}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#85857a] mt-1 font-mono truncate">{repo.path}</div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleViewTree(repo.name)}
                        className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#2b2b27] transition-colors"
                        title="View File Tree"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleSyncRepo(repo.name)}
                        disabled={syncingRepo === repo.name}
                        className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#2b2b27] transition-colors"
                        title="Git Pull / Sync"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingRepo === repo.name ? 'animate-spin text-[#d97757]' : ''}`} />
                      </button>

                      <button
                        onClick={() => handleDeleteRepo(repo.name)}
                        disabled={deletingRepo === repo.name}
                        className="p-1.5 rounded-lg text-[#85857a] hover:text-red-400 hover:bg-[#262622] border border-[#2b2b27] transition-colors"
                        title="Delete from workspace"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {onSelectRepoForChat && (
                        <button
                          onClick={() => {
                            onSelectRepoForChat(repo);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#d97757] hover:bg-[#e08668] text-white shadow-xs transition-all cursor-pointer"
                        >
                          <span>Use in Chat</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-[#85857a] flex flex-col items-center justify-center gap-2">
                  <FolderGit2 className="w-8 h-8 opacity-30 text-[#d97757]" />
                  <p className="text-xs font-medium text-[#ecece7]">No workspace repositories cloned yet</p>
                  <p className="text-[11px] max-w-xs">
                    Import one from your authorized GitHub repositories or paste any Git clone URL.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tree Viewer Modal Sub-view */}
        {selectedRepoTree && (
          <div className="absolute inset-0 bg-[#141412] z-20 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#242421] bg-[#181815]">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#d97757]" />
                <span className="text-sm font-semibold text-[#ecece7]">{selectedRepoTree.name}</span>
                <span className="text-xs text-[#85857a]">File Tree</span>
              </div>
              <button
                onClick={() => setSelectedRepoTree(null)}
                className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs text-[#ecece7]">
              {selectedRepoTree.tree.length === 0 ? (
                <div className="text-center py-8 text-[#85857a]">Empty directory</div>
              ) : (
                selectedRepoTree.tree.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 py-1 px-2 hover:bg-[#1f1f1c] rounded">
                    {item.type === 'directory' ? (
                      <Folder className="w-3.5 h-3.5 text-[#d97757]" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-[#85857a]" />
                    )}
                    <span>{item.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
