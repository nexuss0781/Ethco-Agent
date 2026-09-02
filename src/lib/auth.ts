import { supabase, isSupabaseConfigured } from './supabase';
import { createAuth } from 'nexuss-auth';

const projectId = import.meta.env.VITE_NEXUSS_AUTH_PROJECT_ID || 'ethco-agents';
const authUrl = import.meta.env.VITE_NEXUSS_AUTH_URL || 'https://nexuss-auth.vercel.app';

export const auth = createAuth({
  projectId,
  authUrl,
});

const deriveNameFromEmail = (email: string | undefined | null): string => {
  if (!email) return 'Developer';
  return email.split('@')[0];
};

export const signInWithGoogle = async (customEmail?: string) => {
  if (!isSupabaseConfigured) {
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    const loginUrl = new URL(auth.getLoginUrl('google', { redirectUri }));
    // Explicitly add handoff parameter as defined in the Nexuss Auth specs
    loginUrl.searchParams.set('handoff', '1');
    window.location.href = loginUrl.toString();
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const signInWithGithub = async (customEmail?: string) => {
  if (!isSupabaseConfigured) {
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    const loginUrl = new URL(auth.getLoginUrl('github', { redirectUri }));
    // Explicitly add handoff parameter as defined in the Nexuss Auth specs
    loginUrl.searchParams.set('handoff', '1');
    window.location.href = loginUrl.toString();
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const signInWithEmail = async (email: string) => {
  if (!isSupabaseConfigured) {
    localStorage.setItem('ethco_mock_session', JSON.stringify({
      id: 'mock-user-id',
      name: deriveNameFromEmail(email),
      email: email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    }));
    window.location.href = '/app';
    return;
  }
  // Try sending magic link with Supabase if configured
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/app`,
    },
  });
};

export const logout = async () => {
  // Clear local testing session
  localStorage.removeItem('ethco_mock_session');
  
  // Call server-side logout
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Failed to log out from server session:', err);
  }

  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
  
  window.location.href = '/';
};

export const getUser = async () => {
  let ghUser: any = null;
  try {
    const rawGh = localStorage.getItem('ethco_github_user');
    if (rawGh) ghUser = JSON.parse(rawGh);
  } catch {}

  // 1. Try server-side session first (Real Nexuss Auth session)
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      if (data && data.user) {
        const email = data.user.email;
        let name = data.user.name || data.user.full_name || (ghUser && (ghUser.name || ghUser.login)) || deriveNameFromEmail(email);
        if (name === 'Ethco Developer' && email) {
          name = ghUser?.name || deriveNameFromEmail(email);
        }
        const username = ghUser?.login || data.user.username || data.user.login || deriveNameFromEmail(email);
        const avatar = ghUser?.avatar_url || data.user.avatarUrl || data.user.avatar_url || data.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces';
        return {
          id: data.user.id || 'user-id',
          name,
          username,
          email,
          avatar,
          ghUser,
        };
      }
    }
  } catch (error) {
    console.error('Failed to fetch server-side user session:', error);
  }

  // 2. Fall back to local mock session if Supabase is not configured
  if (!isSupabaseConfigured) {
    const mock = localStorage.getItem('ethco_mock_session');
    if (mock) {
      try {
        const parsed = JSON.parse(mock);
        const username = ghUser?.login || parsed.username || deriveNameFromEmail(parsed.email);
        const name = ghUser?.name || parsed.name || deriveNameFromEmail(parsed.email);
        const avatar = ghUser?.avatar_url || parsed.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces';
        return {
          ...parsed,
          name,
          username,
          avatar,
          ghUser,
        };
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // 3. Try Supabase session if configured
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    
    const email = session.user.email;
    const name = ghUser?.name || 
                 session.user.user_metadata.full_name || 
                 session.user.user_metadata.name || 
                 deriveNameFromEmail(email);
    const username = ghUser?.login || deriveNameFromEmail(email);
    const avatar = ghUser?.avatar_url || session.user.user_metadata.avatar_url;

    return {
      id: session.user.id,
      name,
      username,
      email,
      avatar,
      ghUser,
    };
  } catch (error) {
    console.error('Failed to get Supabase session:', error);
    return null;
  }
};
