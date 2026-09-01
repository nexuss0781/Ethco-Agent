import { auth } from './auth';

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

export const GitHubService = {
  // 1. Authorize via Central Nexuss Auth (Skill Section 12)
  async authorizeWithNexussAuth(mode: 'popup' | 'redirect' = 'popup'): Promise<GitHubUser | null> {
    const projectId = import.meta.env.VITE_NEXUSS_AUTH_PROJECT_ID || 'ethco-agents';
    const authUrl = import.meta.env.VITE_NEXUSS_AUTH_URL || 'https://nexuss-auth.vercel.app';
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    
    // Central flow URL matching Section 12 of SKILL/INTEGRATION.md
    const centralStartUrl = `${authUrl}/oauth/start/github?project_id=${encodeURIComponent(projectId)}&redirect_uri=${encodeURIComponent(redirectUri)}&handoff=1&purpose=github_authorization`;

    if (mode === 'redirect') {
      window.location.href = centralStartUrl;
      return null;
    }

    // Popup flow
    return new Promise((resolve, reject) => {
      try {
        const width = 600;
        const height = 720;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const authWindow = window.open(
          centralStartUrl,
          'nexuss_auth_popup',
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
        );

        if (!authWindow) {
          // Fallback to redirect if popup is blocked
          window.location.href = centralStartUrl;
          return;
        }

        let cleanupTimer: any = null;

        const handleMessage = (event: MessageEvent) => {
          const origin = event.origin;
          if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('vercel.app')) {
            return;
          }

          if (
            (event.data?.type === 'OAUTH_AUTH_SUCCESS' || event.data?.type === 'NEXUSS_AUTH_SUCCESS') &&
            event.data?.user
          ) {
            window.removeEventListener('message', handleMessage);
            if (cleanupTimer) clearInterval(cleanupTimer);
            resolve(event.data.user);
          }
        };

        window.addEventListener('message', handleMessage);

        cleanupTimer = setInterval(async () => {
          if (authWindow.closed) {
            clearInterval(cleanupTimer);
            window.removeEventListener('message', handleMessage);
            const status = await GitHubService.getStatus();
            resolve(status.user || null);
          }
        }, 1000);
      } catch (err) {
        reject(err);
      }
    });
  },

  // 2. Get Status (reads active Nexuss Auth session & user info)
  async getStatus(): Promise<GitHubStatus> {
    try {
      const res = await fetch('/api/github/status');
      if (!res.ok) return { connected: false, user: null };
      return res.json();
    } catch {
      return { connected: false, user: null };
    }
  },

  // 3. Disconnect
  async disconnect(): Promise<void> {
    await fetch('/api/github/disconnect', { method: 'POST' });
  },

  // 4. Fetch Repositories
  async fetchRepos(query?: string): Promise<GitHubRepo[]> {
    const url = query ? `/api/github/repos?q=${encodeURIComponent(query)}` : '/api/github/repos';
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch repositories');
    }
    return data.repos || [];
  },

  // 5. Clone / Import Repo into workspace
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

  // 6. List Cloned Repos
  async getImportedRepos(): Promise<ImportedRepo[]> {
    const res = await fetch('/api/github/imported');
    if (!res.ok) return [];
    const data = await res.json();
    return data.repos || [];
  },

  // 7. Sync / Pull
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

  // 8. Delete Cloned Repo
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

  // 9. Inspect File Tree
  async getRepoTree(repoName: string): Promise<any[]> {
    const res = await fetch(`/api/github/repo-tree?repoName=${encodeURIComponent(repoName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tree || [];
  },
};
