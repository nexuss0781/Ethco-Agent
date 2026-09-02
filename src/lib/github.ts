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
  // Helper to get local token
  getLocalToken(): string | null {
    try {
      return localStorage.getItem('ethco_github_token');
    } catch {
      return null;
    }
  },

  // Helper to get request headers with token
  getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...customHeaders };
    const token = this.getLocalToken();
    if (token) {
      headers['x-github-token'] = token;
    }
    return headers;
  },

  // 1. Authorize via direct GitHub OAuth
  async authorizeOAuth(): Promise<GitHubUser | null> {
    const res = await fetch('/api/github/auth-url');
    const data = await res.json();
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'GitHub Client ID not configured in server environment.');
    }
    const targetUrl = data.url;

    return new Promise((resolve, reject) => {
      try {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        let authWindow: Window | null = null;
        if (!isMobile) {
          const width = 600;
          const height = 720;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          authWindow = window.open(
            targetUrl,
            'github_auth_popup',
            `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
          );
        }

        if (!authWindow) {
          // Full page redirect if popup blocked or on mobile
          window.location.href = targetUrl;
          return;
        }

        let cleanupTimer: any = null;
        let safetyTimeout: any = null;
        let bc: BroadcastChannel | null = null;

        const handleSuccess = (user: any, token?: string) => {
          cleanup();
          const cleanUser: GitHubUser = {
            ...user,
            name: fixMojibake(user.name || user.login),
            login: fixMojibake(user.login || user.name),
          };
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(cleanUser));
            if (token) localStorage.setItem('ethco_github_token', token);
          } catch {}
          resolve(cleanUser);
        };

        const handleMessage = (event: MessageEvent) => {
          if ((event.data?.type === 'OAUTH_AUTH_SUCCESS' || event.data?.type === 'NEXUSS_AUTH_SUCCESS') && event.data?.user) {
            handleSuccess(event.data.user, event.data.token);
          }
        };

        const handleStorage = (event: StorageEvent) => {
          if (event.key === 'ethco_github_user' && event.newValue) {
            try {
              const u = JSON.parse(event.newValue);
              handleSuccess(u);
            } catch {}
          }
        };

        try {
          bc = new BroadcastChannel('github_oauth_channel');
          bc.onmessage = (event) => {
            if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
              handleSuccess(event.data.user, event.data.token);
            }
          };
        } catch {}

        const cleanup = () => {
          window.removeEventListener('message', handleMessage);
          window.removeEventListener('storage', handleStorage);
          if (bc) {
            try { bc.close(); } catch {}
          }
          if (cleanupTimer) clearInterval(cleanupTimer);
          if (safetyTimeout) clearTimeout(safetyTimeout);
        };

        window.addEventListener('message', handleMessage);
        window.addEventListener('storage', handleStorage);

        cleanupTimer = setInterval(async () => {
          if (authWindow && authWindow.closed) {
            cleanup();
            const status = await GitHubService.getStatus();
            resolve(status.user || null);
          }
        }, 800);

        safetyTimeout = setTimeout(async () => {
          cleanup();
          const status = await GitHubService.getStatus();
          resolve(status.user || null);
        }, 45000);
      } catch (err) {
        reject(err);
      }
    });
  },

  // 3. Get Status (reads active token & user info from server or validated client storage)
  async getStatus(): Promise<GitHubStatus> {
    const localToken = this.getLocalToken();
    let localUser: GitHubUser | null = null;
    try {
      const raw = localStorage.getItem('ethco_github_user');
      if (raw) localUser = JSON.parse(raw);
    } catch {}

    try {
      const res = await fetch('/api/github/status', {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data: GitHubStatus = await res.json();
        if (data.connected && data.user && data.user.login) {
          data.user.name = fixMojibake(data.user.name);
          data.user.login = fixMojibake(data.user.login);
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(data.user));
          } catch {}
          return data;
        }
      }
    } catch {}

    // Fallback: validate token directly against GitHub API if client has local token
    if (localToken) {
      try {
        const ghRes = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${localToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        if (ghRes.ok) {
          const liveUser = await ghRes.json();
          const user: GitHubUser = {
            id: liveUser.id,
            login: fixMojibake(liveUser.login),
            name: fixMojibake(liveUser.name || liveUser.login),
            avatar_url: liveUser.avatar_url,
            html_url: liveUser.html_url,
            public_repos: liveUser.public_repos,
            total_private_repos: liveUser.total_private_repos,
          };
          try {
            localStorage.setItem('ethco_github_user', JSON.stringify(user));
          } catch {}
          return { connected: true, user, authProvider: 'github' };
        }
      } catch {}
    }

    if (localUser && localUser.login) {
      return { connected: true, user: localUser, authProvider: 'github' };
    }

    try {
      localStorage.removeItem('ethco_github_user');
    } catch {}
    return { connected: false, user: null };
  },

  // 4. Disconnect (clears backend, Supabase & local persistence)
  async disconnect(): Promise<void> {
    try {
      await fetch('/api/github/disconnect', { method: 'POST', headers: this.getHeaders() });
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
    const res = await fetch(url, {
      headers: this.getHeaders(),
    });
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
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
    const res = await fetch('/api/github/imported', {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.repos || [];
  },

  // 8. Sync / Pull
  async syncRepo(repoName: string): Promise<{ success: boolean; message: string; lastCommit?: string }> {
    const res = await fetch('/api/github/sync', {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
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
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ repoName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete imported repository');
    }
  },

  // 10. Inspect File Tree
  async getRepoTree(repoName: string): Promise<any[]> {
    const res = await fetch(`/api/github/repo-tree?repoName=${encodeURIComponent(repoName)}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  },

  // 11. Connect via Personal Access Token
  async connectToken(token: string): Promise<GitHubUser> {
    const res = await fetch('/api/github/connect-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to connect GitHub token');
    }
    return data.user;
  },

  // 12. Native GitHub Client Config
  async getClientConfig(): Promise<{ clientId: string; clientSecretConfigured: boolean }> {
    const res = await fetch('/api/github/client-config');
    if (!res.ok) return { clientId: '', clientSecretConfigured: false };
    return res.json();
  },

  async saveClientConfig(clientId: string, clientSecret: string): Promise<void> {
    const res = await fetch('/api/github/client-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save GitHub client configuration');
  },
};
