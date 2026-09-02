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
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [connectingToken, setConnectingToken] = useState(false);

  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [showClientConfig, setShowClientConfig] = useState(false);
  const [savingClientConfig, setSavingClientConfig] = useState(false);
  const [clientSecretConfigured, setClientSecretConfigured] = useState(false);

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setConnectingToken(true);
    setErrorMessage(null);
    try {
      const u = await GitHubService.connectToken(tokenInput.trim());
      setGhUser(u);
      setShowTokenInput(false);
      setTokenInput('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid token');
    } finally {
      setConnectingToken(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadGitHubData();
    }
  }, [isOpen]);

  // Listen to postMessage when GitHub OAuth completes
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
        } catch {}
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
      try {
        const cfg = await GitHubService.getClientConfig();
        if (cfg.clientId) setClientIdInput(cfg.clientId);
        setClientSecretConfigured(cfg.clientSecretConfigured);
      } catch {}
    } catch (err: any) {
      console.error('Failed to load GitHub status:', err);
      setGhUser(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSaveClientConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClientConfig(true);
    setErrorMessage(null);
    try {
      await GitHubService.saveClientConfig(clientIdInput, clientSecretInput);
      setClientSecretConfigured(true);
      setClientSecretInput('');
      setShowClientConfig(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save GitHub client config');
    } finally {
      setSavingClientConfig(false);
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
          <p className="text-xs text-[#737373] mt-0.5">Your active Google account session with GitHub repository integration.</p>
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
          <div className="p-3.5 rounded-xl bg-[#141412] border border-[#262626]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-semibold text-[#85857a] uppercase tracking-wider flex items-center gap-1.5">
                <Github className="w-3.5 h-3.5 text-[#d97757]" />
                <span>GitHub Profile & Repository Auth</span>
              </div>
              {ghUser && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Authorized</span>
                </span>
              )}
            </div>

            {loadingStatus && !ghUser ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-[#737373]">
                <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
                <span className="text-xs">Checking GitHub authorization...</span>
              </div>
            ) : ghUser ? (
              <div className="py-2 flex flex-col items-center text-center space-y-3">
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

                {/* Reconfigure & Disconnect Actions */}
                <div className="flex items-center justify-center gap-2 pt-2 w-full">
                  <button
                    id="btn-reconfigure-github"
                    onClick={handleAuthorizeOAuth}
                    disabled={authorizing}
                    className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-[#22221f] hover:bg-[#2c2c28] text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-[#33332e] disabled:opacity-50"
                  >
                    {authorizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d97757]" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-[#d97757]" />
                    )}
                    <span>Reconfigure</span>
                  </button>
                  <button
                    id="btn-disconnect-github"
                    onClick={handleDisconnect}
                    className="py-2 px-3 rounded-lg text-xs font-medium text-[#a3a3a3] hover:text-red-400 hover:bg-[#1a1a1a] border border-[#262626] hover:border-red-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[#737373] leading-relaxed">
                  Authorize GitHub to display your <strong className="text-white">@nexuss0781</strong> profile name & avatar here and enable repository importing.
                </p>
                {errorMessage && (
                  <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2" dir="auto">
                    {errorMessage}
                  </p>
                )}
                <button
                  id="btn-settings-authorize-github"
                  onClick={handleAuthorizeOAuth}
                  disabled={authorizing}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {authorizing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Authorizing...</span>
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 text-white stroke-[2.5]" />
                      <span>Authorize GitHub Profile</span>
                    </>
                  )}
                </button>

                {/* Native GitHub App Client ID & Secret configuration */}
                <div className="pt-2 border-t border-[#262626]">
                  {!showClientConfig ? (
                    <button
                      type="button"
                      onClick={() => setShowClientConfig(true)}
                      className="text-[11px] text-[#85857a] hover:text-[#d97757] transition-colors underline cursor-pointer w-full text-center"
                    >
                      {clientIdInput ? '⚙️ Update Native GitHub OAuth App Credentials' : '⚙️ Configure Native GitHub App (Client ID & Secret)'}
                    </button>
                  ) : (
                    <form onSubmit={handleSaveClientConfig} className="space-y-2.5 pt-1 bg-[#141412] p-3 rounded-xl border border-[#262626] text-left">
                      <div className="text-[11px] font-semibold text-white">Native GitHub App Authorization</div>
                      <div className="text-[10px] text-[#737373]">Provide your GitHub OAuth App Client ID and Client Secret for direct authorization:</div>
                      <div>
                        <label className="block text-[10px] text-[#a3a3a3] mb-1">GitHub Client ID</label>
                        <input
                          type="text"
                          value={clientIdInput}
                          onChange={(e) => setClientIdInput(e.target.value)}
                          placeholder="Ov23li..."
                          className="w-full px-3 py-1.5 bg-[#1a1a18] border border-[#33332e] rounded-lg text-xs text-white placeholder-[#737373] focus:outline-none focus:border-[#d97757]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#a3a3a3] mb-1">GitHub Client Secret {clientSecretConfigured && '(configured)'}</label>
                        <input
                          type="password"
                          value={clientSecretInput}
                          onChange={(e) => setClientSecretInput(e.target.value)}
                          placeholder={clientSecretConfigured ? "••••••••••••••••" : "client_secret_..."}
                          className="w-full px-3 py-1.5 bg-[#1a1a18] border border-[#33332e] rounded-lg text-xs text-white placeholder-[#737373] focus:outline-none focus:border-[#d97757]"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={savingClientConfig || !clientIdInput.trim()}
                          className="flex-1 py-1.5 px-3 bg-[#d97757] hover:bg-[#c66647] text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          {savingClientConfig ? 'Saving...' : 'Save Credentials'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowClientConfig(false)}
                          className="py-1.5 px-3 bg-[#22221f] text-[#a3a3a3] hover:text-white text-xs rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="pt-2 border-t border-[#262626]">
                  {!showTokenInput ? (
                    <button
                      type="button"
                      onClick={() => setShowTokenInput(true)}
                      className="text-[11px] text-[#85857a] hover:text-[#d97757] transition-colors underline cursor-pointer w-full text-center"
                    >
                      Wrong account showing? Connect via Personal Access Token for @nexuss0781
                    </button>
                  ) : (
                    <form onSubmit={handleConnectToken} className="space-y-2 pt-1">
                      <div className="text-[11px] text-[#a3a3a3]">
                        Enter GitHub Personal Access Token for <code className="text-white font-mono">nexuss0781</code>:
                      </div>
                      <input
                        type="password"
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxx"
                        className="w-full px-3 py-2 bg-[#1a1a18] border border-[#33332e] rounded-lg text-xs text-white placeholder-[#737373] focus:outline-none focus:border-[#d97757]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={connectingToken || !tokenInput.trim()}
                          className="flex-1 py-1.5 px-3 bg-[#d97757] hover:bg-[#c66647] text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          {connectingToken ? 'Connecting...' : 'Connect Token'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowTokenInput(false)}
                          className="py-1.5 px-3 bg-[#22221f] text-[#a3a3a3] hover:text-white text-xs rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
