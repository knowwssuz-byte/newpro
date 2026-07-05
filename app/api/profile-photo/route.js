import { readTelegramRequest, jsonError } from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clean(value = '') {
  return String(value || '').trim();
}

function getBotToken() {
  const token = clean(process.env.TELEGRAM_BOT_TOKEN);

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN env topilmadi');
  }

  return token;
}

async function telegramApi(method, payload = {}) {
  const token = getBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram API error: ${method}`);
  }

  return data.result;
}

function pickBestPhoto(photos = []) {
  const flat = photos.flat();

  if (!flat.length) return null;

  return flat.sort((a, b) => Number(b.file_size || 0) - Number(a.file_size || 0))[0];
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const userId = Number(auth.telegramUser.id);

    const photos = await telegramApi('getUserProfilePhotos', {
      user_id: userId,
      limit: 1,
    });

    const bestPhoto = pickBestPhoto(photos?.photos || []);

    if (!bestPhoto?.file_id) {
      return Response.json({
        ok: true,
        photoUrl: '',
      });
    }

    const file = await telegramApi('getFile', {
      file_id: bestPhoto.file_id,
    });

    if (!file?.file_path) {
      return Response.json({
        ok: true,
        photoUrl: '',
      });
    }

    const token = getBotToken();
    const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      cache: 'no-store',
    });

    if (!fileResponse.ok) {
      throw new Error('Telegram profile photo yuklab olinmadi');
    }

    const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return Response.json({
      ok: true,
      photoUrl: `data:${contentType};base64,${base64}`,
    });
  } catch (error) {
    console.error('[profile-photo]', error);

    return Response.json({
      ok: true,
      photoUrl: '',
      warning: error?.message || 'Profile photo olinmadi',
    });
  }
}
