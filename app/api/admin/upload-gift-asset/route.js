import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isAdminUser, jsonError } from '@/lib/telegramAuth';
import { verifyTelegramInitData } from '@/lib/verifyTelegram';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/webm', 'video/mp4'];
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

function extensionFromFile(file) {
  const fromName = String(file.name || '').split('.').pop()?.toLowerCase();
  const allowed = ['png', 'jpg', 'jpeg', 'webp', 'webm', 'mp4'];

  if (fromName && allowed.includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }

  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'video/webm') return 'webm';
  if (file.type === 'video/mp4') return 'mp4';

  return 'bin';
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const initData = String(formData.get('initData') || '');
    const file = formData.get('file');
    const kind = String(formData.get('kind') || 'image');
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
      return jsonError('Fayl tanlanmagan', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonError('Sovg‘a rasmi uchun PNG/JPG/WEBP, animatsiya uchun WEBM/MP4 yuklang', 400);
    }

    if (kind === 'image' && !IMAGE_TYPES.includes(file.type)) {
      return jsonError('Rasm inputiga faqat PNG, JPG yoki WEBP yuklang', 400);
    }

    if (kind === 'animation' && !VIDEO_TYPES.includes(file.type)) {
      return jsonError('Animatsiya inputiga faqat WEBM yoki MP4 yuklang', 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError('Fayl hajmi 8 MB dan oshmasin', 400);
    }

    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_GIFT_ASSETS_BUCKET || 'gift-assets';
    const ext = extensionFromFile(file);
    const folder = kind === 'animation' ? 'animations' : 'images';
    const filePath = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
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
      kind,
      path: filePath,
      publicUrl: data.publicUrl,
    });
  } catch (error) {
    return jsonError(error.message || 'Gift asset yuklashda server xatosi', 500);
  }
}
