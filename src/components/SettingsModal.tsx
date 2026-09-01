import React, { useState, useEffect } from 'react';
import {
  Github,
  X,
  Loader2,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ExternalLink,
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

  // Listen to postMessage when GitHub OAuth completes
  useEffect(() => {
    const handleGlobalMessage = async (event: MessageEvent) => {
      if (
        event.data?.type === 'OAUTH_AUTH_SUCCESS' &&
        (event.data?.provider === 'github' || !event.data?.provider)
      ) {
        if (event.data?.user) {
          const u = event.data.user;
          u.name = fixMojibake(u.name);
          u.login = fixMojibake(u.login);
          setGhUser(u);
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(u));
          } catch {}
        }
        await loadGitHubData();
      }
    };

    window.addEventListener('message', handleGlobalMessage);
    return () => window.removeEventListener('message', handleGlobalMessage);
  }, []);

  const loadGitHubData = async () => {
    setLoadingStatus(true);
    setErrorMessage(null);
    try {
      const status = await GitHubService.getStatus();
      if (status.connected && status.user) {
        setGhUser(status.user);
        try {
          localStorage.setItem('ethco_github_user', JSON.stringify(status.user));
        } catch {}
      } else {
        const saved = localStorage.getItem('ethco_github_user');
        if (saved) {
          try {
            setGhUser(JSON.parse(saved));
          } catch {}
        } else {
          setGhUser(null);
        }
      }
    } catch {
      // Ignore
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
        className="relative w-full max-w-sm bg-[#0d0d0d] border border-[#262626] rounded-2xl shadow-2xl p-6 text-center animate-in zoom-in-95 duration-150"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#737373] hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Centered Icon or Authenticated Avatar */}
        <div className="flex justify-center mb-5 mt-2">
          {ghUser ? (
            <div className="relative inline-block">
              {ghUser.avatar_url ? (
                <img
                  src={ghUser.avatar_url}
                  alt={fixMojibake(ghUser.name || ghUser.login)}
                  className="w-20 h-20 rounded-full border-2 border-[#d97757] object-cover shadow-xl shadow-[#d97757]/15 ring-4 ring-[#d97757]/10"
                  onError={(e) => {
                    // Fallback if avatar fails to load
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#1c1c1a] border-2 border-[#d97757] flex items-center justify-center shadow-xl text-[#d97757] font-semibold text-xl">
                  {fixMojibake(ghUser.name || ghUser.login).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#121210] border border-[#d97757]/60 text-[#d97757] shadow-md">
                <Github className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-[#171717] border border-[#d97757]/30 flex items-center justify-center shadow-lg shadow-[#d97757]/5">
              <Github className="w-11 h-11 text-[#d97757] stroke-[2.5]" />
            </div>
          )}
        </div>

        {/* State: Loading */}
        {loadingStatus && !ghUser ? (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-[#737373]">
            <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
            <span className="text-xs">Checking authorization...</span>
          </div>
        ) : ghUser ? (
          /* State: Connected & Persisted */
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected &amp; Authorized</span>
              </div>
              <h2
                className="text-lg font-semibold text-white tracking-tight leading-snug px-2"
                dir="auto"
                title={fixMojibake(ghUser.name || ghUser.login)}
              >
                {fixMojibake(ghUser.name || ghUser.login)}
              </h2>
              <div className="flex items-center justify-center gap-1.5 mt-1 text-xs text-[#a3a3a3] font-mono">
                <span>@{fixMojibake(ghUser.login)}</span>
                {ghUser.html_url && (
                  <a
                    href={ghUser.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#737373] hover:text-[#d97757] transition-colors inline-flex items-center"
                    title="View GitHub profile"
                  >
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                )}
              </div>
              {ghUser.email && (
                <p className="text-[11px] text-[#737373] mt-1 truncate">
                  {ghUser.email}
                </p>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <button
                id="btn-reconfigure-github"
                onClick={handleAuthorizeOAuth}
                disabled={authorizing}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {authorizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Authorizing...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 stroke-[2.2]" />
                    <span>Reconfigure Connection</span>
                  </>
                )}
              </button>

              <button
                id="btn-disconnect-github"
                onClick={handleDisconnect}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-medium text-[#a3a3a3] hover:text-red-400 hover:bg-[#1a1a1a] border border-[#262626] hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          /* State: Not Connected (Single Button Auth Only) */
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                GitHub Authorization
              </h2>
              <p className="text-xs text-[#737373] mt-1.5 leading-relaxed">
                Authorize your GitHub account to connect your developer identity.
              </p>
            </div>

            {errorMessage && (
              <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                {errorMessage}
              </p>
            )}

            <button
              id="btn-settings-authorize-github"
              onClick={handleAuthorizeOAuth}
              disabled={authorizing}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2.5 shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50"
            >
              {authorizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Authorizing...</span>
                </>
              ) : (
                <>
                  <Github className="w-4 h-4 text-white stroke-[2.5]" />
                  <span>Authorize GitHub</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
