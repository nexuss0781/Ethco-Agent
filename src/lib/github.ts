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

  // 1. Authorize via direct GitHub OAuth (full-page redirect or direct link)
  getLoginUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `/api/github/login?origin=${encodeURIComponent(origin)}`;
  },

  async authorizeOAuth(): Promise<GitHubUser | null> {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const loginUrl = `/api/github/login?origin=${encodeURIComponent(origin)}`;
    
    // Direct page redirection
    window.location.href = loginUrl;
    return null;
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

  // 5b. Fetch Branches for a Repository
  async fetchBranches(repoFullName: string, repoName?: string): Promise<string[]> {
    try {
      const url = `/api/github/branches?repo=${encodeURIComponent(repoFullName)}&repoName=${encodeURIComponent(repoName || '')}`;
      const res = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.branches) && data.branches.length > 0) {
          return data.branches;
        }
      }
    } catch {}
    return ['main', 'master', 'dev'];
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
