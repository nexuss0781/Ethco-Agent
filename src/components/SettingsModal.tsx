import React, { useState, useEffect } from 'react';
import {
  Github,
  X,
  Loader2,
  CheckCircle2,
  FolderGit2
} from 'lucide-react';
import { GitHubService, GitHubUser } from '../lib/github';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any;
  onOpenGitHubRepos?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenGitHubRepos,
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

  const loadGitHubData = async () => {
    setLoadingStatus(true);
    setErrorMessage(null);
    try {
      const status = await GitHubService.getStatus();
      setGhUser(status.user);
    } catch {
      // Ignore
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleAuthorizeGitHub = async () => {
    setAuthorizing(true);
    setErrorMessage(null);
    try {
      const resUser = await GitHubService.authorizeWithNexussAuth('popup');
      if (resUser) {
        setGhUser(resUser);
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

        {/* Big Centered Bold Orange GitHub Logo */}
        <div className="flex justify-center mb-5 mt-2">
          <div className="w-20 h-20 rounded-2xl bg-[#171717] border border-[#d97757]/30 flex items-center justify-center shadow-lg shadow-[#d97757]/5">
            <Github className="w-11 h-11 text-[#d97757] stroke-[2.5]" />
          </div>
        </div>

        {/* State: Loading */}
        {loadingStatus ? (
          <div className="py-6 flex flex-col items-center justify-center gap-2 text-[#737373]">
            <Loader2 className="w-5 h-5 animate-spin text-[#d97757]" />
            <span className="text-xs">Checking authorization...</span>
          </div>
        ) : ghUser ? (
          /* State: Connected */
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-medium mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Authorized</span>
              </div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {ghUser.name || ghUser.login}
              </h2>
              <p className="text-xs text-[#a3a3a3] font-mono mt-0.5">
                @{ghUser.login}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              {onOpenGitHubRepos && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenGitHubRepos();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <FolderGit2 className="w-4 h-4 stroke-[2.2]" />
                  <span>Import & Browse Git Repos</span>
                </button>
              )}

              <button
                onClick={handleDisconnect}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-medium text-[#a3a3a3] hover:text-red-400 hover:bg-[#1a1a1a] border border-[#262626] hover:border-red-500/30 transition-all cursor-pointer"
              >
                Disconnect GitHub
              </button>
            </div>
          </div>
        ) : (
          /* State: Not Connected (Single Button Auth) */
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                GitHub Authorization
              </h2>
              <p className="text-xs text-[#737373] mt-1.5 leading-relaxed">
                Authorize your GitHub account to import repositories directly into chats.
              </p>
            </div>

            {errorMessage && (
              <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                {errorMessage}
              </p>
            )}

            <button
              id="btn-settings-authorize-github"
              onClick={handleAuthorizeGitHub}
              disabled={authorizing}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold bg-[#d97757] hover:bg-[#c66647] active:bg-[#b5583b] text-white transition-all flex items-center justify-center gap-2.5 shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
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
