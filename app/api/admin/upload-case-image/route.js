import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminUser, jsonError } from '@/lib/telegramAuth';
import { verifyTelegramInitData } from '@/lib/verifyTelegram';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function extensionFromFile(file) {
  const fromName = String(file.name || '').split('.').pop()?.toLowerCase();

  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';

  return 'png';
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const initData = String(formData.get('initData') || '');
    const file = formData.get('file');
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

    if (!initData || !botToken) {
      return jsonError('initData yoki TELEGRAM_BOT_TOKEN topilmadi', 400);
    }

    const auth = verifyTelegramInitData(initData, botToken);

    if (!auth.ok || !auth.user?.id) {
      return jsonError(auth.error || auth.reason || 'Telegram initData noto‘g‘ri', 401);
    }

    if (!isAdminUser(auth.user.id)) {
      return jsonError('Admin ruxsati yo‘q', 403);
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonError('Rasm fayl tanlanmagan', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonError('Faqat PNG, JPG, WEBP yoki GIF rasm yuklash mumkin', 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError('Rasm hajmi 4 MB dan oshmasin', 400);
    }

    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_CASE_IMAGES_BUCKET || 'case-images';
    const ext = extensionFromFile(file);
    const filePath = `cases/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);

    return Response.json({
      ok: true,
      path: filePath,
      publicUrl: data.publicUrl,
    });
  } catch (error) {
    return jsonError(error.message || 'Rasm yuklashda server xatosi', 500);
  }
}
