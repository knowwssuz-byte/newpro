import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const { action, caseId, title, description, price, image_url, is_active, badge_text, badge_color, accent_color, card_style } = auth.body || {};

    if (action === 'list') {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, cases: data || [] });
    }

    if (action === 'create') {
      if (!title || String(title).trim().length < 2) {
        return jsonError('Case nomini yozing');
      }

      const { data, error } = await supabase
        .from('cases')
        .insert({
          title: String(title).trim(),
          description: description || null,
          price: Number(price || 0),
          image_url: image_url || null,
          badge_text: badge_text ? String(badge_text).trim().toUpperCase() : null,
          badge_color: badge_color || '#8b5cf6',
          accent_color: accent_color || '#22c55e',
          card_style: card_style || 'default',
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, case: data });
    }

    if (action === 'update') {
      if (!caseId) return jsonError('caseId kerak');

      const updates = {};
      if (title !== undefined) updates.title = String(title).trim();
      if (description !== undefined) updates.description = description || null;
      if (price !== undefined) updates.price = Number(price || 0);
      if (image_url !== undefined) updates.image_url = image_url || null;
      if (badge_text !== undefined) updates.badge_text = badge_text ? String(badge_text).trim().toUpperCase() : null;
      if (badge_color !== undefined) updates.badge_color = badge_color || '#8b5cf6';
      if (accent_color !== undefined) updates.accent_color = accent_color || '#22c55e';
      if (card_style !== undefined) updates.card_style = card_style || 'default';
      if (is_active !== undefined) updates.is_active = Boolean(is_active);

      const { data, error } = await supabase
        .from('cases')
        .update(updates)
        .eq('id', caseId)
        .select('*')
        .single();

      if (error) throw new Error(error.message);
      return Response.json({ ok: true, case: data });
    }

    if (action === 'delete') {
      if (!caseId) return jsonError('caseId kerak');

      const { error } = await supabase.from('cases').delete().eq('id', caseId);
      if (error) throw new Error(error.message);

      return Response.json({ ok: true });
    }

    return jsonError('Noma’lum action');
  } catch (error) {
    return jsonError(error.message || 'Server xatosi', 500);
  }
}
