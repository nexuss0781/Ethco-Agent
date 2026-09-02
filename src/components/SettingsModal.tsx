import React, { useState, useEffect } from 'react';
import {
  Github,
  X,
  Loader2,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ExternalLink,
  Shield,
  User as UserIcon,
  Mail,
  Lock,
  AtSign,
  Sparkles,
} from 'lucide-react';
import { GitHubService, GitHubUser, fixMojibake } from '../lib/github';
import { logout } from '../lib/auth';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadGitHubData();
    }
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
        u.login = fixMojibake(u.login || u.name || u.email?.split('@')[0] || 'github_user');
        setGhUser(u);
        try {
          localStorage.setItem('ethco_github_user', JSON.stringify(u));
          if (event.data?.token) localStorage.setItem('ethco_github_token', event.data.token);
        } catch {}
        await loadGitHubData();
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'ethco_github_user' && e.newValue) {
        try {
          setGhUser(JSON.parse(e.newValue));
        } catch {}
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
          loadGitHubData();
        }
      };
    } catch {}

    window.addEventListener('message', handleGlobalMessage);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('message', handleGlobalMessage);
      window.removeEventListener('storage', handleStorageChange);
      if (bc) {
        try { bc.close(); } catch {}
      }
    };
  }, []);

  const loadGitHubData = async () => {
    setLoadingStatus(true);
    setErrorMessage(null);
    try {
      const status = await GitHubService.getStatus();
      if (status.connected && status.user && status.user.login) {
        setGhUser(status.user);
        try {
          localStorage.setItem('ethco_github_user', JSON.stringify(status.user));
        } catch {}
      } else {
        setGhUser(null);
        try {
          localStorage.removeItem('ethco_github_user');
        } catch {}
      }
    } catch (err: any) {
      console.error('Failed to load GitHub status:', err);
      setGhUser(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await GitHubService.disconnect();
      setGhUser(null);
      try {
        localStorage.removeItem('ethco_github_user');
      } catch {}
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to disconnect');
    }
  };

  if (!isOpen) return null;

  // Compute authorized user details
  const realName = fixMojibake(user?.name || ghUser?.name || (user?.email ? user.email.split('@')[0] : 'Developer'));
  const username = fixMojibake(user?.username || ghUser?.login || (user?.email ? user.email.split('@')[0] : 'developer'));
  const avatarUrl = user?.avatar || ghUser?.avatar_url || null;
  const authGmail = user?.email || 'unique0781@gmail.com';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="settings-modal"
        className="relative w-full max-w-lg bg-[#0e0e0c] border border-[#282824] rounded-2xl shadow-2xl p-6 text-left animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#85857a] hover:text-[#ecece7] hover:bg-[#20201d] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#ecece7] tracking-tight flex items-center gap-2">
            <span>Settings & Account</span>
          </h2>
          <p className="text-xs text-[#85857a] mt-0.5">
            Manage your authenticated profile and linked accounts.
          </p>
        </div>

        <div className="space-y-5">
          {/* Section 1: Authorized Profile Card (Real Name, Avatar, Username, and Intact Gmail) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141412] border border-[#262622] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22221f]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#85857a] flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-[#d97757]" />
                <span>Authorized Profile</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Active Session
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              {/* Authorized Avatar */}
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={realName}
                    className="w-16 h-16 rounded-2xl border-2 border-[#d97757]/80 object-cover shadow-md bg-[#181815]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#20201d] border-2 border-[#d97757]/80 flex items-center justify-center text-[#d97757] text-xl font-bold shadow-md">
                    {realName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#141412] border border-[#2b2b27] flex items-center justify-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                </div>
              </div>

              {/* Profile Information: Real Name, @username & Intact Gmail */}
              <div className="space-y-2 flex-1 text-center sm:text-left min-w-0">
                <div>
                  <div className="text-base font-bold text-[#ecece7] tracking-tight truncate">
                    {realName}
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-1 text-xs text-[#d97757] font-mono mt-0.5">
                    <AtSign className="w-3 h-3 text-[#d97757]" />
                    <span className="font-medium">{username}</span>
                  </div>
                </div>

                {/* Authenticated Gmail (Intact Authentication) */}
                <div className="p-2.5 rounded-xl bg-[#1a1a17] border border-[#282824] flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-[#252521] border border-[#33332e] flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5 text-[#d97757]" />
                    </div>
                    <div className="truncate">
                      <div className="text-[10px] text-[#85857a] uppercase font-semibold">Authentication Gmail</div>
                      <div className="text-xs font-medium text-[#ecece7] truncate font-mono">{authGmail}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#22221f] text-emerald-400 border border-emerald-500/20 shrink-0">
                    Verified
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: GitHub Authorization & Repositories Access */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141412] border border-[#262622] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#22221f]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#85857a] flex items-center gap-1.5">
                <Github className="w-3.5 h-3.5 text-[#d97757]" />
                <span>GitHub Integration</span>
              </span>
              {ghUser && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              )}
            </div>

            {loadingStatus && !ghUser ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#85857a]">
                <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                <span className="text-xs">Checking GitHub authorization status...</span>
              </div>
            ) : ghUser ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#1a1a17] border border-[#282824]">
                  {ghUser.avatar_url ? (
                    <img
                      src={ghUser.avatar_url}
                      alt={ghUser.login}
                      className="w-11 h-11 rounded-xl border border-[#383832] object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#252521] border border-[#383832] flex items-center justify-center text-[#d97757] font-bold">
                      GH
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-xs text-[#ecece7] truncate">
                      {ghUser.name || ghUser.login}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#85857a] font-mono">
                      <span>@{ghUser.login}</span>
                      {ghUser.html_url && (
                        <a
                          href={ghUser.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-[#d97757] transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5 inline" />
                        </a>
                      )}
                    </div>
                    {typeof ghUser.public_repos === 'number' && (
                      <div className="text-[10px] text-[#66665e] mt-0.5">
                        {ghUser.public_repos} public repositories available
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <a
                    id="btn-reconfigure-github"
                    href={GitHubService.getLoginUrl()}
                    className="flex-1 py-2 px-3 rounded-xl text-xs font-semibold bg-[#22221f] hover:bg-[#2c2c28] text-[#ecece7] transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#33332e]"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#d97757]" />
                    <span>Re-authorize</span>
                  </a>
                  <button
                    id="btn-disconnect-github"
                    onClick={handleDisconnect}
                    className="py-2 px-3.5 rounded-xl text-xs font-medium text-[#85857a] hover:text-red-400 hover:bg-[#1a1a17] border border-[#2b2b27] hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-3 py-3">
                <div className="w-12 h-12 rounded-xl bg-[#1c1c1a] border border-[#33332e] flex items-center justify-center">
                  <Github className="w-6 h-6 text-[#ecece7]" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-[#ecece7]">Connect GitHub Account</h4>
                  <p className="text-[11px] text-[#85857a] max-w-xs mt-0.5">
                    Authorize to explore and clone all your public & private repositories directly into your workspace.
                  </p>
                </div>

                {errorMessage && (
                  <p className="w-full text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-left">
                    {errorMessage}
                  </p>
                )}

                <a
                  id="btn-settings-authorize-github"
                  href={GitHubService.getLoginUrl()}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#e08668] text-white transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Github className="w-4 h-4" />
                  <span>Authorize GitHub</span>
                </a>
              </div>
            )}
          </div>

          {/* Footer Sign Out */}
          <div className="pt-2 flex items-center justify-between text-xs text-[#85857a] px-1 border-t border-[#20201d]">
            <span className="truncate max-w-[280px]">Session authenticated via {authGmail}</span>
            <button
              onClick={() => logout()}
              className="text-[#85857a] hover:text-red-400 transition-colors cursor-pointer text-xs font-medium flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

