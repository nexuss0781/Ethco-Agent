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
  // 1. Try server-side session first (Real Nexuss Auth session)
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      if (data && data.user) {
        const email = data.user.email;
        let name = data.user.name || data.user.full_name || deriveNameFromEmail(email);
        if (name === 'Ethco Developer' && email) {
          name = deriveNameFromEmail(email);
        }
        return {
          id: data.user.id || 'user-id',
          name,
          email,
          avatar: data.user.avatarUrl || data.user.avatar_url || data.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
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
        return JSON.parse(mock);
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
    const name = session.user.user_metadata.full_name || 
                 session.user.user_metadata.name || 
                 deriveNameFromEmail(email);

    return {
      id: session.user.id,
      name,
      email,
      avatar: session.user.user_metadata.avatar_url,
    };
  } catch (error) {
    console.error('Failed to get Supabase session:', error);
    return null;
  }
};
