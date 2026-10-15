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
  if (message.includes('PROMO_METHOD_INVALID')) return 'Promokod faqat Stars va TON depozitlari uchun.';
  if (message.includes('PROMO_ALREADY_USED') || message.includes('deposit_promo_redemptions_promo_id_user_id_key')) return 'Bu promokodni oldin ishlatgansiz yoki faol to‘lovda ishlatyapsiz.';
  if (message.includes('PROMO_LIMIT_REACHED')) return 'Promokod limiti tugagan.';
  if (message.includes('PROMO_MIN_CREDIT')) return 'Depozit summasi promokod minimumidan kam.';
  if (message.includes('PROMO_INVALID')) return 'Promokod noto‘g‘ri, o‘chirilgan yoki muddati tugagan.';
  return null;
}

export async function previewDepositPromo(supabase, { code: rawCode, userId, creditAmount, method }) {
  const code = normalizePromoCode(rawCode);
  if (!code) throw new Error('Promokodni kiriting.');
  if (!['stars', 'ton'].includes(method)) throw new Error('Promokod faqat Stars va TON uchun.');
  const { data: promo, error } = await supabase
    .from('deposit_promo_codes')
    .select('id,code,bonus_percent,max_users,min_credit,enabled,expires_at')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!promo || !promo.enabled || (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now())) {
    throw new Error('Promokod topilmadi yoki amal qilish muddati tugagan.');
  }
  if (!Number.isFinite(Number(creditAmount)) || Number(creditAmount) < Number(promo.min_credit)) {
    throw new Error(`Promokod uchun kamida ${promo.min_credit} Stars qiymatida depozit kerak.`);
  }
  const [quota, previous] = await Promise.all([
    supabase.from('deposit_promo_redemptions').select('id', { count: 'exact', head: true }).eq('promo_id', promo.id),
    supabase.from('deposit_promo_redemptions').select('id').eq('promo_id', promo.id).eq('user_id', userId).limit(1),
  ]);
  if (quota.error) throw quota.error;
  if (previous.error) throw previous.error;
  if (previous.data?.length) throw new Error('Bu promokod sizda allaqachon ishlatilgan yoki to‘lov kutmoqda.');
  const remaining = Math.max(0, Number(promo.max_users) - Number(quota.count || 0));
  if (!remaining) throw new Error('Promokod limiti tugagan.');
  return {
    code,
    bonusPercent: Number(promo.bonus_percent),
    minCredit: Number(promo.min_credit),
    remaining,
    expectedBonus: Math.floor(Number(creditAmount) * Number(promo.bonus_percent) / 100),
  };
}
