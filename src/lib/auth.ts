import { supabase } from './supabase';

export const signInWithGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const signInWithGithub = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/app`,
    },
  });
};

export const logout = async () => {
  await supabase.auth.signOut();
  window.location.href = '/';
};

export const getUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.user_metadata.full_name || session.user.user_metadata.name,
    email: session.user.email,
    avatar: session.user.user_metadata.avatar_url,
  };
};
