// A single account can claim the first-visit introduction at most once.
// Supabase filters and returns the affected row in the same atomic UPDATE.
// Existing accounts are backfilled by the migration; new accounts start NULL.
export async function claimFirstWelcome(supabase, user) {
  const id = Number(user?.id);
  if (!Number.isSafeInteger(id) || id <= 0 || user?.first_welcome_shown_at) {
    return false;
  }
  const { data, error } = await supabase.from('users')
    .update({ first_welcome_shown_at: new Date().toISOString() })
    .eq('id', id)
    .is('first_welcome_shown_at', null)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}
