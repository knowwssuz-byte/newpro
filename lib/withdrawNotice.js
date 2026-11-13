import { sendMessage, buildMainKeyboard } from './telegramBot.js';
import { normalizeTelegramUsername } from './withdrawRecipient.mjs';

function html(value) {
  return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

/** Delivery status notification is best-effort: never roll back a final DB decision. */
export async function notifyWithdrawalDecision(row) {
  if (!row?.user_id || !['approved','rejected'].includes(row.status)) return false;
  const destination = normalizeTelegramUsername(row.recipient_username);
  const approved = row.status === 'approved';
  const text =
    (approved ? '✅ <b>Gift yuborildi!</b>' : '❌ <b>Gift yechish so‘rovi rad etildi</b>') +
    (destination ? '\n\nQabul qiluvchi: <b>@' + destination + '</b>' : '') +
    (row.admin_note ? '\n\nAdmin izohi: ' + html(String(row.admin_note).slice(0, 500)) : '') +
    (approved ? '\n\nGift yuborilgani admin tomonidan tasdiqlandi.' : '\n\nGift Inventory bo‘limiga qaytarildi. Sababni tuzatib qayta so‘rov yuborishingiz mumkin.');
  try {
    await sendMessage(Number(row.user_id), text, { reply_markup: buildMainKeyboard() });
    return true;
  } catch (error) {
    console.warn('[withdraw:decision-notification]', error?.code || 'unavailable');
    return false;
  }
}
