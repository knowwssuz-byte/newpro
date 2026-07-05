import crypto from 'crypto';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const DEFAULT_LIMIT = 120;
const DEFAULT_BUCKET = 'gift-assets';
const DEFAULT_DOWNLOAD_LIMIT = 8 * 1024 * 1024;

function clean(value = '') {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function toLongString(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function rgb24ToHex(value, fallback = '#111827') {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  const hex = Math.max(0, Math.min(0xffffff, number))
    .toString(16)
    .padStart(6, '0');

  return `#${hex}`;
}

function safeJson(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (Buffer.isBuffer(item)) return undefined;
    if (item instanceof Uint8Array) return undefined;
    return item;
  }));
}

function getTelegramConfig() {
  const apiId = Number(process.env.TG_API_ID || process.env.TELEGRAM_API_ID || 0);
  const apiHash = clean(process.env.TG_API_HASH || process.env.TELEGRAM_API_HASH);
  const session = clean(process.env.TG_STRING_SESSION || process.env.TELEGRAM_STRING_SESSION);

  if (!Number.isFinite(apiId) || apiId <= 0) {
    throw new Error('TG_API_ID Vercel ENV ichida yo‘q yoki noto‘g‘ri.');
  }

  if (!apiHash) {
    throw new Error('TG_API_HASH Vercel ENV ichida yo‘q.');
  }

  if (!session) {
    throw new Error('TG_STRING_SESSION Vercel ENV ichida yo‘q. Avval scripts/get-telegram-session.js bilan oling.');
  }

  return { apiId, apiHash, session };
}

async function createTelegramClient() {
  const { apiId, apiHash, session } = getTelegramConfig();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 3,
    useWSS: false,
  });

  await client.connect();

  if (typeof client.checkAuthorization === 'function') {
    const authorized = await client.checkAuthorization();

    if (!authorized) {
      throw new Error('TG_STRING_SESSION yaroqsiz. Sessionni qaytadan oling.');
    }
  }

  return client;
}

async function withTelegramClient(callback) {
  const client = await createTelegramClient();

  try {
    return await callback(client);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // disconnect xatosi importni buzmasin
    }
  }
}

function documentFileName(document = {}) {
  const attrs = document.attributes || [];
  const fileNameAttr = attrs.find((attr) => attr?.fileName || attr?.file_name);

  return clean(fileNameAttr?.fileName || fileNameAttr?.file_name || '');
}

function extensionFromDocument(document = {}, fallback = 'bin') {
  const fileName = documentFileName(document);
  const fromName = fileName.split('.').pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  const mime = clean(document.mimeType || document.mime_type).toLowerCase();

  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'application/x-tgsticker') return 'tgs';
  if (mime === 'application/gzip') return 'tgs';

  return fallback;
}

function contentTypeFromDocument(document = {}, fallback = 'application/octet-stream') {
  return clean(document.mimeType || document.mime_type) || fallback;
}

function resolveBackground(background = null) {
  if (!background) {
    return {
      centerColor: '#7c3aed',
      edgeColor: '#111827',
      textColor: '#ffffff',
      cssGradient: 'linear-gradient(135deg,#7c3aed 0%,#111827 72%,#020617 100%)',
    };
  }

  const centerColor = rgb24ToHex(background.centerColor ?? background.center_color, '#7c3aed');
  const edgeColor = rgb24ToHex(background.edgeColor ?? background.edge_color, '#111827');
  const textColor = rgb24ToHex(background.textColor ?? background.text_color, '#ffffff');

  return {
    className: background.className || background.class_name || 'starGiftBackground',
    centerColor,
    edgeColor,
    textColor,
    rawCenterColor: background.centerColor ?? background.center_color ?? null,
    rawEdgeColor: background.edgeColor ?? background.edge_color ?? null,
    rawTextColor: background.textColor ?? background.text_color ?? null,
    cssGradient: `linear-gradient(135deg, ${centerColor} 0%, ${edgeColor} 68%, #020617 100%)`,
  };
}

function normalizeStarGift(gift) {
  const id = toLongString(gift?.id);
  const title = clean(gift?.title) || `Telegram Gift ${id || ''}`.trim();
  const stars = toLongString(gift?.stars);
  const convertStars = toLongString(gift?.convertStars ?? gift?.convert_stars);
  const upgradeStars = toLongString(gift?.upgradeStars ?? gift?.upgrade_stars);
  const availabilityRemains = gift?.availabilityRemains ?? gift?.availability_remains ?? null;
  const availabilityTotal = gift?.availabilityTotal ?? gift?.availability_total ?? null;
  const background = resolveBackground(gift?.background || null);
  const sticker = gift?.sticker || null;
  const stickerMimeType = sticker ? contentTypeFromDocument(sticker, '') : '';
  const stickerExt = sticker ? extensionFromDocument(sticker, '') : '';

  return safeJson({
    id,
    telegramGiftId: id,
    title,
    stars,
    convertStars,
    upgradeStars,
    limited: Boolean(gift?.limited),
    soldOut: Boolean(gift?.soldOut ?? gift?.sold_out),
    requirePremium: Boolean(gift?.requirePremium ?? gift?.require_premium),
    availabilityRemains,
    availabilityTotal,
    firstSaleDate: gift?.firstSaleDate ?? gift?.first_sale_date ?? null,
    lastSaleDate: gift?.lastSaleDate ?? gift?.last_sale_date ?? null,
    upgradeVariants: gift?.upgradeVariants ?? gift?.upgrade_variants ?? null,
    background,
    sticker: sticker
      ? {
          id: toLongString(sticker.id),
          accessHash: toLongString(sticker.accessHash ?? sticker.access_hash),
          dcId: sticker.dcId ?? sticker.dc_id ?? null,
          size: sticker.size ?? null,
          mimeType: stickerMimeType,
          ext: stickerExt,
          fileName: documentFileName(sticker),
          thumbsCount: Array.isArray(sticker.thumbs) ? sticker.thumbs.length : 0,
        }
      : null,
    _raw: gift,
  });
}

async function downloadStickerThumbnail(client, document) {
  if (!document) return null;

  const thumbs = Array.isArray(document.thumbs) ? document.thumbs : [];
  const attempts = [];

  if (thumbs.length) attempts.push(thumbs.length - 1);
  if (thumbs.length > 1) attempts.push(0);
  attempts.push(undefined);

  for (const thumb of attempts) {
    try {
      const buffer = await client.downloadMedia(document, {
        workers: 1,
        thumb,
      });

      if (buffer && Buffer.byteLength(buffer) > 0) {
        return Buffer.from(buffer);
      }
    } catch {
      // keyingi variant bilan urinib ko‘ramiz
    }
  }

  return null;
}

async function downloadStickerFull(client, document) {
  if (!document) return null;

  try {
    const buffer = await client.downloadMedia(document, { workers: 1 });

    if (buffer && Buffer.byteLength(buffer) > 0) {
      return Buffer.from(buffer);
    }
  } catch {
    return null;
  }

  return null;
}

async function uploadAsset(supabase, { buffer, contentType, folder, ext, prefix }) {
  if (!buffer || !Buffer.byteLength(buffer)) return null;

  const bucket = process.env.SUPABASE_GIFT_ASSETS_BUCKET || DEFAULT_BUCKET;
  const safeExt = clean(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const safeFolder = clean(folder || 'telegram').replace(/[^a-z0-9/_-]/gi, '-').toLowerCase();
  const filePath = `${safeFolder}/${Date.now()}-${prefix || 'gift'}-${crypto.randomUUID()}.${safeExt}`;

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

async function downloadAndUploadGiftAssets(client, supabase, gift) {
  const document = gift?._raw?.sticker || null;
  const stickerInfo = gift?.sticker || {};
  const prefix = `tg-${gift.telegramGiftId || gift.id}`;
  const maxBytes = Number(process.env.TG_GIFT_ASSET_MAX_BYTES || DEFAULT_DOWNLOAD_LIMIT);
  const assets = {
    image: null,
    animation: null,
  };

  if (!document) return assets;

  const thumbnail = await downloadStickerThumbnail(client, document);

  if (thumbnail && Buffer.byteLength(thumbnail) <= maxBytes) {
    assets.image = await uploadAsset(supabase, {
      buffer: thumbnail,
      contentType: 'image/jpeg',
      folder: 'telegram/images',
      ext: 'jpg',
      prefix,
    });
  }

  const mimeType = stickerInfo.mimeType || contentTypeFromDocument(document, 'application/octet-stream');
  const ext = stickerInfo.ext || extensionFromDocument(document, 'bin');
  const shouldUploadFull = mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.includes('tgsticker') || ext === 'tgs';

  if (shouldUploadFull) {
    const full = await downloadStickerFull(client, document);

    if (full && Buffer.byteLength(full) <= maxBytes) {
      const kind = mimeType.startsWith('image/') ? 'image' : 'animation';
      const uploaded = await uploadAsset(supabase, {
        buffer: full,
        contentType: mimeType,
        folder: kind === 'image' ? 'telegram/images' : 'telegram/animations',
        ext,
        prefix,
      });

      if (kind === 'image') {
        assets.image = assets.image || uploaded;
      } else {
        assets.animation = uploaded;
      }
    }
  }

  return assets;
}

export async function fetchTelegramGiftPreviews({ limit = DEFAULT_LIMIT } = {}) {
  return withTelegramClient(async (client) => {
    if (!Api?.payments?.GetStarGifts) {
      throw new Error('GramJS ichida payments.GetStarGifts topilmadi. telegram package yangilanishi kerak.');
    }

    const result = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
    const gifts = Array.isArray(result?.gifts) ? result.gifts : [];

    return gifts
      .map(normalizeStarGift)
      .filter((gift) => gift.telegramGiftId)
      .slice(0, Math.max(1, Number(limit || DEFAULT_LIMIT)))
      .map(({ _raw, ...gift }) => gift);
  });
}

export async function importTelegramGiftsToCase(supabase, options = {}) {
  const caseId = clean(options.caseId);
  const giftIds = new Set((options.giftIds || []).map((id) => clean(id)).filter(Boolean));
  const defaultChance = Math.max(0, toNumber(options.defaultChance, 10));
  const defaultStock = Math.max(0, Math.floor(toNumber(options.defaultStock, 1)));
  const rarity = clean(options.rarity || 'legendary');
  const isActive = options.isActive !== false;
  const skipExisting = options.skipExisting !== false;

  if (!caseId) {
    throw new Error('Case tanlanmagan.');
  }

  if (!giftIds.size) {
    throw new Error('Import qilish uchun gift tanlanmagan.');
  }

  return withTelegramClient(async (client) => {
    if (!Api?.payments?.GetStarGifts) {
      throw new Error('GramJS ichida payments.GetStarGifts topilmadi. telegram package yangilanishi kerak.');
    }

    const result = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
    const allGifts = Array.isArray(result?.gifts) ? result.gifts.map(normalizeStarGift) : [];
    const selected = allGifts.filter((gift) => giftIds.has(gift.telegramGiftId));

    if (!selected.length) {
      throw new Error('Tanlangan giftlar Telegram ro‘yxatidan topilmadi. Refresh qilib qayta urinib ko‘ring.');
    }

    let existingValues = new Set();

    if (skipExisting) {
      const { data: existing, error: existingError } = await supabase
        .from('gifts')
        .select('id,value')
        .eq('case_id', caseId)
        .in('value', selected.map((gift) => gift.telegramGiftId));

      if (existingError) throw existingError;
      existingValues = new Set((existing || []).map((item) => clean(item.value)));
    }

    const rows = [];
    const importedAssets = [];
    const skipped = [];

    for (const gift of selected) {
      if (skipExisting && existingValues.has(gift.telegramGiftId)) {
        skipped.push({ id: gift.telegramGiftId, title: gift.title, reason: 'already_exists' });
        continue;
      }

      const assets = await downloadAndUploadGiftAssets(client, supabase, gift);
      importedAssets.push({ id: gift.telegramGiftId, assets });

      const limitedStock = Number(gift.availabilityRemains || 0);
      const resolvedStock = limitedStock > 0 ? Math.min(limitedStock, defaultStock || limitedStock) : defaultStock;
      const stars = gift.stars ? `${gift.stars} ⭐` : gift.telegramGiftId;

      rows.push({
        case_id: caseId,
        title: gift.title,
        type: 'gift',
        value: gift.telegramGiftId,
        chance: defaultChance,
        stock: resolvedStock,
        image_url: assets.image?.publicUrl || '',
        animation_url: assets.animation?.publicUrl || '',
        background_value: gift.background?.cssGradient || 'linear-gradient(135deg,#7c3aed 0%,#111827 100%)',
        rarity,
        is_active: isActive,
      });
    }

    if (!rows.length) {
      return {
        inserted: [],
        skipped,
        assets: importedAssets,
      };
    }

    const { data, error } = await supabase.from('gifts').insert(rows).select('*');

    if (error) throw error;

    return {
      inserted: data || [],
      skipped,
      assets: importedAssets,
    };
  });
}
