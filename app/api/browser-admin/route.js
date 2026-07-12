import crypto from 'crypto';
import { gzipSync } from 'zlib';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchUniqueTelegramGift } from '@/lib/telegramGiftsImporter';

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

function parseTelegramGiftLink(value) {
  const text = clean(value);
  const match = text.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/nft\/([a-z0-9_-]+)$/i);
  if (!match) throw new Error('Link formati noto‘g‘ri. Masalan: https://t.me/nft/ViceCream-134506');
  return { slug: match[1], url: `https://t.me/nft/${match[1]}` };
}

async function fetchUniqueGift(slug) {
  return fetchUniqueTelegramGift(slug);
}

async function uploadLottie(supabase, lottie, slug, kind) {
  if (!lottie || typeof lottie !== 'object') return '';
  const asset = await uploadPublicAsset(supabase, {
    buffer: gzipSync(Buffer.from(JSON.stringify(lottie))), contentType: 'application/x-tgsticker',
    folder: `telegram-nft/${slug}`, ext: 'tgs', prefix: kind,
  });
  return asset?.publicUrl || '';
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

async function fetchCasesForAdmin(supabase) {
  const ordered = await supabase
    .from('cases')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (!ordered.error) return ordered.data || [];

  const text = `${ordered.error?.message || ''} ${ordered.error?.details || ''} ${ordered.error?.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || ordered.error?.code === '42703') {
    const fallback = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (fallback.error) throw fallback.error;

    return fallback.data || [];
  }

  throw ordered.error;
}

async function normalizeCaseOrder(supabase, cases = []) {
  const sorted = [...cases].sort((a, b) => {
    const pinnedDiff = Number(Boolean(b?.is_pinned)) - Number(Boolean(a?.is_pinned));
    if (pinnedDiff) return pinnedDiff;

    const aOrder = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 999999;
    const bOrder = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 999999;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
  });

  return sorted;
}

async function bootstrap(supabase) {
  const [cases, gifts, users, withdrawals, giftLibrary, featureRows] = await Promise.all([
    fetchCasesForAdmin(supabase),
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
    safeSelect(supabase, 'app_settings', supabase.from('app_settings').select('key,value').in('key', ['feature_rocket', 'feature_pvp'])),
  ]);

  return {
    cases: await normalizeCaseOrder(supabase, cases),
    gifts,
    users,
    withdrawals,
    giftLibrary,
    featureSettings: Object.fromEntries((featureRows || []).map((item) => [item.key, item.value || {}])),
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

function extensionFromFile(file) {
  const fileName = clean(file?.name || '').toLowerCase();
  const ext = fileName.split('.').pop() || '';
  if (ext === 'png' || ext === 'svg') return ext;
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';

  const type = clean(file?.type).toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
  if (type.includes('svg')) return 'svg';

  return '';
}

function contentTypeFromExt(ext) {
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function uploadGiftImage(supabase, file, title = '') {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) {
    throw new Error('PNG, JPG yoki SVG rasm fayl tanlanmagan.');
  }

  const ext = extensionFromFile(file);

  if (!['png', 'jpg', 'svg'].includes(ext)) {
    throw new Error('Faqat PNG, JPG yoki SVG rasm yuklang.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const prefix = clean(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'gift';

  const uploaded = await uploadPublicAsset(supabase, {
    buffer,
    contentType: contentTypeFromExt(ext),
    folder: 'manual-gifts/images',
    ext,
    prefix,
  });

  return {
    imageUrl: uploaded.publicUrl,
    imageType: ext,
  };
}

async function uploadCaseImage(supabase, file, title = '') {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0) {
    throw new Error('Case rasmi uchun PNG, JPG yoki SVG fayl tanlang.');
  }

  const ext = extensionFromFile(file);

  if (!['png', 'jpg', 'svg'].includes(ext)) {
    throw new Error('Case rasmi faqat PNG, JPG yoki SVG bo‘lishi kerak.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const prefix = clean(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'case';

  const uploaded = await uploadPublicAsset(supabase, {
    buffer,
    contentType: contentTypeFromExt(ext),
    folder: 'manual-cases/images',
    ext,
    prefix,
  });

  return {
    imageUrl: uploaded.publicUrl,
    imageType: ext,
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

  if (
    text.includes('library_gift_id') ||
    text.includes('floor_price') ||
    text.includes('sell_price') ||
    text.includes('buy_price') ||
    text.includes('real_chance') ||
    text.includes('source')
  ) {
    const retry = await supabase.from('gifts').insert(row).select('*').single();

    if (retry.error) throw retry.error;

    return retry.data;
  }

  throw error;
}

async function handleFormAction(request, formData, supabase) {
  const action = clean(formData.get('action'));

  if (action === 'case_create_upload') {
    const title = clean(formData.get('title'));
    const description = clean(formData.get('description'));
    const price = toNumber(formData.get('price'), 0);
    const badgeText = clean(formData.get('badge_text'));
    const badgeColor = clean(formData.get('badge_color')) || '#8b5cf6';
    const accentColor = clean(formData.get('accent_color')) || '#22c55e';
    const cardStyle = clean(formData.get('card_style')) || 'default';
    const isActive = clean(formData.get('is_active')) !== 'false';
    const file = formData.get('image_file');

    if (!title) {
      throw new Error('Case nomini yozing.');
    }

    const image = await uploadCaseImage(supabase, file, title);
    const { count } = await supabase.from('cases').select('id', { count: 'exact', head: true });
    const nextSortOrder = Number(count || 0) + 1;

    const { data, error } = await supabase
      .from('cases')
      .insert({
        title,
        description,
        price,
        image_url: image.imageUrl,
        badge_text: badgeText,
        badge_color: badgeColor,
        accent_color: accentColor,
        card_style: cardStyle,
        is_pinned: false,
        sort_order: nextSortOrder,
        is_active: isActive,
      })
      .select('*')
      .single();

    if (error) throw error;

    const boot = await bootstrap(supabase);

    return json({ ok: true, case: data, ...boot });
  }

  if (action === 'gift_library_create') {
    const title = clean(formData.get('title'));
    const price = toNumber(formData.get('price'), 0);
    const backgroundValue = clean(formData.get('background_value'));
    const file = formData.get('image_file');

    if (!title) {
      throw new Error('Gift nomini yozing.');
    }

    if (!backgroundValue) {
      throw new Error('Fon rangi yoki gradient kiritilmagan.');
    }

    const image = await uploadGiftImage(supabase, file, title);

    const { data, error } = await supabase
      .from('gift_library')
      .insert({
        title,
        price,
        buy_price: price,
        background_value: backgroundValue,
        image_url: image.imageUrl,
        image_type: image.imageType,
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
      const { count } = await supabase.from('cases').select('id', { count: 'exact', head: true });
      const nextSortOrder = Number(count || 0) + 1;

      let { data, error } = await supabase
        .from('cases')
        .insert({
          ...payload,
          is_pinned: Boolean(payload.is_pinned),
          sort_order: Number(payload.sort_order || nextSortOrder),
        })
        .select('*')
        .single();

      if (error) {
        const text = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;

        if (text.includes('is_pinned') || text.includes('sort_order') || error.code === '42703') {
          const retry = await supabase.from('cases').insert(payload).select('*').single();
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;

      return json({ ok: true, case: data });
    }

    if (action === 'case_reorder') {
      const caseIds = Array.isArray(body.caseIds) ? body.caseIds.filter(Boolean) : [];

      if (!caseIds.length) {
        return json({ ok: false, error: 'caseIds kerak.' }, 400);
      }

      const updates = caseIds.map((caseId, index) =>
        supabase
          .from('cases')
          .update({ sort_order: index + 1 })
          .eq('id', caseId)
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);

      if (failed?.error) throw failed.error;

      const cases = await fetchCasesForAdmin(supabase);

      return json({ ok: true, cases: await normalizeCaseOrder(supabase, cases) });
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

    if (action === 'gift_link_import') {
      const parsed = parseTelegramGiftLink(body.giftUrl);
      const gift = await fetchUniqueGift(parsed.slug);
      const modelUrl = await uploadLottie(supabase, gift.model?.lottie, parsed.slug, 'model');
      const symbolUrl = await uploadLottie(supabase, gift.symbol?.lottie, parsed.slug, 'symbol');
      if (!modelUrl) throw new Error('Gift model animatsiyasi olinmadi. PHP MTProto sessionini tekshiring.');
      const center = clean(gift.backdrop?.centerColor || '#7c3aed');
      const edge = clean(gift.backdrop?.edgeColor || '#111827');
      const row = {
        title: clean(gift.name) + (gift.num ? ` #${gift.num}` : ''), price: Math.max(0, toNumber(body.price, 0)),
        buy_price: Math.max(0, toNumber(body.price, 0)), image_url: '', image_type: 'lottie',
        animation_url: modelUrl, background_value: `radial-gradient(circle at 50% 38%, ${center}, ${edge})`, is_active: true,
      };
      const optional = { slug: parsed.slug, source_url: parsed.url, gift_number: gift.num || null, total_supply: gift.total || null,
        model_name: clean(gift.model?.name), symbol_name: clean(gift.symbol?.name), backdrop_name: clean(gift.backdrop?.name), symbol_url: symbolUrl };
      let result = await supabase.from('gift_library').upsert({ ...row, ...optional }, { onConflict: 'slug' }).select('*').single();
      if (result.error?.code === '42703' || result.error?.code === '42P10') {
        result = await supabase.from('gift_library').insert(row).select('*').single();
      }
      if (result.error) throw result.error;
      return json({ ok: true, libraryGift: result.data, ...(await bootstrap(supabase)) });
    }

    if (action === 'feature_animation_update') {
      const slot = clean(body.slot).toLowerCase();
      if (!['rocket', 'pvp'].includes(slot)) return json({ ok: false, error: 'Feature turi noto‘g‘ri.' }, 400);
      const parsed = parseTelegramGiftLink(body.giftUrl);
      const gift = await fetchUniqueGift(parsed.slug);
      const animationUrl = await uploadLottie(supabase, gift.model?.lottie, parsed.slug, `feature-${slot}`);
      if (!animationUrl) throw new Error('Gift animatsiyasi olinmadi.');
      const center = clean(gift.backdrop?.centerColor || '#7c3aed');
      const edge = clean(gift.backdrop?.edgeColor || '#111827');
      const value = {
        slot, source_url: parsed.url, slug: parsed.slug, animation_url: animationUrl,
        title: clean(gift.name), model_name: clean(gift.model?.name),
        background_value: `radial-gradient(circle at 50% 38%, ${center}, ${edge})`,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('app_settings').upsert({ key: `feature_${slot}`, value }, { onConflict: 'key' });
      if (error) throw error;
      return json({ ok: true, setting: value, ...(await bootstrap(supabase)) });
    }

    if (action === 'gift_create_from_library') {
      const data = body.giftData || {};
      const caseId = clean(data.case_id);
      const libraryGiftId = clean(data.library_gift_id);

      if (!caseId) {
        return json({ ok: false, error: 'Case tanlanmagan.' }, 400);
      }

      if (!libraryGiftId) {
        return json({ ok: false, error: 'Gift bazadan gift tanlanmagan.' }, 400);
      }

      const { data: libraryGift, error: libraryError } = await supabase
        .from('gift_library')
        .select('*')
        .eq('id', libraryGiftId)
        .single();

      if (libraryError) throw libraryError;

      const price = toNumber(data.price ?? libraryGift.buy_price ?? libraryGift.price, 0);
      const visibleChanceValue = Math.max(0, toNumber(data.chance, 10));
      const realChanceValue = Math.max(
        0,
        toNumber(data.real_chance ?? data.drop_chance ?? visibleChanceValue, visibleChanceValue)
      );

      const row = {
        case_id: caseId,
        title: clean(data.title || libraryGift.title),
        type: 'gift',
        value: String(price || libraryGift.id),
        chance: visibleChanceValue,
        stock: Math.max(0, Math.floor(toNumber(data.stock, 1))),
        image_url: libraryGift.image_url || libraryGift.png_url || libraryGift.webp_url || '',
        animation_url: libraryGift.animation_url || '',
        background_value: libraryGift.background_value || '#7c3aed',
        rarity: clean(data.rarity || 'rare'),
        is_active: data.is_active !== false,
      };

      const optionalRow = {
        library_gift_id: libraryGift.id,
        floor_price: price,
        sell_price: price,
        buy_price: price,
        real_chance: realChanceValue,
        source: libraryGift.slug ? 'telegram_nft' : 'image_library',
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
