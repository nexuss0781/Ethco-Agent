import { supabase, isSupabaseConfigured } from './supabase';

export const signInWithGoogle = async () => {
  if (!isSupabaseConfigured) {
    localStorage.setItem('ethco_mock_session', JSON.stringify({
      id: 'mock-user-id',
      name: 'Ethco Developer',
      email: 'unique0781@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    }));
    window.location.href = '/app';
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const signInWithGithub = async () => {
  if (!isSupabaseConfigured) {
    localStorage.setItem('ethco_mock_session', JSON.stringify({
      id: 'mock-user-id',
      name: 'Ethco Developer',
      email: 'unique0781@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    }));
    window.location.href = '/app';
    return;
  }
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const logout = async () => {
  if (!isSupabaseConfigured) {
    localStorage.removeItem('ethco_mock_session');
    window.location.href = '/';
    return;
  }
  await supabase.auth.signOut();
  window.location.href = '/';
};

export const getUser = async () => {
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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return {
      id: session.user.id,
      name: session.user.user_metadata.full_name || session.user.user_metadata.name,
      email: session.user.email,
      avatar: session.user.user_metadata.avatar_url,
    };
  } catch (error) {
    console.error('Failed to get Supabase session:', error);
    return null;
  }
};
