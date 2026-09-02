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
  ShieldCheck
} from 'lucide-react';
import { GitHubService, GitHubUser, GitHubRepo, ImportedRepo, fixMojibake } from '../lib/github';

interface GitHubImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepoForChat?: (repo: ImportedRepo, initialPrompt?: string) => void;
}

export const GitHubImportModal: React.FC<GitHubImportModalProps> = ({
  isOpen,
  onClose,
  onSelectRepoForChat,
}) => {
  const [activeTab, setActiveTab] = useState<'my_repos' | 'url_clone' | 'imported'>('my_repos');
  const [statusLoading, setStatusLoading] = useState(true);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);

  // My repos state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');

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
  const handleCloneRepo = async (repo: GitHubRepo | { clone_url: string; name: string }) => {
    setCloning(true);
    try {
      const result = await GitHubService.cloneRepo({
        repoUrl: repo.clone_url,
        folderName: repo.name,
      });
      showToast('success', `Repository '${result.name}' successfully imported!`);
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
      (r.description && r.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLang =
      languageFilter === 'all' || (r.language && r.language.toLowerCase() === languageFilter.toLowerCase());
    return matchesSearch && matchesLang;
  });

  const languages = Array.from(new Set(repos.map((r) => r.language).filter(Boolean))) as string[];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="github-import-modal"
        className="relative w-full max-w-3xl bg-[#141412] border border-[#2b2b27] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242421] bg-[#181815]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20201c] border border-[#33332e] flex items-center justify-center text-[#ecece7]">
              <Github className="w-4 h-4 text-[#d97757]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#ecece7] flex items-center gap-2">
                GitHub Repositories
              </h2>
              <p className="text-[11px] text-[#85857a]">
                Import and explore repositories directly in your workspace.
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

        {/* User Account Bar */}
        <div className="px-5 py-2.5 bg-[#1a1a17] border-b border-[#242421] flex flex-wrap items-center justify-between gap-3 text-xs">
          {ghUser ? (
            <div className="flex items-center gap-2.5">
              {ghUser.avatar_url ? (
                <img src={ghUser.avatar_url} alt={ghUser.login} className="w-6 h-6 rounded-full border border-[#383832]" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#383832] flex items-center justify-center text-[10px]">GH</div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[#ecece7]">{ghUser.name || ghUser.login}</span>
                <span className="text-[#85857a]">(@{ghUser.login})</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ShieldCheck className="w-2.5 h-2.5" /> Authorized
                </span>
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
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#85857a] hover:text-red-400 hover:bg-[#262622] border border-[#2b2b27] transition-colors cursor-pointer"
              >
                Disconnect
              </button>
            ) : (
              <button
                id="btn-github-authorize"
                onClick={handleAuthorizeGitHub}
                disabled={statusLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#d97757] hover:bg-[#e08668] text-white transition-all shadow-xs cursor-pointer"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Authorize GitHub</span>
              </button>
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
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'my_repos'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>Repositories</span>
            {repos.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#22221f] text-[#85857a]">
                {repos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('url_clone')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
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
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 ${
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

        {/* Tab 1: Repositories List */}
        {activeTab === 'my_repos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Search & Filter Header */}
            <div className="p-3 bg-[#181815] border-b border-[#242421] flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#85857a]" />
                <input
                  type="text"
                  placeholder="Search repository name or description..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.length > 2) {
                      loadUserRepos(e.target.value);
                    } else if (e.target.value === '') {
                      loadUserRepos();
                    }
                  }}
                  className="w-full pl-8.5 pr-3 py-1.5 bg-[#121210] border border-[#2b2b27] rounded-lg text-xs text-[#ecece7] placeholder-[#66665e] focus:outline-none focus:border-[#d97757]"
                />
              </div>

              {languages.length > 0 && (
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#121210] border border-[#2b2b27] rounded-lg text-xs text-[#ecece7] focus:outline-none focus:border-[#d97757]"
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
                className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#282824] transition-colors"
                title="Refresh Repositories"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reposLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Repositories Scrollable Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {reposLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                  <span className="text-xs">Fetching repositories from GitHub...</span>
                </div>
              ) : filteredRepos.length > 0 ? (
                filteredRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className="p-3.5 rounded-xl bg-[#181815] border border-[#242421] hover:border-[#383832] transition-all flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span title={repo.private ? "Private Repo" : "Public Repo"}>
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
                          className="font-medium text-xs text-[#ecece7] hover:text-[#d97757] transition-colors truncate flex items-center gap-1"
                        >
                          {repo.full_name || repo.name}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>

                        {repo.is_imported && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" /> Cloned
                          </span>
                        )}
                      </div>

                      {repo.description && (
                        <p className="text-[11px] text-[#85857a] mt-1 line-clamp-1">
                          {repo.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[10px] text-[#66665e]">
                        {repo.language && (
                          <span className="flex items-center gap-1 text-[#b4b4aa]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#d97757]" />
                            {repo.language}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Star className="w-2.5 h-2.5" />
                          {repo.stargazers_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <GitBranch className="w-2.5 h-2.5" />
                          {repo.default_branch}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => handleCloneRepo(repo)}
                        disabled={cloning}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          repo.is_imported
                            ? 'bg-[#22221e] text-[#85857a] hover:text-[#ecece7] hover:bg-[#282824] border border-[#33332e]'
                            : 'bg-[#d97757] hover:bg-[#e08668] text-white shadow-xs'
                        }`}
                      >
                        {cloning ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{repo.is_imported ? 'Re-import' : 'Import Repo'}</span>
                      </button>
                    </div>
                  </div>
                ))
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

            <div className="p-3 bg-[#1a1a17] border border-[#2b2b27] rounded-xl flex items-center justify-between">
              <div>
                <span className="font-medium text-[#ecece7]">Shallow Clone (Depth 1)</span>
                <p className="text-[10px] text-[#85857a]">Faster cloning by only fetching the latest commit.</p>
              </div>
              <input
                type="checkbox"
                checked={cloneDepth === 1}
                onChange={(e) => setCloneDepth(e.target.checked ? 1 : undefined)}
                className="w-4 h-4 accent-[#d97757] rounded cursor-pointer"
              />
            </div>

            <button
              type="submit"
              disabled={cloning || !cloneUrl.trim()}
              className="w-full py-2.5 px-4 bg-[#d97757] hover:bg-[#e08668] disabled:opacity-50 text-white font-medium rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              {cloning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cloning into workspace repos/...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Clone Repository into Workspace</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Tab 3: Cloned Workspace Repos */}
        {activeTab === 'imported' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 bg-[#181815] border-b border-[#242421] flex items-center justify-between">
              <span className="text-xs text-[#85857a]">
                Imported repositories stored in <code className="text-[#ecece7] bg-[#20201c] px-1 py-0.5 rounded">repos/</code>
              </span>
              <button
                onClick={loadImportedRepos}
                disabled={importedLoading}
                className="p-1 rounded-md text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622]"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${importedLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {importedLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                  <span className="text-xs">Loading workspace repositories...</span>
                </div>
              ) : importedRepos.length > 0 ? (
                importedRepos.map((repo) => (
                  <div
                    key={repo.name}
                    className="p-3.5 rounded-xl bg-[#181815] border border-[#242421] hover:border-[#383832] transition-all flex flex-col gap-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="w-4 h-4 text-[#d97757] shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[#ecece7]">{repo.name}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#22221f] text-[#85857a] flex items-center gap-1">
                              <GitBranch className="w-2.5 h-2.5 text-[#d97757]" />
                              {repo.branch}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#85857a] font-mono">{repo.path}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onSelectRepoForChat && (
                          <button
                            onClick={() => {
                              onSelectRepoForChat(repo);
                              onClose();
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#d97757] hover:bg-[#e08668] text-white transition-all shadow-xs"
                            title="Inject repository context into active AI chat"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Use in Chat</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleViewTree(repo.name)}
                          className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#2b2b27]"
                          title="Inspect File Tree"
                        >
                          <Layers className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleSyncRepo(repo.name)}
                          disabled={syncingRepo === repo.name}
                          className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] border border-[#2b2b27]"
                          title="Git Pull (Sync Latest)"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingRepo === repo.name ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                          onClick={() => handleDeleteRepo(repo.name)}
                          disabled={deletingRepo === repo.name}
                          className="p-1.5 rounded-lg text-[#85857a] hover:text-red-400 hover:bg-[#262622] border border-[#2b2b27]"
                          title="Delete from workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {repo.lastCommit && (
                      <div className="p-2 rounded-lg bg-[#121210] border border-[#242421] text-[10px] text-[#85857a] flex items-center gap-2">
                        <span className="text-[#66665e]">Last commit:</span>
                        <span className="font-mono text-[#b4b4aa] truncate">{repo.lastCommit}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-[#85857a] flex flex-col items-center justify-center gap-2">
                  <FolderGit2 className="w-8 h-8 opacity-30 text-[#d97757]" />
                  <p className="text-xs font-medium text-[#ecece7]">No cloned repositories in workspace</p>
                  <p className="text-[11px] max-w-xs">
                    Import a repository from the "Repositories" tab or enter a custom Git URL.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tree Inspection Modal Overlay */}
        {selectedRepoTree && (
          <div className="absolute inset-0 z-20 bg-[#141412] flex flex-col animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#242421] bg-[#181815]">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#d97757]" />
                <span className="font-medium text-xs text-[#ecece7]">
                  repos/{selectedRepoTree.name} File Tree
                </span>
              </div>
              <button
                onClick={() => setSelectedRepoTree(null)}
                className="p-1 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1">
              {selectedRepoTree.tree.length === 0 ? (
                <p className="text-[#85857a]">Empty directory or loading...</p>
              ) : (
                selectedRepoTree.tree.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 py-0.5 text-[#b4b4aa] hover:text-[#ecece7]">
                    {item.type === 'dir' ? (
                      <Folder className="w-3.5 h-3.5 text-[#d97757] shrink-0" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-[#85857a] shrink-0" />
                    )}
                    <span className="truncate">{item.path || item.name}</span>
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
