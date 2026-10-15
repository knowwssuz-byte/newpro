export function normalizePromoCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return '';
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) {
    throw new Error('Promokod 4–32 ta lotin harfi, raqam, _ yoki - dan iborat bo‘lishi kerak.');
  }
  return code;
}

export function promoErrorMessage(error) {
  const message = String(error?.message || error || '');
  if (message.includes('PROMO_NOT_ACTIVATED')) return 'Avval promokodni Qo‘llash tugmasi orqali faollashtiring.';
  if (message.includes('PROMO_WINDOW_EXPIRED')) return 'Promokodning 6 soatlik amal qilish muddati tugagan.';
  if (message.includes('PROMO_METHOD_INVALID')) return 'Promokod faqat Stars va TON depozitlari uchun.';
  if (message.includes('PROMO_ALREADY_USED') || message.includes('deposit_promo_redemptions_promo_id_user_id_key')) {
    return 'Bu promokod bilan avval depozit qilingansiz yoki to‘lov hali yakunlanmagan.';
  }
  if (message.includes('PROMO_LIMIT_REACHED')) return 'Promokod uchun ajratilgan foydalanuvchilar limiti tugagan.';
  if (message.includes('PROMO_MIN_CREDIT')) return 'Depozit miqdori promokodning minimal summasidan kam.';
  if (message.includes('PROMO_AMOUNT_INVALID')) return 'Depozit miqdori noto‘g‘ri.';
  if (message.includes('PROMO_INVALID')) return 'Promokod noto‘g‘ri, o‘chirilgan yoki amal qilish muddati tugagan.';
  return null;
}

/** Access is always enforced by the database and never trusts a client timer. */
export async function previewDepositPromo(supabase, {
  code: rawCode, userId, creditAmount, method, activate = false,
}) {
  const code = normalizePromoCode(rawCode);
  if (!code) throw new Error('Promokodni kiriting.');
  if (!['stars', 'ton'].includes(method)) throw new Error('Promokod faqat Stars va TON uchun.');
  const { data, error } = await supabase.rpc('deposit_promo_access', {
    p_code: code,
    p_user_id: userId,
    p_credit_amount: creditAmount,
    p_method: method,
    p_activate: Boolean(activate),
  });
  if (error) {
    const readable = promoErrorMessage(error);
    throw new Error(readable || 'Promokodni tekshirib bo‘lmadi. Qayta urinib ko‘ring.');
  }
  return {
    code: data.code,
    bonusPercent: Number(data.bonusPercent),
    minCredit: Number(data.minCredit),
    remaining: Number(data.remaining),
    expectedBonus: Number(data.expectedBonus),
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt,
    serverNow: data.serverNow,
  };
}
