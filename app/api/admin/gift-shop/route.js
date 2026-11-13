import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { assertAdminSession } from '@/lib/security/adminSession';
import { guardRequest } from '@/lib/security/rateLimit';
import { HttpError, readJson, securityError } from '@/lib/security/http.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function catalog(supabase) {
  const [library, items] = await Promise.all([
    supabase.from('gift_library')
      .select('id,title,price,buy_price,image_url,png_url,webp_url,animation_url,background_value,is_active')
      .eq('is_active',true).order('title', { ascending: true }),
    supabase.from('gift_shop_items')
      .select('id,library_gift_id,price,stock,is_active,created_at,gift_library(title,image_url,png_url,webp_url,animation_url,background_value)')
      .order('created_at', { ascending: false }),
  ]);
  if (library.error) throw library.error;
  if (items.error) throw items.error;
  return { library: library.data || [], items: items.data || [] };
}

export async function POST(request) {
  try {
    await guardRequest(request, { sameOrigin: true, scope: 'admin-gift-shop', limit: 120 });
    await assertAdminSession(request);
    const body = await readJson(request, 16 * 1024);
    const action = String(body.action || 'list');
    const supabase = getSupabaseAdmin();

    if (action === 'list') return respond({ ok: true, ...(await catalog(supabase)) });

    if (action === 'save') {
      const { libraryGiftId } = body;
      const price = Number(body.price);
      const stock = Number(body.stock);
      if (!UUID.test(String(libraryGiftId || ''))) return respond({ ok: false, error: 'Gift tanlang.' }, 400);
      if (!Number.isSafeInteger(price) || price <= 0 || price > 1000000000) {
        return respond({ ok: false, error: 'Narx 1–1 000 000 000 Stars orasida bo‘lsin.' }, 400);
      }
      if (!Number.isSafeInteger(stock) || stock < 0 || stock > 100000) {
        return respond({ ok: false, error: 'Miqdor 0–100 000 dona bo‘lsin.' }, 400);
      }

      const { data: gift, error: giftError } = await supabase.from('gift_library')
        .select('id,is_active').eq('id', libraryGiftId).maybeSingle();
      if (giftError) throw giftError;
      if (!gift || gift.is_active === false) return respond({ ok: false, error: 'Gift bazada mavjud emas.' }, 404);

      const { error } = await supabase.from('gift_shop_items').upsert({
        library_gift_id: libraryGiftId,
        price,
        stock,
        is_active: body.isActive !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'library_gift_id' });
      if (error) throw error;
      return respond({ ok: true, ...(await catalog(supabase)) });
    }

    if (action === 'toggle') {
      if (!UUID.test(String(body.id || '')) || typeof body.isActive !== 'boolean') {
        return respond({ ok: false, error: 'Gift va statusni tekshiring.' }, 400);
      }
      const { data, error } = await supabase.from('gift_shop_items')
        .update({ is_active: body.isActive, updated_at: new Date().toISOString() })
        .eq('id', body.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return respond({ ok: false, error: 'Sotuvdagi gift topilmadi.' }, 404);
      return respond({ ok: true, ...(await catalog(supabase)) });
    }

    return respond({ ok: false, error: 'Noma’lum action.' }, 400);
  } catch (error) {
    if (error instanceof HttpError) return securityError(error);
    console.error('[admin-gift-shop]', error?.code || 'failure');
    return respond({ ok: false, error: 'Do‘konni boshqarishda server xatosi. SQL migratsiyasini tekshiring.' }, 500);
  }
}
