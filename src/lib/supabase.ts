/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.signature';

export const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function saveToSupabase(table: string, data: any) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: result, error } = await supabase.from(table).upsert(data);
    if (error) console.warn('Supabase upsert note:', error.message);
    return result;
  } catch (err) {
    console.warn('Supabase sync deferred:', err);
    return null;
  }
}

export async function loadFromSupabase(table: string) {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.warn('Supabase fetch note:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Supabase load deferred:', err);
    return null;
  }
}

