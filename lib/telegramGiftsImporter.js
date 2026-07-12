import crypto from 'crypto';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { gunzipSync } from 'zlib';

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

function resolveFloorPrice(gift = {}) {
  const candidates = [
    ['resell_min_stars', gift.resellMinStars ?? gift.resell_min_stars],
    ['availability_resale', gift.availabilityResale ?? gift.availability_resale],
    ['floor_price', gift.floorPrice ?? gift.floor_price],
    ['min_resale_stars', gift.minResaleStars ?? gift.min_resale_stars],
    ['resale_stars', gift.resaleStars ?? gift.resale_stars ?? gift.resellStars ?? gift.resell_stars],
  ];

  for (const [source, value] of candidates) {
    const number = toNumber(value, 0);

    if (number > 0) {
      return {
        floorPrice: number,
        source,
      };
    }
  }

  return {
    floorPrice: 0,
    source: 'none',
  };
}

function hasCollectibleSignal(gift = {}) {
  const floor = resolveFloorPrice(gift).floorPrice;
  const upgradeStars = toNumber(gift?.upgradeStars ?? gift?.upgrade_stars, 0);
  const upgradeVariants = toNumber(gift?.upgradeVariants ?? gift?.upgrade_variants, 0);
  const auctionSlug = clean(gift?.auctionSlug ?? gift?.auction_slug);
  const availabilityResale = toNumber(gift?.availabilityResale ?? gift?.availability_resale, 0);

  return floor > 0 || availabilityResale > 0 || upgradeStars > 0 || upgradeVariants > 0 || Boolean(auctionSlug);
}

function shouldUseCatalogGift(gift = {}) {
  // getStarGifts Telegram'ning oddiy yuboriladigan sovg'alarini ham qaytaradi.
  // Catalog uchun faqat collectible/NFTga aylanishi yoki resale/floor signali borlarini qoldiramiz.
  return hasCollectibleSignal(gift);
}

function hasGiftAsset(assets = {}) {
  return Boolean(assets?.image?.publicUrl || assets?.animation?.publicUrl);
}

async function cleanupPendingCatalogRows(supabase) {
  const { data, error } = await supabase
    .from('telegram_gift_catalog')
    .delete()
    .or('status.eq.pending,and(image_url.eq.,animation_url.eq.)')
    .select('id');

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }

  return Array.isArray(data) ? data.length : 0;
}

function validTitle(value, giftId = '') {
  const title = clean(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!title) return '';
  if (/^(undefined|null|none|unknown)$/i.test(title)) return '';
  if (giftId && title === giftId) return '';
  if (/^telegram\s+gift\s+\d+$/i.test(title)) return '';
  if (/^gift\s+\d+$/i.test(title)) return '';

  return title;
}

function stickerAttributes(document = {}) {
  return Array.isArray(document?.attributes) ? document.attributes : [];
}

function getStickerSetInput(document = {}) {
  const attr = stickerAttributes(document).find((item) => item?.stickerset || item?.stickerSet || item?.stickerset_);
  return attr?.stickerset || attr?.stickerSet || attr?.stickerset_ || null;
}

function stickerEmoji(document = {}) {
  const attr = stickerAttributes(document).find((item) => item?.alt || item?.emoji || item?.emoticon);
  return clean(attr?.alt || attr?.emoji || attr?.emoticon || '');
}

function stickerSetCacheKey(input) {
  if (!input) return '';
  return [
    input.className || input._ || 'InputStickerSet',
    toLongString(input.id),
    toLongString(input.accessHash ?? input.access_hash),
    clean(input.shortName || input.short_name),
  ].filter(Boolean).join(':');
}

async function getStickerSetTitle(client, document, cache) {
  const stickerSet = getStickerSetInput(document);
  const key = stickerSetCacheKey(stickerSet);

  if (!stickerSet || !key) return '';
  if (cache.has(key)) return cache.get(key);

  let title = '';

  try {
    if (Api?.messages?.GetStickerSet) {
      const result = await client.invoke(new Api.messages.GetStickerSet({
        stickerset: stickerSet,
        hash: 0,
      }));

      const set = result?.set || result?.sets?.[0] || null;
      title = validTitle(set?.title || set?.shortName || set?.short_name || '', '');
    }
  } catch (error) {
    // Sticker set title olinmasa ham import davom etsin.
    console.warn('[telegram-gifts] sticker set title failed:', error?.message || error);
  }

  cache.set(key, title);
  return title;
}

function directGiftTitleCandidates(gift = {}) {
  const candidates = [
    gift.title,
    gift.name,
    gift.slug,
    gift.shortName,
    gift.short_name,
    gift.giftTitle,
    gift.gift_title,
    gift.displayTitle,
    gift.display_title,
  ];

  const attributes = Array.isArray(gift.attributes) ? gift.attributes : [];

  for (const attr of attributes) {
    candidates.push(
      attr?.title,
      attr?.name,
      attr?.value,
      attr?.model,
      attr?.symbol,
      attr?.pattern,
      attr?.backdrop?.name,
      attr?.backdrop?.title,
    );
  }

  return candidates;
}

async function resolveGiftTitle(client, gift = {}, id = '', stickerSetCache = new Map()) {
  for (const candidate of directGiftTitleCandidates(gift)) {
    const title = validTitle(candidate, id);
    if (title) return title;
  }

  const document = gift?.sticker || null;
  const stickerTitle = await getStickerSetTitle(client, document, stickerSetCache);

  if (validTitle(stickerTitle, id)) return stickerTitle;

  const stars = toLongString(gift?.stars);
  const emoji = stickerEmoji(document) || '🎁';

  if (stars) return `${emoji} Gift · ${stars} Stars`;

  return `${emoji} Telegram Gift`;
}

async function normalizeStarGift(client, gift, stickerSetCache = new Map()) {
  const id = toLongString(gift?.id);
  const title = await resolveGiftTitle(client, gift, id, stickerSetCache);
  const stars = toLongString(gift?.stars);
  const starCount = toNumber(stars, 0);
  const floor = resolveFloorPrice(gift);
  const convertStars = toLongString(gift?.convertStars ?? gift?.convert_stars);
  const upgradeStars = toLongString(gift?.upgradeStars ?? gift?.upgrade_stars);
  const availabilityRemains = gift?.availabilityRemains ?? gift?.availability_remains ?? null;
  const availabilityTotal = gift?.availabilityTotal ?? gift?.availability_total ?? null;
  const background = resolveBackground(gift?.background || null);
  const sticker = gift?.sticker || null;
  const stickerMimeType = sticker ? contentTypeFromDocument(sticker, '') : '';
  const stickerExt = sticker ? extensionFromDocument(sticker, '') : '';
  const emoji = stickerEmoji(sticker);
  const stickerSetTitle = sticker ? await getStickerSetTitle(client, sticker, stickerSetCache) : '';
  const collectionKey = collectionKeyFromGift({
    ...gift,
    title,
    stickerSetTitle,
    auctionSlug: gift?.auctionSlug ?? gift?.auction_slug ?? '',
  });
  const dropName = collectionNameFromGift({
    ...gift,
    title,
    stickerSetTitle,
  });

  const publicGift = safeJson({
    id,
    telegramGiftId: id,
    title,
    collectionKey,
    dropName,
    emoji,
    stickerSetTitle,
    stars,
    starCount,
    floorPrice: floor.floorPrice,
    floorPriceSource: floor.source,
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
    resellMinStars: gift?.resellMinStars ?? gift?.resell_min_stars ?? null,
    availabilityResale: gift?.availabilityResale ?? gift?.availability_resale ?? null,
    auctionSlug: gift?.auctionSlug ?? gift?.auction_slug ?? '',
    catalogEligible: shouldUseCatalogGift(gift),
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
          emoji,
          stickerSetTitle,
          thumbsCount: Array.isArray(sticker.thumbs) ? sticker.thumbs.length : 0,
        }
      : null,
  });

  // Muhim: _raw va _stickerDocument safeJson ichida bo'lmasligi kerak.
  // Aks holda GramJS document oddiy objectga aylanib qoladi va client.downloadMedia ishlamaydi.
  return {
    ...publicGift,
    _raw: gift,
    _stickerDocument: sticker,
  };
}

async function downloadStickerThumbnail(client, document) {
  if (!document) return null;

  const thumbs = Array.isArray(document.thumbs) ? document.thumbs : [];
  const attempts = [];

  if (thumbs.length) attempts.push(thumbs[thumbs.length - 1]);
  if (thumbs.length > 1) attempts.push(thumbs[0]);
  attempts.push(undefined);

  for (const thumb of attempts) {
    try {
      const options = { workers: 1 };

      if (thumb !== undefined) {
        options.thumb = thumb;
      }

      const buffer = await client.downloadMedia(document, options);

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


function uniqueValues(values = []) {
  return Array.from(new Set(values.map((value) => clean(value)).filter(Boolean)));
}

function storageContentTypeCandidates(contentType = '', ext = '') {
  const cleanType = clean(contentType).toLowerCase();
  const cleanExt = clean(ext).toLowerCase();

  if (cleanExt === 'tgs' || cleanType.includes('tgsticker')) {
    return uniqueValues([
      cleanType,
      'application/x-tgsticker',
      'application/gzip',
      'application/octet-stream',
    ]);
  }

  if (cleanExt === 'webp') return uniqueValues([cleanType, 'image/webp']);
  if (cleanExt === 'png') return uniqueValues([cleanType, 'image/png']);
  if (cleanExt === 'jpg' || cleanExt === 'jpeg') return uniqueValues([cleanType, 'image/jpeg']);
  if (cleanExt === 'webm') return uniqueValues([cleanType, 'video/webm']);
  if (cleanExt === 'mp4') return uniqueValues([cleanType, 'video/mp4']);

  return uniqueValues([cleanType, 'application/octet-stream']);
}

function isMimeTypeStorageError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return text.includes('mime type') || text.includes('mimetype') || text.includes('not supported');
}

async function uploadAsset(supabase, { buffer, contentType, folder, ext, prefix }) {
  if (!buffer || !Buffer.byteLength(buffer)) return null;

  const bucket = process.env.SUPABASE_GIFT_ASSETS_BUCKET || DEFAULT_BUCKET;
  const safeExt = clean(ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const safeFolder = clean(folder || 'telegram').replace(/[^a-z0-9/_-]/gi, '-').toLowerCase();
  const contentTypeCandidates = storageContentTypeCandidates(contentType, safeExt);
  let lastError = null;

  for (const candidateContentType of contentTypeCandidates) {
    const filePath = `${safeFolder}/${Date.now()}-${prefix || 'gift'}-${crypto.randomUUID()}.${safeExt}`;

    const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType: candidateContentType || 'application/octet-stream',
      cacheControl: '31536000',
      upsert: false,
    });

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

      return {
        path: filePath,
        publicUrl: data?.publicUrl || '',
        contentType: candidateContentType,
        size: Buffer.byteLength(buffer),
      };
    }

    lastError = error;

    if (!isMimeTypeStorageError(error)) {
      break;
    }
  }

  throw new Error(
    `Supabase Storage upload xatosi: ${lastError?.message || 'unknown error'}. ` +
    `Bucket allowed_mime_types ichiga .tgs uchun application/x-tgsticker, application/gzip va application/octet-stream qo‘shilganini tekshiring.`
  );
}

async function downloadAndUploadGiftAssets(client, supabase, gift) {
  const document = gift?._stickerDocument || gift?._raw?.sticker || null;
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
  const isImage = mimeType.startsWith('image/');
  const isAnimation = mimeType.startsWith('video/') || mimeType.includes('tgsticker') || mimeType.includes('gzip') || ext === 'tgs';

  if (isImage || isAnimation) {
    const full = await downloadStickerFull(client, document);

    if (full && Buffer.byteLength(full) <= maxBytes) {
      const uploaded = await uploadAsset(supabase, {
        buffer: full,
        contentType: mimeType,
        folder: isAnimation ? 'telegram/animations' : 'telegram/images',
        ext: isAnimation && !ext ? 'tgs' : ext,
        prefix,
      });

      if (isAnimation) {
        assets.animation = uploaded;
      } else {
        assets.image = assets.image || uploaded;
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
    const stickerSetCache = new Map();
    const normalized = [];

    for (const gift of gifts.slice(0, Math.max(1, Number(limit || DEFAULT_LIMIT)))) {
      const normalizedGift = await normalizeStarGift(client, gift, stickerSetCache);
      if (normalizedGift.telegramGiftId) {
        const { _raw, ...publicGift } = normalizedGift;
        normalized.push(publicGift);
      }
    }

    return normalized;
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
    const stickerSetCache = new Map();
    const allGifts = [];

    for (const rawGift of Array.isArray(result?.gifts) ? result.gifts : []) {
      allGifts.push(await normalizeStarGift(client, rawGift, stickerSetCache));
    }

    const selected = allGifts.filter((gift) => giftIds.has(gift.telegramGiftId));

    if (!selected.length) {
      throw new Error('Tanlangan giftlar Telegram ro‘yxatidan topilmadi. Refresh qilib qayta urinib ko‘ring.');
    }

    let existingByValue = new Map();

    if (skipExisting) {
      const { data: existing, error: existingError } = await supabase
        .from('gifts')
        .select('id,value,title,image_url,animation_url,background_value')
        .eq('case_id', caseId)
        .in('value', selected.map((gift) => gift.telegramGiftId));

      if (existingError) throw existingError;
      existingByValue = new Map((existing || []).map((item) => [clean(item.value), item]));
    }

    const rows = [];
    const repaired = [];
    const importedAssets = [];
    const skipped = [];

    for (const gift of selected) {
      const existingGift = existingByValue.get(gift.telegramGiftId);
      const assets = await downloadAndUploadGiftAssets(client, supabase, gift);
      importedAssets.push({ id: gift.telegramGiftId, title: gift.title, assets });

      const limitedStock = Number(gift.availabilityRemains || 0);
      const resolvedStock = limitedStock > 0 ? Math.min(limitedStock, defaultStock || limitedStock) : defaultStock;
      const backgroundValue = gift.background?.cssGradient || 'linear-gradient(135deg,#7c3aed 0%,#111827 100%)';

      if (existingGift) {
        const updates = {
          title: gift.title,
          image_url: existingGift.image_url || assets.image?.publicUrl || '',
          animation_url: existingGift.animation_url || assets.animation?.publicUrl || '',
          background_value: existingGift.background_value || backgroundValue,
          rarity,
          is_active: isActive,
        };

        const { data: updated, error: updateError } = await supabase
          .from('gifts')
          .update(updates)
          .eq('id', existingGift.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        repaired.push(updated);
        continue;
      }

      rows.push({
        case_id: caseId,
        title: gift.title,
        type: 'gift',
        value: gift.telegramGiftId,
        chance: defaultChance,
        stock: resolvedStock,
        image_url: assets.image?.publicUrl || '',
        animation_url: assets.animation?.publicUrl || '',
        background_value: backgroundValue,
        rarity,
        is_active: isActive,
      });
    }

    if (!rows.length) {
      return {
        inserted: [],
        repaired,
        skipped,
        assets: importedAssets,
      };
    }

    const { data, error } = await supabase.from('gifts').insert(rows).select('*');

    if (error) throw error;

    return {
      inserted: data || [],
      repaired,
      skipped,
      assets: importedAssets,
    };
  });
}

function catalogRowFromGift(gift, existing = {}, assets = {}) {
  const imageUrl = existing?.image_url || assets?.image?.publicUrl || '';
  const animationUrl = existing?.animation_url || assets?.animation?.publicUrl || '';
  const floorPrice = toNumber(gift.floorPrice, 0);
  const starCount = toNumber(gift.starCount || gift.stars, 0);
  const backgroundValue = gift.background?.cssGradient || existing?.background_value || 'linear-gradient(135deg,#7c3aed 0%,#111827 100%)';

  return {
    telegram_gift_id: gift.telegramGiftId,
    collection_key: gift.collectionKey || collectionKeyFromGift(gift),
    drop_name: gift.dropName || collectionNameFromGift(gift),
    title: validTitle(gift.title, gift.telegramGiftId) || gift.dropName || `Telegram Gift ${gift.telegramGiftId}`,
    floor_price: floorPrice,
    star_count: starCount,
    image_url: imageUrl,
    animation_url: animationUrl,
    background_value: backgroundValue,
    rarity: existing?.rarity || 'legendary',
    status: imageUrl || animationUrl ? 'ready' : 'pending',
    emoji: gift.emoji || '',
    sticker_set_title: gift.stickerSetTitle || '',
    availability_remains: gift.availabilityRemains ?? null,
    availability_total: gift.availabilityTotal ?? null,
    raw: {
      telegramGiftId: gift.telegramGiftId,
      collectionKey: gift.collectionKey || collectionKeyFromGift(gift),
      dropName: gift.dropName || collectionNameFromGift(gift),
      stars: gift.stars,
      starCount,
      floorPrice,
      floorPriceSource: gift.floorPriceSource || 'stars',
      convertStars: gift.convertStars,
      upgradeStars: gift.upgradeStars,
      resellMinStars: gift.resellMinStars ?? null,
      availabilityResale: gift.availabilityResale ?? null,
      auctionSlug: gift.auctionSlug || '',
      catalogEligible: Boolean(gift.catalogEligible),
      limited: gift.limited,
      soldOut: gift.soldOut,
      requirePremium: gift.requirePremium,
      background: gift.background || null,
      sticker: gift.sticker || null,
      firstSaleDate: gift.firstSaleDate ?? null,
      lastSaleDate: gift.lastSaleDate ?? null,
    },
    synced_at: new Date().toISOString(),
  };
}

function catalogSelectColumns() {
  return [
    'id',
    'telegram_gift_id',
    'collection_key',
    'drop_name',
    'title',
    'floor_price',
    'star_count',
    'image_url',
    'animation_url',
    'background_value',
    'rarity',
    'status',
    'emoji',
    'sticker_set_title',
    'availability_remains',
    'availability_total',
    'raw',
    'synced_at',
    'created_at',
    'updated_at',
  ].join(',');
}

function tableMissingError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

  return text.includes('telegram_gift_catalog') || text.includes('relation') || error?.code === '42P01';
}

export async function listTelegramGiftCatalog(supabase, { limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('telegram_gift_catalog')
    .select(catalogSelectColumns())
    .order('floor_price', { ascending: true })
    .limit(Math.max(1, Number(limit || 500)));

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }

  return data || [];
}

async function readExistingCatalogMap(supabase, ids = []) {
  const cleanIds = ids.map((id) => clean(id)).filter(Boolean);

  if (!cleanIds.length) return new Map();

  const { data, error } = await supabase
    .from('telegram_gift_catalog')
    .select(catalogSelectColumns())
    .in('telegram_gift_id', cleanIds);

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }

  return new Map((data || []).map((item) => [clean(item.telegram_gift_id), item]));
}


function normalizeCollectionText(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/telegram\s+gift\s+\d+/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function collectionNameFromGift(gift = {}) {
  return (
    clean(gift.dropName) ||
    clean(gift.collectionTitle) ||
    clean(gift.stickerSetTitle) ||
    clean(gift.title) ||
    `Gift ${gift.telegramGiftId || gift.id || ''}`
  );
}

function collectionKeyFromGift(gift = {}) {
  const explicit = clean(gift.collectionKey || gift.collection_key || gift.auctionSlug || gift.auction_slug);

  if (explicit) return normalizeCollectionText(explicit);

  const fromTitle = normalizeCollectionText(collectionNameFromGift(gift));

  if (fromTitle) return fromTitle;

  return clean(gift.telegramGiftId || gift.id || crypto.createHash('sha1').update(JSON.stringify(gift)).digest('hex').slice(0, 16));
}

function representativeScore(gift = {}) {
  const floor = toNumber(gift.floorPrice, 0);
  const stars = toNumber(gift.starCount || gift.stars, 0);
  const hasFloor = floor > 0 ? 0 : 1;
  const hasTitle = validTitle(gift.title, gift.telegramGiftId) ? 0 : 1;

  // Har bir collection/dropdan bitta representative: avval floor borlari,
  // keyin eng past floor, keyin nomi yaxshi chiqadigan item.
  return [hasFloor, floor || Number.MAX_SAFE_INTEGER, hasTitle, stars || Number.MAX_SAFE_INTEGER];
}

function compareScore(a = [], b = []) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? Number.MAX_SAFE_INTEGER;
    const right = b[i] ?? Number.MAX_SAFE_INTEGER;

    if (left < right) return -1;
    if (left > right) return 1;
  }

  return 0;
}

function oneGiftPerCollection(gifts = []) {
  const map = new Map();

  for (const gift of gifts) {
    const collectionKey = collectionKeyFromGift(gift);
    const dropName = collectionNameFromGift(gift);
    const prepared = {
      ...gift,
      collectionKey,
      dropName,
    };

    const existing = map.get(collectionKey);

    if (!existing || compareScore(representativeScore(prepared), representativeScore(existing)) < 0) {
      map.set(collectionKey, prepared);
    }
  }

  return Array.from(map.values()).sort((a, b) => collectionNameFromGift(a).localeCompare(collectionNameFromGift(b)));
}

async function readExistingCatalogMaps(supabase) {
  const { data, error } = await supabase
    .from('telegram_gift_catalog')
    .select(catalogSelectColumns());

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }

  const byTelegramId = new Map();
  const byCollectionKey = new Map();

  for (const item of data || []) {
    if (item.telegram_gift_id) byTelegramId.set(clean(item.telegram_gift_id), item);
    if (item.collection_key) byCollectionKey.set(clean(item.collection_key), item);
  }

  return { byTelegramId, byCollectionKey, all: data || [] };
}

async function replaceCatalogTable(supabase) {
  const { error } = await supabase
    .from('telegram_gift_catalog')
    .delete()
    .not('id', 'is', null);

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }
}

export async function syncTelegramGiftCatalog(supabase, options = {}) {
  const limit = Math.max(1, Number(options.limit || DEFAULT_LIMIT));
  const downloadAssets = options.downloadAssets !== false;
  const cleanupPending = options.cleanupPending !== false;
  const replaceCatalog = options.replaceCatalog !== false;

  return withTelegramClient(async (client) => {
    if (!Api?.payments?.GetStarGifts) {
      throw new Error('GramJS ichida payments.GetStarGifts topilmadi. telegram package yangilanishi kerak.');
    }

    const cleanedPending = cleanupPending ? await cleanupPendingCatalogRows(supabase) : 0;
    const existingMaps = await readExistingCatalogMaps(supabase);

    const result = await client.invoke(new Api.payments.GetStarGifts({ hash: 0 }));
    const rawGifts = Array.isArray(result?.gifts) ? result.gifts.slice(0, limit) : [];
    const stickerSetCache = new Map();
    const collectible = [];
    let skippedRegular = 0;

    for (const rawGift of rawGifts) {
      if (!shouldUseCatalogGift(rawGift)) {
        skippedRegular += 1;
        continue;
      }

      const gift = await normalizeStarGift(client, rawGift, stickerSetCache);

      if (gift.telegramGiftId && gift.catalogEligible) {
        collectible.push(gift);
      } else {
        skippedRegular += 1;
      }
    }

    const representatives = oneGiftPerCollection(collectible);
    const rows = [];
    const assets = [];
    let downloaded = 0;
    let reused = 0;
    let skippedMissingAssets = 0;

    for (const gift of representatives) {
      const existing =
        existingMaps.byCollectionKey.get(gift.collectionKey) ||
        existingMaps.byTelegramId.get(gift.telegramGiftId) ||
        {};

      let giftAssets = {
        image: existing.image_url ? { publicUrl: existing.image_url } : null,
        animation: existing.animation_url ? { publicUrl: existing.animation_url } : null,
      };

      if (downloadAssets && !hasGiftAsset(giftAssets)) {
        const downloadedAssets = await downloadAndUploadGiftAssets(client, supabase, gift);

        giftAssets = {
          image: giftAssets.image || downloadedAssets.image,
          animation: giftAssets.animation || downloadedAssets.animation,
        };

        if (downloadedAssets.image || downloadedAssets.animation) downloaded += 1;
      } else if (hasGiftAsset(giftAssets)) {
        reused += 1;
      }

      if (!hasGiftAsset(giftAssets)) {
        skippedMissingAssets += 1;
      }

      rows.push(catalogRowFromGift(gift, existing, giftAssets));
      assets.push({
        telegramGiftId: gift.telegramGiftId,
        collectionKey: gift.collectionKey,
        dropName: gift.dropName,
        title: gift.title,
        imageUrl: giftAssets.image?.publicUrl || '',
        animationUrl: giftAssets.animation?.publicUrl || '',
      });
    }

    if (replaceCatalog) {
      await replaceCatalogTable(supabase);
    }

    if (!rows.length) {
      return {
        synced: [],
        total: 0,
        collectionsFound: representatives.length,
        rawCollectible: collectible.length,
        downloaded,
        reused,
        cleaned: cleanedPending,
        skippedRegular,
        skippedMissingAssets,
        assets,
      };
    }

    const { data, error } = await supabase
      .from('telegram_gift_catalog')
      .upsert(rows, { onConflict: 'telegram_gift_id' })
      .select(catalogSelectColumns());

    if (error) {
      if (tableMissingError(error)) {
        throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
      }

      throw error;
    }

    return {
      synced: data || [],
      total: rows.length,
      collectionsFound: representatives.length,
      rawCollectible: collectible.length,
      downloaded,
      reused,
      cleaned: cleanedPending,
      skippedRegular,
      skippedMissingAssets,
      assets,
    };
  });
}

async function readCatalogGift(supabase, { catalogGiftId = '', telegramGiftId = '' } = {}) {
  let query = supabase.from('telegram_gift_catalog').select(catalogSelectColumns()).limit(1);

  if (catalogGiftId) {
    query = query.eq('id', catalogGiftId);
  } else if (telegramGiftId) {
    query = query.eq('telegram_gift_id', telegramGiftId);
  } else {
    throw new Error('Telegram catalog gift tanlanmagan.');
  }

  const { data, error } = await query.single();

  if (error) {
    if (tableMissingError(error)) {
      throw new Error('telegram_gift_catalog table topilmadi. Supabase SQL editor’da supabase/telegram-gift-catalog.sql faylini run qiling.');
    }

    throw error;
  }

  return data;
}

async function insertGiftWithOptionalColumns(supabase, row, optionalRow) {
  const fullRow = {
    ...row,
    ...optionalRow,
  };

  let { data, error } = await supabase.from('gifts').insert(fullRow).select('*').single();

  if (!error) return data;

  const errorText = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;

  if (
    errorText.includes('telegram_gift_id') ||
    errorText.includes('floor_price') ||
    errorText.includes('star_count') ||
    errorText.includes('catalog_id') ||
    errorText.includes('source')
  ) {
    const retry = await supabase.from('gifts').insert(row).select('*').single();

    if (retry.error) throw retry.error;

    return retry.data;
  }

  throw error;
}

export async function createGiftFromCatalog(supabase, options = {}) {
  const caseId = clean(options.caseId || options.case_id);
  const catalogGiftId = clean(options.catalogGiftId || options.catalog_gift_id);
  const telegramGiftId = clean(options.telegramGiftId || options.telegram_gift_id);
  const chance = Math.max(0, toNumber(options.chance, 10));
  const stock = Math.max(0, Math.floor(toNumber(options.stock, 1)));
  const rarity = clean(options.rarity || 'legendary');
  const isActive = options.isActive !== false;
  const catalogGift = await readCatalogGift(supabase, { catalogGiftId, telegramGiftId });

  if (!caseId) {
    throw new Error('Case tanlanmagan.');
  }

  const title = validTitle(options.title, catalogGift.telegram_gift_id) || catalogGift.title || catalogGift.drop_name;
  const floorPrice = Math.max(0, toNumber(options.floorPrice ?? options.floor_price ?? catalogGift.floor_price, 0));
  const starCount = Math.max(0, toNumber(catalogGift.star_count, 0));

  const baseRow = {
    case_id: caseId,
    title,
    type: 'gift',
    value: catalogGift.telegram_gift_id,
    chance,
    stock,
    image_url: catalogGift.image_url || '',
    animation_url: catalogGift.animation_url || '',
    background_value: catalogGift.background_value || 'linear-gradient(135deg,#7c3aed 0%,#111827 100%)',
    rarity,
    is_active: isActive,
  };

  const optionalRow = {
    telegram_gift_id: catalogGift.telegram_gift_id,
    floor_price: floorPrice,
    star_count: starCount,
    catalog_id: catalogGift.id,
    source: 'telegram_catalog',
  };

  return insertGiftWithOptionalColumns(supabase, baseRow, optionalRow);
}

export async function fetchUniqueTelegramGift(slug) {
  const cleanSlug = clean(slug);
  if (!/^[a-z0-9_-]{3,128}$/i.test(cleanSlug)) throw new Error('Telegram NFT slug noto‘g‘ri.');
  return withTelegramClient(async (client) => {
    const response = await client.invoke(new Api.payments.GetUniqueStarGift({ slug: cleanSlug }));
    const gift = response?.gift || response?.starGift || response?.star_gift || response;
    const attributes = Array.isArray(gift?.attributes) ? gift.attributes : [];
    const findAttribute = (part) => attributes.find((item) => clean(item?.className || item?.class_name || item?._).toLowerCase().includes(part));
    const model = findAttribute('model');
    const symbol = findAttribute('pattern');
    const backdrop = findAttribute('backdrop');
    const downloadLottie = async (attribute) => {
      const document = attribute?.document || attribute?.sticker || null;
      if (!document) return null;
      const bytes = await client.downloadMedia(document, {});
      if (!bytes?.length) return null;
      let jsonBuffer = Buffer.from(bytes);
      try { jsonBuffer = gunzipSync(jsonBuffer); } catch { /* JSON allaqachon ochilgan bo‘lishi mumkin */ }
      const parsed = JSON.parse(jsonBuffer.toString('utf8'));
      if (!parsed || !Array.isArray(parsed.layers)) throw new Error('Telegram Lottie fayli yaroqsiz.');
      return parsed;
    };
    const modelLottie = await downloadLottie(model);
    if (!modelLottie) throw new Error('Telegram gift model animatsiyasi topilmadi.');
    return {
      name: clean(gift?.title || gift?.name || cleanSlug.replace(/[-_]\d+$/, '').replace(/[-_]+/g, ' ')),
      num: toNumber(gift?.num ?? gift?.number, 0) || null,
      total: toNumber(gift?.availabilityTotal ?? gift?.availability_total, 0) || null,
      model: { name: clean(model?.name || model?.title || 'Animated model'), lottie: modelLottie },
      symbol: { name: clean(symbol?.name || symbol?.title || 'Telegram symbol'), lottie: null },
      backdrop: {
        name: clean(backdrop?.name || backdrop?.title || 'Telegram backdrop'),
        centerColor: rgb24ToHex(backdrop?.centerColor ?? backdrop?.center_color, '#7c3aed'),
        edgeColor: rgb24ToHex(backdrop?.edgeColor ?? backdrop?.edge_color, '#111827'),
      },
    };
  });
}
