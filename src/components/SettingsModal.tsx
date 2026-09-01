import React, { useState, useEffect } from 'react';
import {
  Settings,
  Github,
  Check,
  ShieldCheck,
  ExternalLink,
  LogOut,
  Sparkles,
  RefreshCw,
  X,
  Loader2,
  FolderGit2,
  Lock,
  Globe,
  Sliders,
  UserCheck,
  KeyRound,
  Download
} from 'lucide-react';
import { GitHubService, GitHubUser, GitHubRepo } from '../lib/github';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onOpenGitHubRepos?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onOpenGitHubRepos,
}) => {
  const [activeTab, setActiveTab] = useState<'github' | 'general' | 'account'>('github');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadGitHubData();
    }
  }, [isOpen]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadGitHubData = async () => {
    setLoadingStatus(true);
    try {
      const status = await GitHubService.getStatus();
      setGhUser(status.user);
      if (status.user) {
        const repoList = await GitHubService.fetchRepos();
        setRepos(repoList.slice(0, 6));
      }
    } catch {
      // Ignored
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleAuthorizeGitHub = async () => {
    setAuthorizing(true);
    try {
      const resUser = await GitHubService.authorizeWithNexussAuth('popup');
      if (resUser) {
        setGhUser(resUser);
        showToast('success', `GitHub authorized successfully via Nexuss Auth for @${resUser.login || resUser.name}`);
        loadGitHubData();
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to authorize GitHub');
    } finally {
      setAuthorizing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await GitHubService.disconnect();
      setGhUser(null);
      setRepos([]);
      showToast('success', 'Disconnected GitHub account.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to disconnect');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="settings-modal"
        className="relative w-full max-w-2xl bg-[#141412] border border-[#2b2b27] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242421] bg-[#181815]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#20201c] border border-[#33332e] flex items-center justify-center text-[#d97757]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#ecece7]">Settings & Integrations</h2>
              <p className="text-[11px] text-[#85857a]">Manage GitHub authorization, connected accounts, and preferences.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#262622] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`px-5 py-2 text-xs flex items-center justify-between border-b ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex items-center px-5 pt-2 border-b border-[#242421] bg-[#141412] gap-2">
          <button
            onClick={() => setActiveTab('github')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'github'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub Authorization</span>
            {ghUser && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'account'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Account (Nexuss Auth)</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'general'
                ? 'border-[#d97757] text-[#ecece7]'
                : 'border-transparent text-[#85857a] hover:text-[#b4b4aa]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>General</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {activeTab === 'github' && (
            <div className="space-y-4">
              {/* GitHub Auth Card */}
              <div className="p-4 rounded-xl bg-[#181815] border border-[#282824] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#22221e] border border-[#33332e] flex items-center justify-center">
                      <Github className="w-5 h-5 text-[#d97757]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[#ecece7]">GitHub Integration</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#282824] text-[#d97757] border border-[#383832]">
                          Nexuss Auth Central
                        </span>
                      </div>
                      <p className="text-[11px] text-[#85857a] mt-0.5">
                        Authorize repository access to import, sync, and inspect codebases directly in Ethco.
                      </p>
                    </div>
                  </div>
                </div>

                {loadingStatus ? (
                  <div className="py-4 flex items-center justify-center gap-2 text-[#85857a]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#d97757]" />
                    <span>Checking authorization status...</span>
                  </div>
                ) : ghUser ? (
                  <div className="p-3 bg-[#131311] border border-emerald-500/20 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {ghUser.avatar_url ? (
                        <img src={ghUser.avatar_url} alt={ghUser.login} className="w-8 h-8 rounded-full border border-[#383832]" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#2a2a26] flex items-center justify-center font-bold text-xs">GH</div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-[#ecece7]">{ghUser.name || ghUser.login}</span>
                          <span className="text-[11px] text-[#85857a]">(@{ghUser.login})</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-emerald-400">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Authorized & Verified via Nexuss Auth</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onOpenGitHubRepos && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenGitHubRepos();
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#282824] hover:bg-[#32322c] border border-[#383832] text-[#ecece7] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FolderGit2 className="w-3.5 h-3.5 text-[#d97757]" />
                          <span>Browse Repos</span>
                        </button>
                      )}
                      <button
                        onClick={handleDisconnect}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-all cursor-pointer"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-[#131311] border border-[#2b2b27] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium text-xs text-[#ecece7] flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#d97757]" />
                        <span>Not Authorized</span>
                      </div>
                      <p className="text-[11px] text-[#85857a]">
                        Click Authorize to grant GitHub repo access with 1 click via Nexuss Auth. No manual API keys required.
                      </p>
                    </div>
                    <button
                      id="btn-settings-authorize-github"
                      onClick={handleAuthorizeGitHub}
                      disabled={authorizing}
                      className="px-4 py-2 rounded-xl text-xs font-medium bg-[#d97757] hover:bg-[#e08668] text-white transition-all shadow-xs flex items-center gap-2 shrink-0 cursor-pointer"
                    >
                      {authorizing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Github className="w-4 h-4" />
                      )}
                      <span>Authorize GitHub</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Repositories preview if connected */}
              {ghUser && repos.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#b4b4aa]">Accessible Repositories</span>
                    {onOpenGitHubRepos && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenGitHubRepos();
                        }}
                        className="text-[11px] text-[#d97757] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>View All & Clone</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {repos.map((r) => (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-lg bg-[#181815] border border-[#242421] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-xs text-[#ecece7] truncate">
                            {r.private ? <Lock className="w-3 h-3 text-[#d97757] shrink-0" /> : <Globe className="w-3 h-3 text-[#85857a] shrink-0" />}
                            <span className="truncate">{r.name}</span>
                          </div>
                          {r.language && <span className="text-[10px] text-[#85857a]">{r.language}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#181815] border border-[#282824] space-y-3">
                <span className="font-semibold text-xs text-[#ecece7]">Nexuss Auth Profile</span>
                <div className="flex items-center gap-3">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="User avatar" className="w-10 h-10 rounded-full border border-[#33332e]" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#2b2b27] flex items-center justify-center font-bold text-xs">
                      {user?.name?.[0] || 'U'}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-xs text-[#ecece7]">{user?.name || 'Authenticated User'}</div>
                    <div className="text-[11px] text-[#85857a]">{user?.email || 'Active Session'}</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#121210] border border-[#242421] space-y-1.5 text-[11px] text-[#85857a]">
                  <div className="flex justify-between">
                    <span>Project ID:</span>
                    <span className="font-mono text-[#ecece7]">ethco-agents</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Session Model:</span>
                    <span className="text-emerald-400">Server Handoff (HTTP-Only)</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cross-Site Token Exchange:</span>
                    <span className="text-emerald-400">Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#181815] border border-[#282824] space-y-3">
                <span className="font-semibold text-xs text-[#ecece7]">Workspace Preferences</span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1.5 border-b border-[#242421]">
                    <div>
                      <div className="font-medium text-xs text-[#ecece7]">Auto-format Code Output</div>
                      <div className="text-[10px] text-[#85857a]">Syntax highlights and line formatting for code snippets</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <div>
                      <div className="font-medium text-xs text-[#ecece7]">Workspace Storage Location</div>
                      <div className="text-[10px] text-[#85857a]">Local persistent clone directory for Git repositories</div>
                    </div>
                    <span className="font-mono text-[11px] text-[#b4b4aa] bg-[#22221e] px-1.5 py-0.5 rounded">
                      repos/
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
