/// <reference types="vite/client" />
import { createAuth } from 'nexuss-auth';

export const auth = createAuth({
  projectId: import.meta.env.VITE_NEXUSS_AUTH_PROJECT_ID || 'ethco-agents',
  authUrl: import.meta.env.VITE_NEXUSS_AUTH_URL || 'https://nexuss-auth.vercel.app',
});

// Helper to initiate Google sign in
export const signInWithGoogle = async () => {
  const redirectUri = import.meta.env.VITE_NEXUSS_AUTH_REDIRECT_URI || `${window.location.origin}/api/auth/callback`;
  await auth.signInWithGoogle({
    redirectUri,
    handoff: true,
  } as any);
};

// Helper to initiate GitHub sign in
export const signInWithGithub = async () => {
  const redirectUri = import.meta.env.VITE_NEXUSS_AUTH_REDIRECT_URI || `${window.location.origin}/api/auth/callback`;
  await (auth as any).signInWithGitHub({
    redirectUri,
    handoff: true,
  });
};

export const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  // Also logout from nexuss auth if there is any browser session lingering
  await auth.logout();
  window.location.reload();
};

export const getUser = async () => {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return null;
  const data = await response.json();
  return data.user;
};
