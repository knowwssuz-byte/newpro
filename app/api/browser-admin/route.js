import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchTelegramGiftPreviews, importTelegramGiftsToCase } from '@/lib/telegramGiftsImporter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearer(request) {
  const value = request.headers.get('authorization') || '';

  if (!value.toLowerCase().startsWith('bearer ')) return '';

  return value.slice(7).trim();
}

function assertAdmin(request, body) {
  const expected = process.env.ADMIN_PANEL_KEY?.trim();

  if (!expected) {
    throw new Error('ADMIN_PANEL_KEY Vercel ENV ichida qo‘yilmagan.');
  }

  const provided = getBearer(request) || body.adminKey || '';

  if (!provided || provided !== expected) {
    throw new Error('Admin kalit noto‘g‘ri.');
  }
}

async function bootstrap(supabase) {
  const [casesRes, giftsRes, usersRes, withdrawalsRes] = await Promise.all([
    supabase.from('cases').select('*').order('created_at', { ascending: false }),
    supabase.from('gifts').select('*').order('created_at', { ascending: false }),
    supabase.from('users').select('*').order('created_at', { ascending: false }).limit(250),
    supabase
      .from('withdraw_requests')
      .select('*, gifts(id,title,type,value,image_url)')
      .order('created_at', { ascending: false })
      .limit(250),
  ]);

  const firstError = casesRes.error || giftsRes.error || usersRes.error || withdrawalsRes.error;

  if (firstError) {
    throw firstError;
  }

  return {
    cases: casesRes.data || [],
    gifts: giftsRes.data || [],
    users: usersRes.data || [],
    withdrawals: withdrawalsRes.data || [],
  };
}

export async function POST(request) {
  let body = {};

  try {
    body = await request.json();
    assertAdmin(request, body);

    const supabase = getSupabaseAdmin();
    const action = body.action;

    if (action === 'bootstrap') {
      const data = await bootstrap(supabase);
      return json({ ok: true, ...data });
    }

    if (action === 'case_create') {
      const payload = body.caseData || {};
      const { data, error } = await supabase.from('cases').insert(payload).select('*').single();

      if (error) throw error;

      return json({ ok: true, case: data });
    }

    if (action === 'case_update') {
      const { caseId, updates } = body;
      const { data, error } = await supabase.from('cases').update(updates || {}).eq('id', caseId).select('*').single();

      if (error) throw error;

      return json({ ok: true, case: data });
    }

    if (action === 'case_delete') {
      const { error } = await supabase.from('cases').delete().eq('id', body.caseId);

      if (error) throw error;

      return json({ ok: true });
    }

    if (action === 'gift_create') {
      const payload = body.giftData || {};
      const { data, error } = await supabase.from('gifts').insert(payload).select('*').single();

      if (error) throw error;

      return json({ ok: true, gift: data });
    }

    if (action === 'gift_update') {
      const { giftId, updates } = body;
      const { data, error } = await supabase.from('gifts').update(updates || {}).eq('id', giftId).select('*').single();

      if (error) throw error;

      return json({ ok: true, gift: data });
    }

    if (action === 'gift_delete') {
      const { error } = await supabase.from('gifts').delete().eq('id', body.giftId);

      if (error) throw error;

      return json({ ok: true });
    }

    if (action === 'telegram_gifts_list') {
      const gifts = await fetchTelegramGiftPreviews({ limit: Number(body.limit || 120) });

      return json({ ok: true, telegramGifts: gifts });
    }

    if (action === 'telegram_gifts_import') {
      const result = await importTelegramGiftsToCase(supabase, {
        caseId: body.caseId,
        giftIds: body.giftIds || [],
        defaultChance: Number(body.defaultChance || 10),
        defaultStock: Number(body.defaultStock || 1),
        rarity: body.rarity || 'legendary',
        isActive: body.isActive !== false,
        skipExisting: body.skipExisting !== false,
      });

      const data = await bootstrap(supabase);

      return json({ ok: true, importResult: result, ...data });
    }

    if (action === 'user_add_balance') {
      const userId = Number(body.userId);
      const amount = Number(body.amount);

      if (!Number.isFinite(userId) || !Number.isFinite(amount)) {
        return json({ ok: false, error: 'User ID yoki amount noto‘g‘ri.' }, 400);
      }

      const { data: user, error: readError } = await supabase
        .from('users')
        .select('id,balance')
        .eq('id', userId)
        .single();

      if (readError) throw readError;

      const nextBalance = Number(user.balance || 0) + amount;
      const { data, error } = await supabase.from('users').update({ balance: nextBalance }).eq('id', userId).select('*').single();

      if (error) throw error;

      return json({ ok: true, user: data });
    }

    if (action === 'user_ban') {
      const { data, error } = await supabase
        .from('users')
        .update({ is_banned: Boolean(body.is_banned) })
        .eq('id', Number(body.userId))
        .select('*')
        .single();

      if (error) throw error;

      return json({ ok: true, user: data });
    }

    if (action === 'withdraw_update') {
      const status = String(body.status || '');

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return json({ ok: false, error: 'Status noto‘g‘ri.' }, 400);
      }

      const { data, error } = await supabase
        .from('withdraw_requests')
        .update({ status })
        .eq('id', body.requestId)
        .select('*')
        .single();

      if (error) throw error;

      return json({ ok: true, withdrawal: data });
    }

    return json({ ok: false, error: 'Noma’lum action.' }, 400);
  } catch (error) {
    return json({ ok: false, error: error.message || 'Server xatosi' }, 401);
  }
}
