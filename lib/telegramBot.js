import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  completeStarsPayment,
  markStarsPreCheckout,
  recordIncomingGift,
  validateStarsPreCheckout,
} from '@/lib/depositPayments';

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

function safeLog(scope, error) {
  console.error(`[bot:${scope}]`, error?.message || error);
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

export async function telegramApi(method, payload = {}, options = {}) {
  const token = getBotToken();
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 8_000));
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller?.signal,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      const description = data?.description || `Telegram API error: ${method}`;
      throw new Error(description);
    }

    return data.result;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Telegram API javobi kechikdi: ${method}`);
    }

    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

export async function answerPreCheckoutQuery(
  preCheckoutQueryId,
  ok,
  errorMessage = ''
) {
  return telegramApi('answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok: Boolean(ok),
    ...(ok ? {} : { error_message: errorMessage || 'To‘lovni tasdiqlab bo‘lmadi.' }),
  }, { timeoutMs: 4_000 });
}

/**
 * User xohlagandek bot ichida URL/silka ko'rsatilmaydi.
 * Faqat 1 ta Web App tugma chiqadi.
 */
export function buildMainKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '🎁 Web Appni ochish',
          web_app: { url: getWebAppUrl() },
        },
      ],
    ],
  };
}

export function buildAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: '🎁 Web Appni ochish',
          web_app: { url: getWebAppUrl() },
        },
      ],
      [
        {
          text: '🛡 Admin panel',
          url: `${getSiteUrl()}/admin`,
        },
      ],
    ],
  };
}

async function writeUser(from, startPayload = '') {
  if (!from?.id) return null;

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        id: Number(from.id),
        first_name: from.first_name || null,
        username: from.username || null,
      },
      { onConflict: 'id' }
    )
    .select('id, first_name, username, balance, is_banned')
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

async function saveReferral({ inviterId, invitedId, payload }) {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('referrals')
      .upsert(
        {
          inviter_id: inviterId,
          invited_id: invitedId,
          start_payload: payload || null,
          status: 'joined',
        },
        { onConflict: 'inviter_id,invited_id' }
      );

    if (error) throw error;
  } catch (error) {
    // Referrals table bo'lmasa ham bot sekinlashib/yiqilib qolmasin.
    safeLog('referral-save', error);
  }
}

async function getUserBalance(userId) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, username, balance, is_banned')
    .eq('id', Number(userId))
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

export function referralLink(userId) {
  return `https://t.me/${getBotUsername()}?start=ref_${userId}`;
}

export async function sendWelcome(chatId, from, startPayload = '') {
  const name = escapeHtml(from?.first_name || 'do‘stim');
  const referral = parseReferralPayload(startPayload);

  let referralLine = '';

  if (referral?.inviterId && referral.inviterId !== Number(from?.id)) {
    referralLine = '\n\n👥 Referal orqali muvaffaqiyatli ulandingiz.';
  }

  const text =
    `✨ Salom, <b>${name}</b>!\n\n` +
    `🎁 <b>Gift Myst</b> mini app’iga xush kelibsiz.\n\n` +
    `Case ochish, sovg‘a yutish va balansni boshqarish uchun pastdagi tugmani bosing.${referralLine}`;

  return sendMessage(chatId, text, {
    reply_markup: buildMainKeyboard(),
  });
}

export async function sendBalance(chatId, userId) {
  const user = await getUserBalance(userId);

  if (!user) {
    return sendMessage(chatId, 'Avval /start ni bosing, keyin qayta urinib ko‘ring.', {
      reply_markup: buildMainKeyboard(),
    });
  }

  if (user.is_banned) {
    return sendMessage(chatId, '🚫 Siz bloklangansiz.');
  }

  return sendMessage(
    chatId,
    `💎 <b>Balans:</b> <code>${money(user.balance)}</code>\n\n` +
      `Davom etish uchun Web App tugmasini bosing.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  );
}

export async function sendReferral(chatId, userId) {
  const link = referralLink(userId);

  return sendMessage(
    chatId,
    `👥 <b>Referal linkingiz:</b>\n\n` +
      `<code>${escapeHtml(link)}</code>\n\n` +
      `Do‘stlaringizni shu link orqali taklif qilishingiz mumkin.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  );
}

export async function sendHelp(chatId) {
  return sendMessage(
    chatId,
    `ℹ️ <b>Gift Myst bot</b>\n\n` +
      `/start — boshlash\n` +
      `/balance — balans\n` +
      `/ref — referal link\n` +
      `/id — Telegram ID\n\n` +
      `Asosiy funksiyalar Web App ichida.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  );
}

async function handleStarsPreCheckout(query) {
  if (!query?.id) return null;

  try {
    let validationTimer = null;
    const validation = await Promise.race([
      validateStarsPreCheckout(query),
      new Promise((resolve) => {
        validationTimer = setTimeout(
          () =>
            resolve({
              ok: false,
              error: 'Tekshiruv vaqti tugadi. Yangi invoice bilan qayta urining.',
            }),
          3_500
        );
      }),
    ]);

    if (validationTimer) clearTimeout(validationTimer);

    const answer = await answerPreCheckoutQuery(
      query.id,
      validation.ok,
      validation.error
    );

    // Telegram tasdiqini DB update'dan oldin yuboramiz. Bot API javobni
    // 10 soniyada kutadi; ledger statusi esa to‘lovni bloklamasligi kerak.
    if (validation.ok && validation.deposit && !validation.fast) {
      try {
        await markStarsPreCheckout(validation.deposit);
      } catch (markError) {
        // successful_payment pending holatni ham atomik yakunlay oladi.
        safeLog('stars-pre-checkout-mark', markError);
      }
    }

    return answer;
  } catch (error) {
    safeLog('stars-pre-checkout', error);

    return answerPreCheckoutQuery(
      query.id,
      false,
      'To‘lovni tekshirishda xatolik. Birozdan so‘ng qayta urinib ko‘ring.'
    );
  }
}

async function handleSuccessfulStarsPayment(message) {
  const chatId = message?.chat?.id || message?.from?.id;
  const result = await completeStarsPayment(message);

  if (!chatId) return result;

  const credit = money(result?.creditAmount || message?.successful_payment?.total_amount);
  const balance = money(result?.balance);

  await sendMessage(
    chatId,
    `✅ <b>Deposit muvaffaqiyatli!</b>\n\n` +
      `⭐ Balansga qo‘shildi: <b>${credit}</b>\n` +
      `💎 Yangi balans: <b>${balance}</b>\n\n` +
      `Web App ichida balans avtomatik yangilanadi.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  ).catch((error) => safeLog('stars-payment-message', error));

  return result;
}

async function handleIncomingGift(message) {
  const chatId = message?.chat?.id || message?.from?.id;
  const deposit = await recordIncomingGift(message);

  if (!deposit || !chatId) return deposit;

  const suggestedCredit = Number(deposit.credit_amount || 0);
  const suggestionLine =
    suggestedCredit > 0
      ? `\nTaxminiy balans: <b>${money(suggestedCredit)} ⭐</b>`
      : '';

  await sendMessage(
    chatId,
    `🎁 <b>Gift qabul qilindi!</b>\n\n` +
      `Gift xavfsiz tekshiruvga yuborildi.${suggestionLine}\n` +
      `Admin tasdiqlashi bilan balans Web App ichida avtomatik yangilanadi.`,
    {
      reply_markup: buildMainKeyboard(),
    }
  ).catch((error) => safeLog('gift-deposit-message', error));

  return deposit;
}

export async function handleMessage(message) {
  const chatId = message?.chat?.id;
  const from = message?.from;
  const text = String(message?.text || '').trim();

  if (!chatId || !from?.id) return;

  if (message?.successful_payment) {
    return handleSuccessfulStarsPayment(message);
  }

  if (message?.gift || message?.unique_gift) {
    return handleIncomingGift(message);
  }

  const command = text.split(/\s+/)[0]?.toLowerCase();
  const startPayload = command === '/start' ? parseStartPayload(text) : '';

  if (command === '/start') {
    // Faqat /start paytida DB write qilamiz. Shuning uchun bot tezroq javob beradi.
    try {
      await writeUser(from, startPayload);
    } catch (error) {
      safeLog('start-user-write', error);
    }

    return sendWelcome(chatId, from, startPayload);
  }

  if (command === '/balance') {
    return sendBalance(chatId, from.id);
  }

  if (command === '/ref' || command === '/referral') {
    // Tez ishlashi uchun bu yerda DB count qilinmaydi.
    return sendReferral(chatId, from.id);
  }

  if (command === '/help') {
    return sendHelp(chatId);
  }

  if (command === '/id') {
    return sendMessage(chatId, `🆔 Telegram ID: <code>${from.id}</code>`, {
      reply_markup: buildMainKeyboard(),
    });
  }

  if (command === '/admin') {
    if (!isAdmin(from.id)) {
      return sendMessage(chatId, 'Bu buyruq faqat admin uchun.', {
        reply_markup: buildMainKeyboard(),
      });
    }

    return sendMessage(chatId, '🛡 Admin panel:', {
      reply_markup: buildAdminKeyboard(),
    });
  }

  return sendMessage(chatId, 'Gift Myst’ni ochish uchun tugmani bosing 👇', {
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

  // Callbackga tezda javob qaytaramiz, DB write qilmaymiz.
  if (data === 'balance') {
    await answerCallbackQuery(id, 'Balans...');
    return sendBalance(chatId, from.id);
  }

  if (data === 'referral') {
    await answerCallbackQuery(id, 'Referal...');
    return sendReferral(chatId, from.id);
  }

  if (data === 'help') {
    await answerCallbackQuery(id);
    return sendHelp(chatId);
  }

  return answerCallbackQuery(id, 'OK');
}

export async function handleTelegramUpdate(update) {
  if (update?.pre_checkout_query) {
    return handleStarsPreCheckout(update.pre_checkout_query);
  }

  if (update?.message) {
    return handleMessage(update.message);
  }

  if (update?.business_message) {
    return handleMessage(update.business_message);
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
    allowed_updates: [
      'message',
      'business_message',
      'callback_query',
      'pre_checkout_query',
    ],
    // Payment/gift update navbatini deploy paytida yo‘qotib qo‘ymaymiz.
    drop_pending_updates: false,
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
  const allowedUpdates = Array.isArray(webhookInfo?.allowed_updates)
    ? webhookInfo.allowed_updates
    : [];
  const paymentsReady =
    normalizeUrl(webhookInfo?.url) === normalizeUrl(webhookUrl) &&
    allowedUpdates.includes('pre_checkout_query') &&
    !webhookInfo?.last_error_message;

  return {
    webhook,
    commands,
    menuButton,
    shortDescription,
    webhookInfo,
    paymentsReady,
    requiredPaymentUpdate: 'pre_checkout_query',
    webhookUrl,
    webAppUrl,
  };
}
