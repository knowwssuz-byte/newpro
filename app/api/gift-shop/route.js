import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureUser, jsonError, readTelegramRequest } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function explainPurchaseError(error) {
  const reason = String(error?.message || '');
  if (reason.includes('INSUFFICIENT_BALANCE')) return ['Balansingizda Stars yetarli emas.', 409];
  if (reason.includes('SHOP_GIFT_SOLD_OUT')) return ['Bu gift tugagan. Boshqasini tanlang.', 409];
  if (reason.includes('SHOP_GIFT_UNAVAILABLE')) return ['Bu gift hozir sotuvda emas.', 409];
  if (reason.includes('SHOP_PRICE_CHANGED')) return ['Narx o‘zgardi. Do‘konni yangilab qayta tekshiring.', 409];
  if (reason.includes('USER_BANNED')) return ['Akkaunt bloklangan.', 403];
  if (reason.includes('REQUEST_REUSED')) return ['Xarid identifikatori boshqa gift uchun ishlatilgan.', 409];
  if (reason.includes('INVALID_PURCHASE')) return ['Xarid ma’lumotlari noto‘g‘ri.', 400];
  if (error?.code === 'PGRST202' || error?.code === '42P01') return ['Gift Shop migratsiyasi hali o‘rnatilmagan.', 503];
  console.error('[gift-shop]', error?.code || 'database_error');
  return ['Xaridni yakunlab bo‘lmadi. Qayta tekshiring.', 500];
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const action = String(auth.body?.action || 'list');
    if (action !== 'list' && action !== 'buy') return jsonError('Noma’lum action.', 400);
    const supabase = getSupabaseAdmin();
    const user = await ensureUser(auth.telegramUser);
    if (user.is_banned) return jsonError('Akkaunt bloklangan.', 403);

    if (action === 'list') {
      const { data, error } = await supabase.from('gift_shop_items')
        .select('id,library_gift_id,price,stock,is_active,created_at,gift_library(id,title,image_url,png_url,webp_url,animation_url,background_value,is_active)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) {
        const [message, status] = explainPurchaseError(error);
        return jsonError(message, status);
      }
      const offers = (data || [])
        .filter((row) => row.gift_library?.is_active !== false)
        .map((row) => ({
          id: row.id,
          title: row.gift_library?.title || 'Telegram Gift',
          price: Number(row.price),
          stock: Number(row.stock),
          image_url: row.gift_library?.image_url || row.gift_library?.png_url || row.gift_library?.webp_url || '/gifts/telegram-collectible.svg',
          animation_url: row.gift_library?.animation_url || '',
          background_value: row.gift_library?.background_value || '',
        }));
      return Response.json({ ok: true, offers, balance: Number(user.balance) }, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const { shopItemId, requestId, expectedPrice } = auth.body || {};
    if (!UUID.test(String(shopItemId || '')) || !UUID.test(String(requestId || ''))) {
      return jsonError('Gift yoki xarid ID noto‘g‘ri.', 400);
    }
    if (!Number.isSafeInteger(expectedPrice) || expectedPrice < 1 || expectedPrice > 1000000000) {
      return jsonError('Narx noto‘g‘ri.', 400);
    }

    const { data, error } = await supabase.rpc('newpro_gift_shop_buy', {
      p_user_id: Number(auth.telegramUser.id),
      p_shop_item_id: shopItemId,
      p_request_id: requestId,
      p_expected_price: expectedPrice,
    });
    if (error) {
      const [message, status] = explainPurchaseError(error);
      return jsonError(message, status);
    }

    return Response.json({ ok: true, purchase: data }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[gift-shop]', error?.code || 'unexpected_failure');
    return jsonError('Gift Shop xizmati vaqtincha ishlamayapti.', 500);
  }
}
