import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const DEFAULT_BOT_USERNAME = 'GiftMystBot';

function cleanEnv(value = '') {
  return String(value || '').trim();
}

function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 6,
  }).format(number);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeUrl(url = '') {
  const clean = cleanEnv(url);
  if (!clean) return '';
  if (clean.startsWith('http://') || clean.startsWith('https://')) return clean.replace(/\/+$/, '');
  return `https://${clean}`.replace(/\/+$/, '');
}

export function getBotToken() {
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN env topilmadi');
  }
  return token;
}

export function getBotUsername() {
  return cleanEnv(process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME).replace('@', '') || DEFAULT_BOT_USERNAME;
}

export function getSiteUrl() {
  return (
    normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    normalizeUrl(process.env.VERCEL_URL) ||
    'https://newpro-blue.vercel.app'
  );
}

export function getWebAppUrl() {
  return normalizeUrl(process.env.NEXT_PUBLIC_WEBAPP_URL) || `${getSiteUrl()}/webapp`;
}

export function getWebhookUrl() {
  return normalizeUrl(process.env.BOT_WEBHOOK_URL) || `${getSiteUrl()}/api/bot`;
}

export function getAdminIds() {
  return cleanEnv(process.env.ADMIN_IDS)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdmin(userId) {
  return getAdminIds().includes(String(userId));
}

export async function telegramApi(method, payload = {}) {
  const token = getBotToken();

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    const description = data?.description || `Telegram API error: ${method}`;
    throw new Error(description);
  }

  return data.result;
}

export async function sendMessage(chatId, text, extra = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function answerCallbackQuery(callbackQueryId, text = '', extra = {}) {
  return telegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
    ...extra,
  });
}

export function buildMainKeyboard() {
  const webAppUrl = getWebAppUrl();
  const channelUrl = cleanEnv(process.env.BOT_CHANNEL_URL);
  const supportUrl = cleanEnv(process.env.BOT_SUPPORT_URL);

  const inline_keyboard = [
    [
      {
        text: '🎁 Gift Myst ochish',
        web_app: { url: webAppUrl },
      },
    ],
    [
      {
        text: '👥 Referal',
        callback_data: 'referral',
      },
      {
        text: '💎 Balans',
        callback_data: 'balance',
      },
    ],
  ];

  const lastRow = [];

  if (channelUrl) {
    lastRow.push({ text: '📣 Kanal', url: channelUrl });
  }

  if (supportUrl) {
    lastRow.push({ text: '🛟 Support', url: supportUrl });
  }

  if (lastRow.length) inline_keyboard.push(lastRow);

  return { inline_keyboard };
}

export function buildAdminKeyboard() {
  const siteUrl = getSiteUrl();
  const adminUrl = `${siteUrl}/admin`;

  return {
    inline_keyboard: [
      [
        {
          text: '🛡 Admin panel',
          url: adminUrl,
        },
      ],
      [
        {
          text: '🎁 Web App',
          web_app: { url: getWebAppUrl() },
        },
      ],
    ],
  };
}

function parseStartPayload(text = '') {
  const clean = String(text || '').trim();
  const [, ...rest] = clean.split(/\s+/);
  return rest.join(' ').trim();
}

function parseReferralPayload(payload = '') {
  const clean = String(payload || '').trim();

  if (!clean) return null;

  const match = clean.match(/^ref[_-]?(\d+)$/i) || clean.match(/^r[_-]?(\d+)$/i);

  if (!match) return null;

  return {
    inviterId: Number(match[1]),
    payload: clean,
  };
}

async function safeSupabaseWrite(callback) {
  try {
    return await callback();
  } catch (error) {
    console.error('[bot:supabase]', error?.message || error);
    return null;
  }
}

export async function ensureBotUser(from, startPayload = '') {
  if (!from?.id) {
    throw new Error('Telegram user id topilmadi');
  }

  const supabase = getSupabaseAdmin();

  const userPayload = {
    id: Number(from.id),
    first_name: from.first_name || null,
    username: from.username || null,
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(userPayload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const referral = parseReferralPayload(startPayload);

  if (referral?.inviterId && referral.inviterId !== Number(from.id)) {
    await saveReferral({
      inviterId: referral.inviterId,
      invitedId: Number(from.id),
      payload: referral.payload,
    });
  }

  return data;
}

export async function saveReferral({ inviterId, invitedId, payload }) {
  return safeSupabaseWrite(async () => {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('referrals')
      .upsert(
        {
          inviter_id: inviterId,
          invited_id: invitedId,
          start_payload: payload || null,
          status: 'joined',
        },
        { onConflict: 'inviter_id,invited_id' }
      )
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data;
  });
}

export async function getUserBalance(userId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, username, balance, is_banned')
    .eq('id', Number(userId))
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

export async function getReferralStats(userId) {
  return safeSupabaseWrite(async () => {
    const supabase = getSupabaseAdmin();

    const { count, error } = await supabase
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('inviter_id', Number(userId));

    if (error) throw error;
    return { invitedCount: count || 0 };
  });
}

export function referralLink(userId) {
  return `https://t.me/${getBotUsername()}?start=ref_${userId}`;
}

export async function sendWelcome(chatId, from, startPayload = '') {
  const name = escapeHtml(from?.first_name || 'do‘stim');
  const webAppUrl = getWebAppUrl();
  const referral = parseReferralPayload(startPayload);

  let referralLine = '';

  if (referral?.inviterId && referral.inviterId !== Number(from?.id)) {
    referralLine = '\n\n👥 Siz referal link orqali kirdingiz.';
  }

  const text =
    `✨ Salom, <b>${name}</b>!\n\n` +
    `🎁 <b>Gift Myst</b> — case ochish, sovg‘a yutish va balans yig‘ish mini app.\n\n` +
    `Pastdagi tugma orqali Web App’ni Telegram ichida oching.${referralLine}\n\n` +
    `🌐 Web App: <code>${escapeHtml(webAppUrl)}</code>`;

  return sendMessage(chatId, text, {
    reply_markup: buildMainKeyboard(),
  });
}

export async function sendBalance(chatId, userId) {
  const user = await getUserBalance(userId);

  if (!user) {
    return sendMessage(chatId, 'User topilmadi. /start ni bosib qayta urinib ko‘ring.', {
      reply_markup: buildMainKeyboard(),
    });
  }

  if (user.is_banned) {
    return sendMessage(chatId, '🚫 Siz bloklangansiz.');
  }

  return sendMessage(
    chatId,
    `💎 <b>Sizning balansingiz:</b> <code>${money(user.balance)}</code>\n\n` +
      `Case ochish uchun Web App’ga kiring.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  );
}

export async function sendReferral(chatId, userId) {
  const link = referralLink(userId);
  const stats = await getReferralStats(userId);
  const invitedCountText =
    stats && Number.isFinite(Number(stats.invitedCount))
      ? `\n\n📊 Taklif qilinganlar: <b>${stats.invitedCount}</b>`
      : '';

  return sendMessage(
    chatId,
    `👥 <b>Sizning referal linkingiz:</b>\n\n` +
      `<code>${escapeHtml(link)}</code>\n\n` +
      `Do‘stingiz shu link orqali botga kirsa, referal sifatida ulanadi.${invitedCountText}`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📤 Ulashish',
              url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(
                'Gift Mystga qo‘shiling va bonus oling 🎁'
              )}`,
            },
          ],
          [
            {
              text: '🎁 Web App ochish',
              web_app: { url: getWebAppUrl() },
            },
          ],
        ],
      },
    }
  );
}

export async function sendHelp(chatId) {
  return sendMessage(
    chatId,
    `ℹ️ <b>Gift Myst bot yordam</b>\n\n` +
      `/start — botni boshlash\n` +
      `/balance — balansni ko‘rish\n` +
      `/ref — referal linkingiz\n` +
      `/id — Telegram ID\n\n` +
      `Asosiy ishlar Web App ichida bajariladi.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  );
}

export async function handleMessage(message) {
  const chatId = message?.chat?.id;
  const from = message?.from;
  const text = String(message?.text || '').trim();

  if (!chatId || !from?.id) return;

  const command = text.split(/\s+/)[0]?.toLowerCase();
  const startPayload = command === '/start' ? parseStartPayload(text) : '';

  await ensureBotUser(from, startPayload);

  if (command === '/start') {
    return sendWelcome(chatId, from, startPayload);
  }

  if (command === '/help') {
    return sendHelp(chatId);
  }

  if (command === '/balance') {
    return sendBalance(chatId, from.id);
  }

  if (command === '/ref' || command === '/referral') {
    return sendReferral(chatId, from.id);
  }

  if (command === '/id') {
    return sendMessage(chatId, `🆔 Sizning Telegram ID: <code>${from.id}</code>`);
  }

  if (command === '/admin') {
    if (!isAdmin(from.id)) {
      return sendMessage(chatId, 'Bu buyruq faqat admin uchun.');
    }

    return sendMessage(chatId, '🛡 Admin panel:', {
      reply_markup: buildAdminKeyboard(),
    });
  }

  return sendMessage(chatId, 'Pastdagi tugma orqali Gift Myst Web App’ni oching 👇', {
    reply_markup: buildMainKeyboard(),
  });
}

export async function handleCallback(callbackQuery) {
  const id = callbackQuery?.id;
  const data = callbackQuery?.data;
  const message = callbackQuery?.message;
  const from = callbackQuery?.from;
  const chatId = message?.chat?.id || from?.id;

  if (!id || !chatId || !from?.id) return;

  await ensureBotUser(from);

  if (data === 'balance') {
    await answerCallbackQuery(id, 'Balans tekshirilmoqda...');
    return sendBalance(chatId, from.id);
  }

  if (data === 'referral') {
    await answerCallbackQuery(id, 'Referal link tayyorlanmoqda...');
    return sendReferral(chatId, from.id);
  }

  if (data === 'help') {
    await answerCallbackQuery(id);
    return sendHelp(chatId);
  }

  return answerCallbackQuery(id, 'OK');
}

export async function handleTelegramUpdate(update) {
  if (update?.message) {
    return handleMessage(update.message);
  }

  if (update?.callback_query) {
    return handleCallback(update.callback_query);
  }

  return null;
}

export async function setupTelegramBot() {
  const webhookUrl = getWebhookUrl();
  const webAppUrl = getWebAppUrl();
  const secretToken = cleanEnv(process.env.BOT_WEBHOOK_SECRET);

  const webhookPayload = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  };

  if (secretToken) {
    webhookPayload.secret_token = secretToken;
  }

  const webhook = await telegramApi('setWebhook', webhookPayload);

  const commands = await telegramApi('setMyCommands', {
    commands: [
      { command: 'start', description: 'Gift Mystni boshlash' },
      { command: 'balance', description: 'Balansni ko‘rish' },
      { command: 'ref', description: 'Referal link' },
      { command: 'help', description: 'Yordam' },
    ],
  });

  const menuButton = await telegramApi('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Gift Myst',
      web_app: {
        url: webAppUrl,
      },
    },
  });

  const descriptionText =
    cleanEnv(process.env.BOT_DESCRIPTION) ||
    'Gift Myst — Telegram ichida case ochish va sovg‘a yutish mini app.';

  const shortDescription = await telegramApi('setMyShortDescription', {
    short_description: descriptionText.slice(0, 120),
  }).catch((error) => ({ ok: false, error: error.message }));

  const webhookInfo = await telegramApi('getWebhookInfo', {});

  return {
    webhook,
    commands,
    menuButton,
    shortDescription,
    webhookInfo,
    webhookUrl,
    webAppUrl,
  };
}
