import { auth } from './auth';
import { isSupabaseConfigured, saveToSupabase, loadFromSupabase } from './supabase';

export interface GitHubUser {
  id: string | number;
  login: string;
  name: string;
  avatar_url: string;
  html_url?: string;
  public_repos?: number;
  total_private_repos?: number;
  email?: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  is_imported?: boolean;
}

export interface ImportedRepo {
  name: string;
  path: string;
  branch: string;
  lastCommit?: string;
  remoteUrl?: string;
  fileCount?: number;
  importedAt?: string;
}

export interface GitHubStatus {
  connected: boolean;
  user: GitHubUser | null;
  authProvider?: string;
  source?: string;
  error?: string;
}

export function fixMojibake(str?: string | null): string {
  if (!str) return '';
  if (/[\u00C0-\u00FF]{2,}/.test(str)) {
    try {
      const bytes = new Uint8Array(Array.from(str).map(c => c.charCodeAt(0) & 0xFF));
      const decoded = new TextDecoder('utf-8').decode(bytes);
      if (decoded && !decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch {}
  }
  return str;
}

export const GitHubService = {
  // 1. Authorize via OAuth (Direct GitHub OAuth or Nexuss Auth)
  async authorizeOAuth(): Promise<GitHubUser | null> {
    return this.authorizeWithNexussAuth();
  },

  async authorizeWithNexussAuth(mode: 'popup' | 'redirect' = 'popup'): Promise<GitHubUser | null> {
    // Check if direct GitHub OAuth URL is available from server (forcing prompt=consent)
    let targetUrl = '';
    try {
      const res = await fetch('/api/github/auth-url?prompt=consent');
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          targetUrl = data.url;
        }
      }
    } catch {
      // Fallback
    }

    if (!targetUrl) {
      const redirectUri = `${window.location.origin}/api/auth/callback?purpose=github_auth`;
      try {
        const loginUrl = new URL(auth.getLoginUrl('github', { redirectUri }));
        loginUrl.searchParams.set('handoff', '1');
        loginUrl.searchParams.set('prompt', 'consent');
        loginUrl.searchParams.set('scope', 'repo,read:user,user:email');
        loginUrl.searchParams.set('purpose', 'github_auth');
        targetUrl = loginUrl.toString();
      } catch {
        const projectId = import.meta.env.VITE_NEXUSS_AUTH_PROJECT_ID || 'ethco-agents';
        const authUrl = import.meta.env.VITE_NEXUSS_AUTH_URL || 'https://nexuss-auth.vercel.app';
        targetUrl = `${authUrl}/oauth/start/github?project_id=${encodeURIComponent(projectId)}&redirect_uri=${encodeURIComponent(redirectUri)}&handoff=1&prompt=consent&scope=${encodeURIComponent('repo,read:user,user:email')}&purpose=github_auth`;
      }
    }

    return new Promise((resolve, reject) => {
      try {
        const width = 600;
        const height = 720;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const authWindow = window.open(
          targetUrl,
          'github_auth_popup',
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
        );

        if (!authWindow) {
          // Fallback redirect if popup blocked
          window.location.href = targetUrl;
          return;
        }

        let cleanupTimer: any = null;
        let safetyTimeout: any = null;

        const handleMessage = (event: MessageEvent) => {
          if (
            (event.data?.type === 'OAUTH_AUTH_SUCCESS' || event.data?.type === 'NEXUSS_AUTH_SUCCESS') &&
            event.data?.user
          ) {
            cleanup();
            resolve(event.data.user);
          }
        };

        const cleanup = () => {
          window.removeEventListener('message', handleMessage);
          if (cleanupTimer) clearInterval(cleanupTimer);
          if (safetyTimeout) clearTimeout(safetyTimeout);
        };

        window.addEventListener('message', handleMessage);

        cleanupTimer = setInterval(async () => {
          if (authWindow.closed) {
            cleanup();
            const status = await GitHubService.getStatus();
            resolve(status.user || null);
          }
        }, 1000);

        // Safety timeout of 20 seconds to prevent getting stuck
        safetyTimeout = setTimeout(async () => {
          cleanup();
          const status = await GitHubService.getStatus();
          resolve(status.user || null);
        }, 20000);
      } catch (err) {
        reject(err);
      }
    });
  },

  // 2. Connect directly via Personal Access Token (PAT)
  async connectWithToken(token: string): Promise<GitHubUser> {
    const res = await fetch('/api/github/connect-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate token with GitHub');
    }
    const user = data.user;
    if (user) {
      try {
        localStorage.setItem('ethco_github_user', JSON.stringify(user));
        localStorage.setItem('ethco_github_token', token.trim());
      } catch {}
      if (isSupabaseConfigured) {
        saveToSupabase('github_auth', {
          id: 'current_github_status',
          user,
          connected: true,
          token: token.trim(),
          updated_at: new Date().toISOString()
        });
      }
    }
    return user;
  },

  // 3. Get Status (reads active token & user info with Supabase fallback)
  async getStatus(): Promise<GitHubStatus> {
    try {
      const res = await fetch('/api/github/status');
      if (res.ok) {
        const data: GitHubStatus = await res.json();
        if (data.connected && data.user) {
          data.user.name = fixMojibake(data.user.name);
          data.user.login = fixMojibake(data.user.login);
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(data.user));
          } catch {}
          if (isSupabaseConfigured) {
            saveToSupabase('github_auth', {
              id: 'current_github_status',
              user: data.user,
              connected: true,
              updated_at: new Date().toISOString()
            });
          }
          return data;
        } else {
          // Check if local storage has an authenticated user before returning disconnected
          try {
            const localUserRaw = localStorage.getItem('ethco_github_user');
            if (localUserRaw) {
              const localUser = JSON.parse(localUserRaw);
              if (localUser && (localUser.login || localUser.name)) {
                localUser.name = fixMojibake(localUser.name);
                localUser.login = fixMojibake(localUser.login);
                return { connected: true, user: localUser, authProvider: 'github' };
              }
            }
          } catch {}
          return { connected: false, user: null };
        }
      }
    } catch {
      // Server check failed, fallback to cloud/local state if offline
    }

    // Check Supabase cloud persistence fallback
    if (isSupabaseConfigured) {
      try {
        const sbData = await loadFromSupabase('github_auth');
        if (sbData && sbData.length > 0) {
          const record = sbData.find((r: any) => r.id === 'current_github_status') || sbData[0];
          if (record && record.connected && record.user) {
            try {
              localStorage.setItem('ethco_github_user', JSON.stringify(record.user));
            } catch {}
            // Sync saved token to server if present
            if (record.token) {
              fetch('/api/github/connect-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: record.token }),
              }).catch(() => {});
            }
            return {
              connected: true,
              user: record.user,
              authProvider: 'supabase-persisted',
              source: 'supabase',
            };
          }
        }
      } catch (sbErr) {
        console.warn('Supabase github_auth fallback note:', sbErr);
      }
    }

    // Check LocalStorage fallback
    try {
      const savedUser = localStorage.getItem('ethco_github_user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        const savedToken = localStorage.getItem('ethco_github_token');
        if (savedToken) {
          fetch('/api/github/connect-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: savedToken }),
          }).catch(() => {});
        }
        return {
          connected: true,
          user,
          authProvider: 'local-persisted',
          source: 'localstorage',
        };
      }
    } catch {}

    return { connected: false, user: null };
  },

  // 4. Disconnect (clears backend, Supabase & local persistence)
  async disconnect(): Promise<void> {
    try {
      await fetch('/api/github/disconnect', { method: 'POST' });
    } catch {}
    try {
      localStorage.removeItem('ethco_github_user');
      localStorage.removeItem('ethco_github_token');
    } catch {}
    if (isSupabaseConfigured) {
      saveToSupabase('github_auth', {
        id: 'current_github_status',
        user: null,
        connected: false,
        token: null,
        updated_at: new Date().toISOString()
      });
    }
  },

  // 5. Fetch Repositories
  async fetchRepos(query?: string): Promise<GitHubRepo[]> {
    const url = query ? `/api/github/repos?q=${encodeURIComponent(query)}` : '/api/github/repos';
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch repositories');
    }
    return data.repos || [];
  },

  // 6. Clone / Import Repo into workspace
  async cloneRepo(params: { repoUrl: string; branch?: string; depth?: number; folderName?: string }): Promise<ImportedRepo> {
    const res = await fetch('/api/github/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to clone repository');
    }
    return data.repository;
  },

  // 7. List Cloned Repos
  async getImportedRepos(): Promise<ImportedRepo[]> {
    const res = await fetch('/api/github/imported');
    if (!res.ok) return [];
    const data = await res.json();
    return data.repos || [];
  },

  // 8. Sync / Pull
  async syncRepo(repoName: string): Promise<{ success: boolean; message: string; lastCommit?: string }> {
    const res = await fetch('/api/github/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to sync repository');
    return data;
  },

  // 9. Delete Cloned Repo
  async deleteImportedRepo(repoName: string): Promise<void> {
    const res = await fetch('/api/github/delete-imported', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete imported repository');
    }
  },

  // 10. Inspect File Tree
  async getRepoTree(repoName: string): Promise<any[]> {
    const res = await fetch(`/api/github/repo-tree?repoName=${encodeURIComponent(repoName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  },
};
