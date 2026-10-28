import crypto from 'crypto';
import {getSharedStarsArtworkUrl,setSharedStarsArtworkUrl} from '@/lib/caseStarsArtwork.mjs';
import { syncOwnedTelegramGifts, syncAvailableTelegramGifts } from '@/lib/telegramGiftSync';
import { gzipSync } from 'zlib';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchUniqueTelegramGift } from '@/lib/telegramGiftsImporter';
import {
  depositSettingsForClient,
  getDepositSettings,
  normalizeDepositSettings,
  settingsRow,
} from '@/lib/depositSettings';
import {
  diceSettingsForClient,
  diceSettingsRow,
  getDiceSettings,
  normalizeDiceSettings,
} from '@/lib/diceSettings';
import {
  BONUS_TASK_TYPES,
  bonusTasksRow,
  getBonusTasks,
  normalizeBonusTask,
} from '@/lib/bonusTasks';
import { normalizeTonAddress } from '@/lib/tonDeposits';
import { normalizePromoCode } from '@/lib/depositPromo';

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
    .order('created_at', { ascending: false })
    .is('archived_at', null);

  if (!ordered.error) return ordered.data || [];

  const text = `${ordered.error?.message || ''} ${ordered.error?.details || ''} ${ordered.error?.hint || ''}`;

  if (text.includes('sort_order') || text.includes('is_pinned') || ordered.error?.code === '42703') {
    const fallback = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })
      .is('archived_at', null);

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

async function listPromoCodes(supabase) {
  const cleanup = await supabase.rpc('deposit_promo_cleanup');
  if (cleanup.error) throw cleanup.error;
  const { data, error } = await supabase.rpc('deposit_promo_admin_list');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function getDiceStats(supabase) {
  const { data, error } = await supabase.rpc('dice_admin_overview');
  if (error) {
    if (error.code === 'PGRST202') return null;
    throw error;
  }
  return data || null;
}

async function bootstrap(supabase) {
  const [
    cases,
    gifts,
    users,
    withdrawals,
    giftLibrary,
    upgradeGifts,
    featureRows,
    deposits,
    depositSettings,
    diceSettings,
    diceStats,
    bonusTasks,
    bonusProgress,
    promoCodes,
    referralSettingsResult,
  ] = await Promise.all([
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
    safeSelect(supabase, 'gifts', supabase.from('gifts').select('*').eq('source','upgrade_catalog')),
    safeSelect(supabase, 'app_settings', supabase.from('app_settings').select('key,value').in('key', ['feature_rocket', 'feature_pvp'])),
    safeSelect(
      supabase,
      'deposit_transactions',
      supabase
        .from('deposit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(250)
    ),
    getDepositSettings(supabase),
    getDiceSettings(supabase),
    getDiceStats(supabase),
    getBonusTasks(supabase, { includeInactive: true }),
    safeSelect(
      supabase,
      'app_settings',
      supabase
        .from('app_settings')
        .select('key,value')
        .like('key', 'bonus_progress_%')
        .limit(1000)
    ),
    listPromoCodes(supabase),
    supabase.from('referral_settings').select('enabled,inviter_reward,invitee_reward,activation_mode').eq('id', 1).maybeSingle(),
  ]);
  if (referralSettingsResult.error) throw referralSettingsResult.error;

  const completedProgress = (bonusProgress || []).filter(
    (row) => row?.value?.status === 'completed'
  );

  return {
    cases: await normalizeCaseOrder(supabase, cases),
    starsArtworkUrl: await getSharedStarsArtworkUrl(supabase),
    gifts,
    users,
    withdrawals,
    giftLibrary,
    upgradeGifts,
    featureSettings: Object.fromEntries((featureRows || []).map((item) => [item.key, item.value || {}])),
    deposits,
    promoCodes,
    depositSettings: depositSettingsForClient(depositSettings),
    diceSettings: diceSettingsForClient(diceSettings),
    diceStats,
    bonusTasks,
    referralSettings: {
      enabled: referralSettingsResult.data?.enabled !== false,
      inviterReward: Number(referralSettingsResult.data?.inviter_reward || 0),
      inviteeReward: Number(referralSettingsResult.data?.invitee_reward || 0),
      activationMode: referralSettingsResult.data?.activation_mode || 'completed_task',
    },
    bonusStats: {
      totalTasks: bonusTasks.length,
      activeTasks: bonusTasks.filter((task) => task.isActive).length,
      started: (bonusProgress || []).length,
      completed: completedProgress.length,
      paid: completedProgress.reduce(
        (sum, row) => sum + Math.max(0, Number(row?.value?.reward || 0)),
        0
      ),
    },
  };
}

function depositSqlError(error) {
  const text =
    `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === 'PGRST202' ||
    error?.code === '42P01' ||
    text.includes('deposit_transactions') ||
    text.includes('deposit_admin_resolve')
  );
}

function rocketSqlError(error) {
  const text =
    `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === 'PGRST202' ||
    error?.code === '42P01' ||
    text.includes('could not find the function') ||
    text.includes('rocket_game_round_plans') ||
    text.includes('rocket_game_control')
  );
}

async function callRocketAdminRpc(supabase, functionName, params = {}) {
  const { data, error } = await supabase.rpc(functionName, params);

  if (error) {
    if (rocketSqlError(error)) {
      throw new Error(
        'Rocket V8 SQL o‘rnatilmagan. Supabase SQL Editor’da sql/rocket-game.sql faylini to‘liq Run qiling.'
      );
    }

    throw error;
  }

  return data;
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
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Case rasmi 12 MB dan oshmasligi kerak.');
  }

  // Native image processing is intentionally not used in this API:
  // sharp/libvips cannot always load in the Vercel Node runtime.
  // Browser uploads are normalized beforehand; original assets still render
  // safely with CSS object-fit:contain if the client conversion is unavailable.
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

  return { imageUrl: uploaded.publicUrl, imageType: ext };
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

async function createCaseStarsReward(supabase, data, file = null) {
  const caseId = clean(data.case_id);
  const amount = Number(data.stars_amount);
  const stock = Number(data.stock);
  const chance = Number(data.chance);
  const realChance = Number(data.real_chance);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(caseId))
    throw new Error('Case tanlanmagan.');
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000)
    throw new Error('Stars 1–100 000 orasida bo‘lishi kerak.');
  if (!Number.isSafeInteger(stock) || stock < 1 || stock > 1000000)
    throw new Error('Stock 1–1 000 000 oralig‘ida bo‘lishi kerak.');
  if (!Number.isFinite(chance) || chance < 0 || chance > 100 ||
      !Number.isFinite(realChance) || realChance < 0 || realChance > 100)
    throw new Error('Foiz 0–100 orasida bo‘lishi kerak.');
  const { data: currentCase, error: caseError } = await supabase.from('cases')
    .select('id').eq('id',caseId).eq('is_active',true).is('archived_at',null).maybeSingle();
  if (caseError) throw caseError;
  if (!currentCase) throw new Error('Faol Case topilmadi.');

  const existingSharedImage = await getSharedStarsArtworkUrl(supabase);
  let uploadedImage = '';
  if (file && typeof file.arrayBuffer === 'function' && file.size > 0) {
    const uploaded = await uploadStarsRewardImage(supabase,file,`stars-${amount}`);
    uploadedImage = uploaded.imageUrl;
  }
  const imageUrl = uploadedImage || existingSharedImage;
  const row = {
    case_id:caseId, title:`${amount.toLocaleString('en-US')} Stars`,
    type:'balance', value:String(amount),
    chance, real_chance:realChance, stock,
    image_url:imageUrl || null, animation_url:null,
    background_value:'#e9ac3d',
    rarity:clean(data.rarity || 'common'),
    floor_price:0, sell_price:0, buy_price:0,
    source:'case_stars', is_active:data.is_active !== false,
  };
  const {data:gift,error} = await supabase.from('gifts').insert(row).select('*').single();
  if(error)throw error;
  if(uploadedImage) {
    const shared = await setSharedStarsArtworkUrl(supabase,uploadedImage);
    return {...gift,image_url:shared.imageUrl};
  }
  return gift;
}

// Only raster images for balance rewards; don't execute untrusted SVG.
async function uploadStarsRewardImage(supabase,file,title) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size <= 0)
    throw new Error('Stars mukofoti uchun PNG yoki JPG tanlang.');
  if (file.size > 8 * 1024 * 1024)
    throw new Error('Stars rasmi 8 MB dan kichik bo‘lishi kerak.');
  if (!['png','jpg'].includes(extensionFromFile(file)))
    throw new Error('Stars rasmi faqat PNG yoki JPG bo‘lishi mumkin.');
  return uploadGiftImage(supabase,file,title);
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

  if (action === 'case_replace_image') {
    const caseId = clean(formData.get('case_id'));
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(caseId)) {
      return json({ ok: false, error: 'Case ID noto‘g‘ri.' }, 400);
    }
    const { data: found, error: lookupError } = await supabase.from('cases')
      .select('id,title').eq('id', caseId).is('archived_at', null).maybeSingle();
    if (lookupError) throw lookupError;
    if (!found) return json({ ok: false, error: 'Case topilmadi.' }, 404);
    const uploaded = await uploadCaseImage(supabase, formData.get('image_file'), found.title);
    const { data: changed, error } = await supabase.from('cases')
      .update({ image_url: uploaded.imageUrl, updated_at: new Date().toISOString() })
      .eq('id', caseId).is('archived_at', null).select('*').single();
    if (error) throw error;
    return json({ ok: true, case: changed, ...(await bootstrap(supabase)) });
  }

  if (action === 'case_xp_reward_create') {
    const caseId=clean(formData.get('case_id'));
    const amount=Number(formData.get('xp_amount'));
    const stock=Number(formData.get('stock'));
    const chance=Number(formData.get('chance'));
    const realChance=Number(formData.get('real_chance'));
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(caseId))throw new Error('Case ID noto‘g‘ri.');
    if(!Number.isSafeInteger(amount)||amount<1||amount>100000)throw new Error('XP 1–100000 oralig‘ida.');
    if(!Number.isSafeInteger(stock)||stock<1||stock>1000000)throw new Error('Stock 1–1000000 oralig‘ida.');
    if(![chance,realChance].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw new Error('Foiz 0–100 oralig‘ida.');
    const {data:found,error:caseError}=await supabase.from('cases').select('id')
      .eq('id',caseId).eq('is_active',true).is('archived_at',null).maybeSingle();
    if(caseError)throw caseError;
    if(!found)throw new Error('Faol Case topilmadi.');
    const {data:reward,error}=await supabase.from('gifts').insert({
      case_id:caseId,title:amount+' XP',type:'xp',value:String(amount),
      chance,real_chance:realChance,stock,
      image_url:'/rewards/xp-orb.svg',background_value:'#8b5cf6',
      rarity:clean(formData.get('rarity'))||'rare',is_active:formData.get('is_active')!=='false',
      source:'case_xp',floor_price:0,sell_price:0,buy_price:0
    }).select('*').single();
    if(error)throw error;
    return json({ok:true,gift:reward,...(await bootstrap(supabase))});
  }

  if (action === 'case_stars_reward_create_upload') {
    const gift = await createCaseStarsReward(supabase, {
      case_id: formData.get('case_id'),
      stars_amount: formData.get('stars_amount'),
      stock: formData.get('stock'),
      chance: formData.get('chance'),
      real_chance: formData.get('real_chance'),
      rarity: formData.get('rarity'),
      is_active: formData.get('is_active') !== 'false',
    }, formData.get('image_file'));
    return json({ok:true,gift,...(await bootstrap(supabase))});
  }

  if (action === 'case_stars_reward_image_replace') {
    const giftId = clean(formData.get('gift_id'));
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(giftId))
      return json({ok:false,error:'Stars mukofoti topilmadi.'},400);
    const {data:reward,error:lookupError} = await supabase.from('gifts')
      .select('id,title,type,source').eq('id',giftId).maybeSingle();
    if(lookupError)throw lookupError;
    if(!reward || reward.type !== 'balance' || reward.source !== 'case_stars')
      return json({ok:false,error:'Stars mukofoti topilmadi.'},404);
    const image = await uploadStarsRewardImage(supabase,formData.get('image_file'),reward.title);
    const shared = await setSharedStarsArtworkUrl(supabase,image.imageUrl);
    return json({ok:true,gift:{...reward,image_url:shared.imageUrl},updatedCount:shared.updatedCount,...(await bootstrap(supabase))});
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

    if (action === 'gift_owned_sync') {
      const allowedIds = String(process.env.ADMIN_IDS || '').split(',')
        .map((id) => id.trim()).filter((id) => /^\d+$/.test(id));
      const ownerId = String(body.userId || allowedIds[0] || '').trim();
      if (!allowedIds.includes(ownerId)) {
        return json({ ok: false, error: 'Faqat ro‘yxatdagi admin Telegram akkaunti sinxronlanadi.' }, 403);
      }
      const [available, result] = await Promise.all([
        syncAvailableTelegramGifts().catch((error) => ({ error: String(error.message || error) })),
        syncOwnedTelegramGifts(Number(ownerId)),
      ]);
      return json({ ok: true, sync: { ...result, available }, ...(await bootstrap(supabase)) });
    }

    if (action === 'bootstrap') {
      const data = await bootstrap(supabase);
      return json({ ok: true, ...data });
    }

    if (action === 'dice_stats') {
      return json({ ok: true, diceStats: await getDiceStats(supabase) });
    }

    if (action === 'dice_settings_update') {
      const settings = normalizeDiceSettings(body.settings || {});
      const { error } = await supabase
        .from('app_settings')
        .upsert(diceSettingsRow(settings), { onConflict: 'key' });

      if (error) throw error;

      return json({
        ok: true,
        diceSettings: diceSettingsForClient(settings),
      });
    }

    if (action === 'referral_settings_update') {
      const input = body.settings || {};
      const inviterReward = Number(input.inviterReward);
      const inviteeReward = Number(input.inviteeReward);
      if (![inviterReward, inviteeReward].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000)) {
        return json({ ok: false, error: 'Referal Stars 0–100000 butun son bo‘lishi kerak.' }, 400);
      }
      const { error } = await supabase.from('referral_settings').upsert({
        id: 1,
        enabled: input.enabled === true,
        inviter_reward: inviterReward,
        invitee_reward: inviteeReward,
        activation_mode: 'completed_task',
      }, { onConflict: 'id' });
      if (error) throw error;
      return json({ ok: true, ...(await bootstrap(supabase)) });
    }

    if (action === 'bonus_task_save') {
      const input = body.taskData || {};
      const tasks = await getBonusTasks(supabase, { includeInactive: true });
      const existingIndex = tasks.findIndex((task) => task.id === clean(input.id));
      const existing = existingIndex >= 0 ? tasks[existingIndex] : null;
      const now = new Date().toISOString();
      const task = normalizeBonusTask({
        ...existing,
        ...input,
        id: existing?.id || crypto.randomUUID(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sortOrder: Number.isFinite(Number(input.sortOrder))
          ? Number(input.sortOrder)
          : existing?.sortOrder ?? tasks.length,
      });

      if (!task.title) return json({ ok: false, error: 'Task nomini yozing.' }, 400);
      if (!task.url) return json({ ok: false, error: 'Task havolasi noto‘g‘ri.' }, 400);
      if (!BONUS_TASK_TYPES[task.type]) {
        return json({ ok: false, error: 'Task turi noto‘g‘ri.' }, 400);
      }
      if (task.type === 'telegram_channel' && !task.chatId) {
        return json({ ok: false, error: 'Telegram kanal username yoki chat ID kiriting.' }, 400);
      }

      const nextTasks = [...tasks];
      if (existingIndex >= 0) nextTasks[existingIndex] = task;
      else nextTasks.push(task);

      const { error } = await supabase
        .from('app_settings')
        .upsert(bonusTasksRow(nextTasks), { onConflict: 'key' });
      if (error) throw error;

      return json({ ok: true, ...(await bootstrap(supabase)) });
    }

    if (action === 'bonus_task_delete') {
      const taskId = clean(body.taskId);
      const tasks = await getBonusTasks(supabase, { includeInactive: true });
      const nextTasks = tasks.filter((task) => task.id !== taskId);
      if (nextTasks.length === tasks.length) {
        return json({ ok: false, error: 'Task topilmadi.' }, 404);
      }

      const { error } = await supabase
        .from('app_settings')
        .upsert(bonusTasksRow(nextTasks), { onConflict: 'key' });
      if (error) throw error;

      return json({ ok: true, ...(await bootstrap(supabase)) });
    }

    if (action === 'deposit_settings_update') {
      const settings = normalizeDepositSettings(body.settings || {});

      if (settings.tonWallet) {
        normalizeTonAddress(settings.tonWallet);
      }

      const { error } = await supabase
        .from('app_settings')
        .upsert(settingsRow(settings), { onConflict: 'key' });

      if (error) throw error;

      return json({
        ok: true,
        depositSettings: depositSettingsForClient(settings),
      });
    }

    if (action === 'promo_save') {
      const input = body.promo || {};
      const code = normalizePromoCode(input.code);
      const bonusPercent = Number(input.bonusPercent);
      const maxUsers = Number(input.maxUsers);
      const minCredit = Number(input.minCredit || 0);
      const id = clean(input.id);
      if (!code || !Number.isFinite(bonusPercent) || bonusPercent <= 0 || bonusPercent > 100)
        return json({ ok: false, error: 'Promokod va bonus foizi (1–100%) kerak.' }, 400);
      if (!Number.isSafeInteger(maxUsers) || maxUsers < 1 || maxUsers > 1000000)
        return json({ ok: false, error: 'Foydalanuvchilar limiti 1–1000000 oralig‘ida bo‘lsin.' }, 400);
      if (!Number.isFinite(minCredit) || minCredit < 0)
        return json({ ok: false, error: 'Minimal depozit noto‘g‘ri.' }, 400);
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()))
        return json({ ok: false, error: 'Promokod tugash vaqti kelajakda bo‘lishi kerak.' }, 400);
      const row = {
        code, bonus_percent: bonusPercent, max_users: maxUsers, min_credit: minCredit,
        enabled: input.enabled !== false, expires_at: expiresAt?.toISOString() || null,
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const occupiedSlots = (await listPromoCodes(supabase)).find((item) => item.id === id);
        if (!occupiedSlots) return json({ ok: false, error: 'Promokod topilmadi.' }, 404);
        if (maxUsers < Number(occupiedSlots.used || 0))
          return json({ ok: false, error: 'Limit kodni faollashtirgan yoki ishlatgan odamlar sonidan kam bo‘lolmaydi.' }, 400);
        const { error } = await supabase.from('deposit_promo_codes').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('deposit_promo_codes').insert(row);
        if (error) throw error;
      }
      return json({ ok: true, promoCodes: await listPromoCodes(supabase) });
    }

    if (action === 'promo_toggle') {
      const id = clean(body.promoId);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: 'Promokod ID noto‘g‘ri.' }, 400);
      const { error } = await supabase.from('deposit_promo_codes')
        .update({ enabled: Boolean(body.enabled), updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      return json({ ok: true, promoCodes: await listPromoCodes(supabase) });
    }

    if (action === 'deposit_resolve') {
      const depositId = clean(body.depositId);
      const status = clean(body.status).toLowerCase();

      if (!/^[0-9a-f-]{36}$/i.test(depositId)) {
        return json({ ok: false, error: 'Deposit ID noto‘g‘ri.' }, 400);
      }

      if (!['approved', 'rejected'].includes(status)) {
        return json({ ok: false, error: 'Deposit statusi noto‘g‘ri.' }, 400);
      }

      const creditAmount = Number(body.creditAmount);

      if (
        status === 'approved' &&
        (!Number.isFinite(creditAmount) || creditAmount <= 0)
      ) {
        return json(
          { ok: false, error: 'Tasdiqlash uchun Stars miqdorini kiriting.' },
          400
        );
      }

      const { data, error } = await supabase.rpc('deposit_admin_resolve', {
        p_deposit_id: depositId,
        p_approve: status === 'approved',
        p_credit_amount:
          status === 'approved' ? Math.floor(creditAmount) : null,
        p_admin_note: clean(body.note).slice(0, 500) || null,
      });

      if (error) {
        if (depositSqlError(error)) {
          throw new Error(
            'Deposit SQL o‘rnatilmagan. Supabase’da sql/deposit-system.sql faylini to‘liq Run qiling.'
          );
        }

        throw error;
      }

      return json({ ok: true, deposit: data });
    }

    if (action === 'rocket_state') {
      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_admin_state'
      );

      return json({ ok: true, rocket });
    }

    // Live outcomes are not editable by administrators. Allow observation only.
    if (['rocket_set_bias','rocket_set_next','rocket_reset_next','rocket_launch_now','rocket_force_crash'].includes(action)) {
      return json({ ok: false, error: 'Rocket natijalari avtomatik hisoblanadi. Qo‘lda o‘zgartirish o‘chirilgan.' }, 403);
    }

    if (action === 'rocket_set_bias') {
      const biasMode = clean(body.biasMode).toLowerCase();

      if (!['low', 'standard', 'high'].includes(biasMode)) {
        return json(
          { ok: false, error: 'Rocket rejimi noto‘g‘ri.' },
          400
        );
      }

      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_set_bias',
        { p_bias_mode: biasMode }
      );

      return json({ ok: true, rocket });
    }

    if (action === 'rocket_set_next') {
      const multiplier = Number(body.multiplier);

      if (
        !Number.isFinite(multiplier) ||
        multiplier < 1 ||
        multiplier > 1000
      ) {
        return json(
          {
            ok: false,
            error: 'Koeffitsiyent 1.00x–1000.00x oralig‘ida bo‘lishi kerak.',
          },
          400
        );
      }

      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_set_next_multiplier',
        { p_multiplier: Number(multiplier.toFixed(2)) }
      );

      return json({ ok: true, rocket });
    }

    if (action === 'rocket_reset_next') {
      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_reset_next_multiplier'
      );

      return json({ ok: true, rocket });
    }

    if (action === 'rocket_launch_now') {
      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_launch_now'
      );

      return json({ ok: true, rocket });
    }

    if (action === 'rocket_force_crash') {
      const rocket = await callRocketAdminRpc(
        supabase,
        'rocket_v8_force_crash'
      );

      return json({ ok: true, rocket });
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

    if (action === 'case_image_layout_update') {
      const caseId = clean(body.caseId), scale = Number(body.scale), x = Number(body.x), y = Number(body.y);
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(caseId)
          || !Number.isFinite(scale) || scale < .65 || scale > 2.5
          || !Number.isSafeInteger(x) || x < -50 || x > 50
          || !Number.isSafeInteger(y) || y < -50 || y > 50) {
        return json({ok:false,error:'Rasm sozlamalari noto‘g‘ri.'},400);
      }
      const {data,error}=await supabase.from('cases')
        .update({image_scale:scale,image_offset_x:x,image_offset_y:y})
        .eq('id',caseId).is('archived_at',null).select('*').single();
      if(error)throw error;
      return json({ok:true,case:data});
    }

    if (action === 'case_delete') {
      const { error } = await supabase.from('cases').update({ is_active: false, archived_at: new Date().toISOString() })
        .eq('id',body.caseId).is('archived_at',null);
      if (error) throw error;
      return json({ok:true});
    }

    if (action === 'case_archive_all') {
      const {data,error}=await supabase.from('cases').update({is_active:false,archived_at:new Date().toISOString()})
        .is('archived_at',null).select('id');
      if(error)throw error;
      return json({ok:true,archivedCount:(data||[]).length,...(await bootstrap(supabase))});
    }

    if (action === 'upgrade_stock_set') {
      const libraryGiftId=clean(body.libraryGiftId);
      const stock=Number(body.stock);
      if(!/^[0-9a-f-]{36}$/i.test(libraryGiftId)||!Number.isSafeInteger(stock)||stock<0||stock>10000)
        return json({ok:false,error:'Gift yoki stock noto‘g‘ri.'},400);
      const {data:lib,error:libErr}=await supabase.from('gift_library').select('*')
        .eq('id',libraryGiftId).eq('is_active',true).maybeSingle();
      if(libErr)throw libErr;
      if(!lib)return json({ok:false,error:'Gift bazadan topilmadi.'},404);
      const price=Number(lib.buy_price||lib.price||0);
      if(!Number.isFinite(price)||price<=0)return json({ok:false,error:'Gift narxini to‘g‘rilang.'},400);
      const payload={case_id:null,library_gift_id:lib.id,source:'upgrade_catalog',title:lib.title,
        type:'gift',value:String(price),chance:0,real_chance:0,stock,is_active:true,
        image_url:lib.image_url||lib.png_url||lib.webp_url||'',animation_url:lib.animation_url||'',
        background_value:lib.background_value||'#252037',floor_price:price,buy_price:price,sell_price:price};
      const {data:previous,error:readErr}=await supabase.from('gifts').select('id')
        .eq('library_gift_id',lib.id).eq('source','upgrade_catalog').maybeSingle();
      if(readErr)throw readErr;
      const write=previous?await supabase.from('gifts').update(payload).eq('id',previous.id)
        :await supabase.from('gifts').insert(payload);
      if(write.error)throw write.error;
      return json({ok:true,...(await bootstrap(supabase))});
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
      const settingKey = `feature_${slot}`;
      const { data: existingRow } = await supabase.from('app_settings').select('value').eq('key', settingKey).maybeSingle();
      const value = {
        ...(existingRow?.value || {}),
        slot, source_url: parsed.url, slug: parsed.slug, animation_url: animationUrl,
        title: clean(gift.name), model_name: clean(gift.model?.name),
        background_value: `radial-gradient(circle at 50% 38%, ${center}, ${edge})`,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('app_settings').upsert({ key: settingKey, value }, { onConflict: 'key' });
      if (error) throw error;
      return json({ ok: true, setting: value, ...(await bootstrap(supabase)) });
    }

    if (action === 'feature_layout_update') {
      const slot = clean(body.slot).toLowerCase();
      if (!['rocket', 'pvp'].includes(slot)) return json({ ok: false, error: 'Feature turi noto‘g‘ri.' }, 400);
      const settingKey = `feature_${slot}`;
      const { data: existingRow, error: selectError } = await supabase.from('app_settings').select('value').eq('key', settingKey).maybeSingle();
      if (selectError) throw selectError;
      const value = {
        ...(existingRow?.value || {}), slot,
        scale: Math.min(160, Math.max(35, toNumber(body.scale, slot === 'pvp' ? 78 : 80))),
        offset_x: Math.min(140, Math.max(-140, toNumber(body.offset_x, 0))),
        offset_y: Math.min(100, Math.max(-100, toNumber(body.offset_y, slot === 'pvp' ? -18 : -16))),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('app_settings').upsert({ key: settingKey, value }, { onConflict: 'key' });
      if (error) throw error;
      return json({ ok: true, setting: value, ...(await bootstrap(supabase)) });
    }

    if (action === 'case_stars_reward_create') {
      const gift = await createCaseStarsReward(supabase, body.giftData || {});
      return json({ok:true,gift,...(await bootstrap(supabase))});
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
      const visibleChanceValue = Number(data.chance ?? 10);
      const realChanceValue = Number(data.real_chance ?? data.drop_chance ?? visibleChanceValue);
      if (!Number.isFinite(visibleChanceValue) || visibleChanceValue < 0 || visibleChanceValue > 100
          || !Number.isFinite(realChanceValue) || realChanceValue < 0 || realChanceValue > 100)
        return json({ok:false,error:'Chance va Real % 0–100 oralig‘ida bo‘lishi kerak.'},400);

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
      // Keep the public admin editor safe: no raw updates to balance, stock or reward identity.
      const changes = {};
      if (typeof updates?.is_active === 'boolean') changes.is_active = updates.is_active;
      if (updates?.real_chance !== undefined) {
        const actual = Number(updates.real_chance);
        if (!Number.isFinite(actual) || actual < 0 || actual > 100)
          return json({ok:false,error:'Real % 0–100 orasida bo‘lishi kerak.'},400);
        changes.real_chance = actual;
      }
      if (updates?.chance !== undefined) {
        const visible = Number(updates.chance);
        if (!Number.isFinite(visible) || visible < 0 || visible > 100)
          return json({ok:false,error:'Chance 0–100 orasida bo‘lishi kerak.'},400);
        changes.chance = visible;
      }
      if (!Object.keys(changes).length)
        return json({ok:false,error:'O‘zgartirish uchun maydon tanlanmagan.'},400);
      const { data, error } = await supabase.from('gifts').update(changes).eq('id', giftId).select('*').single();

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
      if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) {
        return json({ ok: false, error: 'Miqdor butun son va 1–1 000 000 oralig‘ida bo‘lsin.' }, 400);
      }
      const operationId = /^[0-9a-f-]{36}$/i.test(String(body.operationId || ''))
        ? String(body.operationId) : crypto.randomUUID();
      const { data, error } = await supabase.rpc('admin_balance_adjust_atomic', {
        p_user_id: userId, p_delta: amount, p_operation_id: operationId,
        p_reason: 'browser-admin',
      });
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
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ ok: false, error: 'So‘rov allaqachon ko‘rib chiqilgan.' }, 409);
      return json({ ok: true, withdrawal: data });
    }

    return json({ ok: false, error: 'Noma’lum action.' }, 400);
  } catch (error) {
    console.error('[browser-admin]', error);

    return json({ ok: false, error: error.message || 'Server xatosi' }, 401);
  }
}
