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
  // 1. Authorize via Nexuss Auth GitHub repository authorization flow (Section 12 of INTEGRATION.md)
  async authorizeOAuth(): Promise<GitHubUser | null> {
    return this.authorizeWithNexussAuth();
  },

  async authorizeWithNexussAuth(mode: 'popup' | 'redirect' = 'popup'): Promise<GitHubUser | null> {
    let targetUrl = '';
    try {
      const res = await fetch('/api/github/auth-url');
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
      const projectId = import.meta.env.VITE_NEXUSS_AUTH_PROJECT_ID || 'ethco-agents';
      const authUrl = import.meta.env.VITE_NEXUSS_AUTH_URL || 'https://nexuss-auth.vercel.app';
      const redirectUri = `${window.location.origin}/api/auth/callback`;
      targetUrl = `${authUrl}/oauth/start/github?project_id=${encodeURIComponent(projectId)}&redirect_uri=${encodeURIComponent(redirectUri)}&handoff=1&purpose=github_authorization`;
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

  // 3. Get Status (reads active token & user info from server)
  async getStatus(): Promise<GitHubStatus> {
    try {
      const res = await fetch('/api/github/status');
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

    try {
      localStorage.removeItem('ethco_github_user');
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
