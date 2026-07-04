import { createClient } from '@supabase/supabase-js';

let cachedClient = null;

function detectSupabaseKeyType(key) {
  if (!key) return 'missing';

  if (key.startsWith('sb_secret_')) {
    return 'secret_key';
  }

  if (key.startsWith('sb_publishable_')) {
    return 'publishable_key';
  }

  try {
    const parts = key.split('.');
    if (parts.length !== 3) return 'unknown';

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );

    if (payload.role === 'service_role') return 'legacy_service_role';
    if (payload.role === 'anon') return 'legacy_anon';

    return payload.role || 'jwt_unknown';
  } catch {
    return 'unknown';
  }
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase env topilmadi: NEXT_PUBLIC_SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY yo‘q'
    );
  }

  const keyType = detectSupabaseKeyType(supabaseKey);

  if (keyType === 'publishable_key' || keyType === 'legacy_anon') {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY noto‘g‘ri. Hozirgi key type="${keyType}". Service role yoki sb_secret key qo‘yilishi kerak.`
    );
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
      },
    });
  }

  return cachedClient;
}
