import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sortCases(items = []) {
  return [...items].sort((a, b) => {
    const pinnedDiff = Number(Boolean(b?.is_pinned)) - Number(Boolean(a?.is_pinned));
    if (pinnedDiff) return pinnedDiff;

    const aOrder = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 999999;
    const bOrder = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 999999;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
  });
}

async function fetchCases(supabase) {
  const result = await supabase
    .from('cases')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!result.error) return result.data || [];

  const text = `${result.error?.message || ''} ${result.error?.details || ''} ${result.error?.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || result.error?.code === '42703') {
    const fallback = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (fallback.error) throw new Error(fallback.error.message);

    return fallback.data || [];
  }

  throw new Error(result.error.message);
}

async function nextSortOrder(supabase) {
  const { count } = await supabase.from('cases').select('id', { count: 'exact', head: true });
  return Number(count || 0) + 1;
}

async function insertCase(supabase, payload) {
  let { data, error } = await supabase.from('cases').insert(payload).select('*').single();

  if (!error) return data;

  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || error.code === '42703') {
    const { sort_order, is_pinned, ...fallbackPayload } = payload;
    const retry = await supabase.from('cases').insert(fallbackPayload).select('*').single();

    if (retry.error) throw new Error(retry.error.message);

    return retry.data;
  }

  throw new Error(error.message);
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) return jsonError(auth.error, auth.status);
    if (!auth.isAdmin) return jsonError('Admin ruxsati yo‘q', 403);

    const supabase = getSupabaseAdmin();
    const {
      action,
      caseId,
      caseIds,
      title,
      description,
      price,
      image_url,
      is_active,
      is_pinned,
      sort_order,
      badge_text,
      badge_color,
      accent_color,
      card_style,
    } = auth.body || {};

    if (action === 'list') {
      const cases = await fetchCases(supabase);
      return Response.json({ ok: true, cases: sortCases(cases) });
    }

    if (action === 'create') {
      if (!title || String(title).trim().length < 2) {
        return jsonError('Case nomini yozing');
      }

      const data = await insertCase(supabase, {
        title: String(title).trim(),
        description: description || null,
        price: Number(price || 0),
        image_url: image_url || null,
        badge_text: badge_text ? String(badge_text).trim().toUpperCase() : null,
        badge_color: badge_color || '#8b5cf6',
        accent_color: accent_color || '#22c55e',
        card_style: card_style || 'default',
        is_pinned: Boolean(is_pinned),
        sort_order: Number(sort_order || (await nextSortOrder(supabase))),
        is_active: true,
      });

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
      if (is_pinned !== undefined) updates.is_pinned = Boolean(is_pinned);
      if (sort_order !== undefined) updates.sort_order = Number(sort_order || 0);

      let { data, error } = await supabase.from('cases').update(updates).eq('id', caseId).select('*').single();

      if (error) {
        const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;

        if (text.includes('sort_order') || text.includes('is_pinned') || error.code === '42703') {
          const { sort_order: _sortOrder, is_pinned: _isPinned, ...fallbackUpdates } = updates;
          const retry = await supabase.from('cases').update(fallbackUpdates).eq('id', caseId).select('*').single();

          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw new Error(error.message);

      return Response.json({ ok: true, case: data });
    }

    if (action === 'reorder') {
      const ids = Array.isArray(caseIds) ? caseIds.filter(Boolean) : [];

      if (!ids.length) return jsonError('caseIds kerak');

      const results = await Promise.all(
        ids.map((id, index) => supabase.from('cases').update({ sort_order: index + 1 }).eq('id', id))
      );

      const failed = results.find((result) => result.error);

      if (failed?.error) throw new Error(failed.error.message);

      const cases = await fetchCases(supabase);

      return Response.json({ ok: true, cases: sortCases(cases) });
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
