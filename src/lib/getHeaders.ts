import { supabase } from './supabase';

export async function getBearerHeaders(sessionId?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // First check for a stored access token (set after login)
  const storedToken = localStorage.getItem('supabase_access_token');
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  } else if (supabase) {
    const { data: { session: supaSession } } = await supabase.auth.getSession();
    if (supaSession?.access_token) {
      headers['Authorization'] = `Bearer ${supaSession.access_token}`;
    }
  }

  if (sessionId) {
    headers['x-user-id'] = sessionId;
  }

  return headers;
}
