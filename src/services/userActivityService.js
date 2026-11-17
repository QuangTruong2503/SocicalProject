import { supabase } from '../lib/supabase.js';

export async function recordUserActivity() {
  // Identity and timestamp are supplied by the database, never by the browser.
  const { error } = await supabase.rpc('record_user_activity');
  if (error) throw error;
}
