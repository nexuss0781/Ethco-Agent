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
} from 'lucide-react';
import { GitHubService, GitHubUser, fixMojibake } from '../lib/github';

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
  const [authorizing, setAuthorizing] = useState(false);
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

  const handleAuthorizeOAuth = async () => {
    setAuthorizing(true);
    setErrorMessage(null);
    try {
      const resUser = await GitHubService.authorizeOAuth();
      if (resUser) {
        setGhUser(resUser);
        try {
          localStorage.setItem('ethco_github_user', JSON.stringify(resUser));
        } catch {}
      } else {
        const status = await GitHubService.getStatus();
        if (status.connected && status.user) {
          setGhUser(status.user);
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(status.user));
          } catch {}
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authorization failed. Please try again.');
    } finally {
      setAuthorizing(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="settings-modal"
        className="relative w-full max-w-md bg-[#0d0d0d] border border-[#262626] rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#737373] hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white tracking-tight">Account & Settings</h2>
          <p className="text-xs text-[#737373] mt-0.5">Manage your session and GitHub repository integration.</p>
        </div>

        <div className="space-y-4 text-left">
          {/* Google Account Section */}
          <div className="p-3.5 rounded-xl bg-[#141412] border border-[#262626] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#3b82f6]/15 border border-[#3b82f6]/30 flex items-center justify-center text-[#3b82f6] shrink-0">
              {user?.avatar ? (
                <img src={user.avatar} alt="Google" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-[#85857a] uppercase tracking-wider flex items-center gap-1">
                <span>Google Account</span>
                <span className="text-emerald-400 text-[10px] lowercase font-normal">(primary login)</span>
              </div>
              <div className="text-xs font-medium text-white truncate mt-0.5">
                {user?.name || user?.email || 'Google User'}
              </div>
              <div className="text-[11px] text-[#737373] truncate">
                {user?.email || 'Connected via Google'}
              </div>
            </div>
          </div>

          {/* GitHub Repository Authorization Section */}
          <div className="p-5 rounded-xl bg-[#141412] border border-[#262626]">
            {loadingStatus && !ghUser ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-[#737373]">
                <Loader2 className="w-6 h-6 animate-spin text-[#d97757]" />
                <span className="text-xs">Checking authorization status...</span>
              </div>
            ) : ghUser ? (
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Authorized</span>
                </div>

                {/* Avatar centered */}
                {ghUser.avatar_url ? (
                  <img
                    src={ghUser.avatar_url}
                    alt={fixMojibake(ghUser.name || ghUser.login)}
                    className="w-16 h-16 rounded-full border-2 border-[#d97757]/70 object-cover shadow-lg"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#1c1c1a] border-2 border-[#d97757]/70 flex items-center justify-center text-[#d97757] text-lg font-bold">
                    {fixMojibake(ghUser.name || ghUser.login).charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Name & Handle */}
                <div className="space-y-0.5">
                  <div
                    className="text-base font-bold text-white tracking-tight"
                    title={fixMojibake(ghUser.name || ghUser.login)}
                  >
                    {fixMojibake(ghUser.name || ghUser.login)}
                  </div>
                  <div className="flex items-center justify-center gap-1 text-xs text-[#a3a3a3] font-mono">
                    <span>@{fixMojibake(ghUser.login)}</span>
                    {ghUser.html_url && (
                      <a
                        href={ghUser.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#737373] hover:text-[#d97757] transition-colors"
                        title="View GitHub profile"
                      >
                        <ExternalLink className="w-3 h-3 ml-0.5 inline" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Re-authorize & Disconnect Actions */}
                <div className="flex items-center justify-center gap-2 pt-2 w-full">
                  <button
                    id="btn-reconfigure-github"
                    onClick={handleAuthorizeOAuth}
                    disabled={authorizing}
                    className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold bg-[#22221f] hover:bg-[#2c2c28] text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#33332e] disabled:opacity-50"
                  >
                    {authorizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d97757]" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-[#d97757]" />
                    )}
                    <span>Re-authorize</span>
                  </button>
                  <button
                    id="btn-disconnect-github"
                    onClick={handleDisconnect}
                    className="py-2.5 px-4 rounded-xl text-xs font-medium text-[#a3a3a3] hover:text-red-400 hover:bg-[#1a1a1a] border border-[#262626] hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-4 py-2">
                {/* Big GitHub Icon */}
                <div className="w-16 h-16 rounded-2xl bg-[#1c1c1a] border border-[#33332e] flex items-center justify-center shadow-md">
                  <Github className="w-9 h-9 text-white" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white">GitHub Integration</h3>
                  <p className="text-xs text-[#737373] max-w-[280px]">
                    Authorize your GitHub account to access and sync repositories.
                  </p>
                </div>

                {errorMessage && (
                  <p className="w-full text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-left" dir="auto">
                    {errorMessage}
                  </p>
                )}

                {/* Big Authorize Button */}
                <button
                  id="btn-settings-authorize-github"
                  onClick={handleAuthorizeOAuth}
                  disabled={authorizing}
                  className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {authorizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 text-white stroke-[2.5]" />
                      <span>Authorize with GitHub</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
