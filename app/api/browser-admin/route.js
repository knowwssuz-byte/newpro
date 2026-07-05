import crypto from 'crypto';
import sharp from 'sharp';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_BUCKET = 'gift-assets';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function clean(value = '') {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);

  return Number.isFinite(number) ? number : fallback;
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

  const provided = getBearer(request) || body.get?.('adminKey') || body.adminKey || '';

  if (!provided || provided !== expected) {
    throw new Error('Admin kalit noto‘g‘ri.');
  }
}

function tableMissingError(error, tableName) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

  return text.includes(tableName) || text.includes('relation') || error?.code === '42P01';
}

async function safeSelect(supabase, table, queryBuilder, fallback = []) {
  const { data, error } = await queryBuilder;

  if (error) {
    if (tableMissingError(error, table)) return fallback;
    throw error;
  }

  return data || fallback;
}

async function bootstrap(supabase) {
  const [cases, gifts, users, withdrawals, giftLibrary] = await Promise.all([
    safeSelect(supabase, 'cases', supabase.from('cases').select('*').order('created_at', { ascending: false })),
    safeSelect(supabase, 'gifts', supabase.from('gifts').select('*').order('created_at', { ascending: false })),
    safeSelect(supabase, 'users', supabase.from('users').select('*').order('created_at', { ascending: false }).limit(250)),
    safeSelect(
      supabase,
      'withdraw_requests',
      supabase
        .from('withdraw_requests')
        .select('*, gifts(id,title,type,value,image_url,animation_url,background_value)')
        .order('created_at', { ascending: false })
        .limit(250)
    ),
    safeSelect(
      supabase,
      'gift_library',
      supabase.from('gift_library').select('*').order('created_at', { ascending: false })
    ),
  ]);

  return {
    cases,
    gifts,
    users,
    withdrawals,
    giftLibrary,
  };
}

async function uploadPublicAsset(supabase, { buffer, contentType, folder, ext, prefix }) {
  if (!buffer || !Buffer.byteLength(buffer)) return null;

  const bucket = process.env.SUPABASE_GIFT_ASSETS_BUCKET || DEFAULT_BUCKET;
  const safeExt = clean(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const safeFolder = clean(folder || 'manual').replace(/[^a-z0-9/_-]/gi, '-').toLowerCase();
  const filePath = `${safeFolder}/${Date.now()}-${prefix || 'asset'}-${crypto.randomUUID()}.${safeExt}`;

  const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: contentType || 'application/octet-stream',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    throw new Error(`Supabase Storage upload xatosi: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return {
    path: filePath,
    publicUrl: data?.publicUrl || '',
    contentType,
    size: Buffer.byteLength(buffer),
  };
}

async function uploadManualGiftWebp(supabase, file, title = '') {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) {
    throw new Error('WEBP fayl tanlanmagan.');
  }

  const fileName = clean(file.name || '').toLowerCase();
  const fileType = clean(file.type).toLowerCase();

  if (!fileName.endsWith('.webp') && fileType !== 'image/webp') {
    throw new Error('Faqat .webp gift yuklang.');
  }

  const originalBuffer = Buffer.from(await file.arrayBuffer());
  const prefix = clean(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'gift';

  const pngBuffer = await sharp(originalBuffer, {
    animated: false,
    limitInputPixels: false,
  })
    .resize({
      width: 512,
      height: 512,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const [webpAsset, pngAsset] = await Promise.all([
    uploadPublicAsset(supabase, {
      buffer: originalBuffer,
      contentType: 'image/webp',
      folder: 'manual-gifts/webp',
      ext: 'webp',
      prefix,
    }),
    uploadPublicAsset(supabase, {
      buffer: pngBuffer,
      contentType: 'image/png',
      folder: 'manual-gifts/png',
      ext: 'png',
      prefix,
    }),
  ]);

  return {
    webpUrl: webpAsset.publicUrl,
    pngUrl: pngAsset.publicUrl,
  };
}

async function insertGiftWithOptionalColumns(supabase, row, optionalRow) {
  const fullRow = {
    ...row,
    ...optionalRow,
  };

  let { data, error } = await supabase.from('gifts').insert(fullRow).select('*').single();

  if (!error) return data;

  const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;

  if (text.includes('library_gift_id') || text.includes('source')) {
    const retry = await supabase.from('gifts').insert(row).select('*').single();

    if (retry.error) throw retry.error;

    return retry.data;
  }

  throw error;
}

async function handleFormAction(request, formData, supabase) {
  const action = clean(formData.get('action'));

  if (action === 'gift_library_create') {
    const title = clean(formData.get('title'));
    const file = formData.get('webp_file');

    if (!title) {
      throw new Error('Gift nomini yozing.');
    }

    const assets = await uploadManualGiftWebp(supabase, file, title);

    const { data, error } = await supabase
      .from('gift_library')
      .insert({
        title,
        webp_url: assets.webpUrl,
        png_url: assets.pngUrl,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) throw error;

    const boot = await bootstrap(supabase);

    return json({ ok: true, libraryGift: data, ...boot });
  }

  return json({ ok: false, error: 'Noma’lum form action.' }, 400);
}

export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      assertAdmin(request, formData);

      return handleFormAction(request, formData, supabase);
    }

    const body = await request.json().catch(() => ({}));
    assertAdmin(request, body);

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

    if (action === 'gift_library_update') {
      const { giftId, updates } = body;
      const cleanUpdates = {
        ...updates,
      };

      delete cleanUpdates.webp_url;
      delete cleanUpdates.png_url;

      const { data, error } = await supabase
        .from('gift_library')
        .update(cleanUpdates || {})
        .eq('id', giftId)
        .select('*')
        .single();

      if (error) throw error;

      return json({ ok: true, libraryGift: data });
    }

    if (action === 'gift_library_delete') {
      const { error } = await supabase.from('gift_library').delete().eq('id', body.giftId);

      if (error) throw error;

      return json({ ok: true });
    }

    if (action === 'gift_create_from_library') {
      const data = body.giftData || {};
      const caseId = clean(data.case_id);
      const libraryGiftId = clean(data.library_gift_id);
      const backgroundValue = clean(data.background_value);

      if (!caseId) {
        return json({ ok: false, error: 'Case tanlanmagan.' }, 400);
      }

      if (!libraryGiftId) {
        return json({ ok: false, error: 'Gift bazadan gift tanlanmagan.' }, 400);
      }

      if (!backgroundValue) {
        return json({ ok: false, error: 'Fon rangi yoki gradient kiritilmagan.' }, 400);
      }

      const { data: libraryGift, error: libraryError } = await supabase
        .from('gift_library')
        .select('*')
        .eq('id', libraryGiftId)
        .single();

      if (libraryError) throw libraryError;

      const row = {
        case_id: caseId,
        title: clean(data.title || libraryGift.title),
        type: 'gift',
        value: clean(libraryGift.id),
        chance: Math.max(0, toNumber(data.chance, 10)),
        stock: Math.max(0, Math.floor(toNumber(data.stock, 1))),
        // Case aylanishida va cardlarda static PNG chiqadi.
        image_url: libraryGift.png_url || libraryGift.webp_url || '',
        // Yutganda/result/inventory joylarida original WEBP animatsiya ishlaydi.
        animation_url: libraryGift.webp_url || '',
        background_value: backgroundValue,
        rarity: clean(data.rarity || 'rare'),
        is_active: data.is_active !== false,
      };

      const optionalRow = {
        library_gift_id: libraryGift.id,
        source: 'manual_library',
      };

      const gift = await insertGiftWithOptionalColumns(supabase, row, optionalRow);
      const boot = await bootstrap(supabase);

      return json({ ok: true, gift, ...boot });
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
      const { data, error } = await supabase
        .from('users')
        .update({ balance: nextBalance })
        .eq('id', userId)
        .select('*')
        .single();

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
    console.error('[browser-admin]', error);

    return json({ ok: false, error: error.message || 'Server xatosi' }, 401);
  }
}
