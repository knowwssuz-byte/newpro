import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { telegramApi, getBotToken } from '@/lib/telegramBot';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 2;
const ART_PLACEHOLDER = '/gifts/telegram-collectible.svg';

function clean(value, max = 140) {
  return String(value ?? '').trim().slice(0, max);
}
function currencyAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(100000000, Math.floor(n)) : 0;
}
function slugForUnique(gift) {
  const name = clean(gift?.name, 80).replace(/[^a-z0-9_-]/gi, '');
  const number = Number(gift?.number);
  return name && Number.isSafeInteger(number) && number > 0 ? `${name}-${number}` : '';
}
function parseOwnedItem(item, pageIndex) {
  const gift = item?.gift;
  if (!gift || item?.was_refunded === true) return null;
  const type = item.type === 'unique' ? 'unique' : 'regular';
  const slug = type === 'unique' ? slugForUnique(gift) : '';
  const giftId = type === 'unique' ? clean(gift?.name, 80) : clean(gift?.id, 80);
  if (!giftId || (type === 'unique' && !slug)) return null;
  const name = type === 'unique'
    ? `${clean(gift.name, 80)} #${Number(gift.number)}`
    : `Telegram Gift · ${currencyAmount(gift.star_count)} Stars`;
  const fallbackKey = crypto.createHash('sha256').update(JSON.stringify([
    giftId, item.send_date || 0, item.sender_user?.id || 0,
    item.unique_gift_number || 0, pageIndex,
  ])).digest('hex').slice(0,40);
  const ownershipKey = clean(item.owned_gift_id, 140) ||
    (type === 'unique' ? `unique:${slug}` : `regular:${fallbackKey}`);
  const price = currencyAmount(gift.star_count || gift.resale_star_count);
  return {
    ownership_key: ownershipKey,
    gift_type: type,
    telegram_gift_id: giftId,
    title: name,
    gift_slug: slug || null,
    star_count: price,
    transferable: Boolean(item.can_be_transferred) && type === 'unique',
    transfer_cost: currencyAmount(item.transfer_star_count),
    refunded: false,
    library_slug: type === 'unique' ? slug : `regular-${giftId}`,
    source_url: type === 'unique' ? `https://t.me/nft/${slug}` : `telegram:catalog:${giftId}`,
    model_name: type === 'unique' ? clean(gift.model?.name, 100) : '',
    symbol_name: type === 'unique' ? clean(gift.symbol?.name, 100) : '',
    backdrop_name: type === 'unique' ? clean(gift.backdrop?.name, 100) : '',
    thumbnail_file_id: clean((type === 'unique' ? gift.model?.sticker : gift.sticker)?.thumbnail?.file_id, 250),
  };
}

/**
 * Import one to three pages from an authenticated Telegram admin's account.
 * A catalog listing does not grant a prize stock. Ownership is recorded
 * separately, and potentially hosted/non-transferable items are never
 * auto-listed as sendable prizes.
 */
async function downloadTelegramGiftThumbnail(supabase, item) {
  if (!item.thumbnail_file_id) return null;
  const file = await telegramApi('getFile', { file_id: item.thumbnail_file_id },
    { timeoutMs: 7000 });
  const path = String(file?.file_path || '');
  if (!path || !/^[a-z0-9/_-]+\.(webp|jpg|jpeg|png)$/i.test(path) ||
      Number(file.file_size || 0) > 4_000_000) return null;
  const extension = path.split('.').pop().toLowerCase();
  const mime = extension === 'webp' ? 'image/webp' :
    extension === 'png' ? 'image/png' : 'image/jpeg';
  const url = `https://api.telegram.org/file/bot${getBotToken()}/${path}`;
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(9000) });
  if (!response.ok) return null;
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 4_000_000) return null;
  const cleanSlug = item.library_slug.replace(/[^a-z0-9_-]/gi,'').slice(0,100);
  const storagePath = `telegram/owner-previews/${cleanSlug}.${extension}`;
  const { error } = await supabase.storage.from('gift-assets').upload(storagePath, data,
    { contentType: mime, upsert: true, cacheControl: '86400' });
  if (error) throw error;
  return supabase.storage.from('gift-assets').getPublicUrl(storagePath).data.publicUrl;
}

export async function syncOwnedTelegramGifts(userId, { reset = false, maxPages = MAX_PAGES_PER_RUN } = {}) {
  const owner = Number(userId);
  if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error('Telegram user ID xato.');
  const supabase = getSupabaseAdmin();
  const key = `tg_owned_sync_${owner}`;
  const { data: saved, error: savedError } = await supabase.from('app_settings')
    .select('value').eq('key', key).maybeSingle();
  if (savedError) throw savedError;
  let offset = reset ? '' : String(saved?.value?.nextOffset || '');
  let processed = 0, inserted = 0, pages = 0, reportedTotal = null;
  const max = Math.min(5, Math.max(1, Math.floor(Number(maxPages) || MAX_PAGES_PER_RUN)));
  for (; pages < max; pages += 1) {
    const owned = await telegramApi('getUserGifts', {
      user_id: owner, offset, limit: PAGE_SIZE,
    }, { timeoutMs: 14000 });
    if (!owned || !Array.isArray(owned.gifts)) throw new Error('Telegram giftlar ro‘yxatini qaytarmadi.');
    reportedTotal = owned.total_count || 0;
    const parsed = owned.gifts.map((item, index) => parseOwnedItem(item, index)).filter(Boolean);
    const slugs = [...new Set(parsed.map((x) => x.library_slug))];
    const { data: existing, error: queryError } = await supabase.from('gift_library')
      .select('id,slug').in('slug', slugs.length ? slugs : ['NO_MATCH']);
    if (queryError) throw queryError;
    const existingSet = new Set((existing || []).map((row) => row.slug));
    const missing = [...new Map(parsed.filter((x) => !existingSet.has(x.library_slug))
      .map((x) => [x.library_slug, x])).values()];
    if (missing.length) {
      const rows = missing.map((item) => ({
        title: item.title, slug: item.library_slug,
        source_url: item.source_url, price: item.star_count, buy_price: item.star_count,
        image_url: ART_PLACEHOLDER, image_type: 'png',
        webp_url: '', png_url: '', animation_url: '',
        background_value: 'linear-gradient(135deg,#3f306e,#11172e)',
        is_active: true, model_name: item.model_name,
        symbol_name: item.symbol_name, backdrop_name: item.backdrop_name,
      }));
      const { error: createError } = await supabase.from('gift_library').insert(rows);
      if (createError?.code !== '23505' && createError) throw createError;
      inserted += missing.length;
    }
    const { data: library, error: libError } = await supabase.from('gift_library')
      .select('id,slug').in('slug', slugs.length ? slugs : ['NO_MATCH']);
    if (libError) throw libError;
    const bySlug = new Map((library || []).map((row) => [row.slug, row.id]));
    // Download a few real sticker thumbnails per run. No Telegram bot token is
    // ever exposed to the browser or embedded into public asset URLs.
    await Promise.allSettled(parsed.filter((x) => x.thumbnail_file_id).slice(0, 8).map(async (item) => {
      try {
        const giftLibraryId = bySlug.get(item.library_slug);
        if (!giftLibraryId) return;
        const { data: existingVisual } = await supabase.from('gift_library')
          .select('image_url').eq('id', giftLibraryId).maybeSingle();
        if (!existingVisual?.image_url || existingVisual.image_url === ART_PLACEHOLDER) {
          const imageUrl = await downloadTelegramGiftThumbnail(supabase, item);
          if (imageUrl) {
            await supabase.from('gift_library').update({
              image_url: imageUrl, image_type: imageUrl.endsWith('.webp') ? 'webp' : 'png',
            }).eq('id', giftLibraryId);
          }
        }
      } catch (error) {
        console.warn('[gift-sync:thumbnail]', error?.message || error);
      }
    }));
    const now = new Date().toISOString();
    const rows = parsed.map((x) => ({
      owner_user_id: owner, ownership_key: x.ownership_key,
      gift_type: x.gift_type, telegram_gift_id: x.telegram_gift_id,
      title: x.title, gift_slug: x.gift_slug, star_count: x.star_count,
      transferable: x.transferable, transfer_cost: x.transfer_cost,
      refunded: x.refunded, linked_library_id: bySlug.get(x.library_slug) || null,
      seen_at: now,
    }));
    if (rows.length) {
      const { error: copyError } = await supabase.from('telegram_owned_gift_inventory')
        .upsert(rows, { onConflict: 'owner_user_id,ownership_key' });
      if (copyError) throw copyError;
    }
    processed += parsed.length;
    const next = String(owned.next_offset || '');
    if (!next || next === offset) {
      offset = ''; pages += 1; break;
    }
    offset = next;
  }
  const complete = offset === '';
  const { error: writeError } = await supabase.from('app_settings')
    .upsert({ key, value: { ownerId: owner, nextOffset: offset,
      reportedTotal, processedLastRun: processed, completed: complete,
      syncedAt: new Date().toISOString() } }, { onConflict: 'key' });
  if (writeError) throw writeError;
  const { count, error: countError } = await supabase.from('telegram_owned_gift_inventory')
    .select('ownership_key', { count: 'exact', head: true }).eq('owner_user_id', owner);
  if (countError) throw countError;
  return {
    ok: true, ownerId: owner, imported: processed, newLibraryItems: inserted,
    tracked: Number(count || 0), telegramReported: reportedTotal,
    pages, complete, hasMore: !complete,
  };
}
