import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getDepositSettings } from '@/lib/depositSettings';

function clean(value = '') {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function invoicePayload(value = '') {
  const payload = clean(value);

  return /^deposit:[0-9a-f-]{36}$/i.test(payload) ? payload : '';
}

function depositSqlError(error) {
  const text =
    `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    text.includes('deposit_transactions') ||
    text.includes('deposit_complete')
  );
}

export async function validateStarsPreCheckout(query) {
  const payload = invoicePayload(query?.invoice_payload);

  if (!payload) {
    return { ok: false, error: 'Invoice ma’lumoti noto‘g‘ri.' };
  }

  const supabase = getSupabaseAdmin();
  const { data: deposit, error } = await supabase
    .from('deposit_transactions')
    .select('id,user_id,method,status,pay_currency,pay_amount,expires_at')
    .eq('invoice_payload', payload)
    .maybeSingle();

  if (error) {
    if (depositSqlError(error)) {
      return { ok: false, error: 'Deposit tizimi vaqtincha tayyor emas.' };
    }

    throw error;
  }

  if (!deposit) {
    return { ok: false, error: 'Invoice topilmadi.' };
  }

  if (
    deposit.method !== 'stars' ||
    !['pending', 'confirming'].includes(deposit.status) ||
    Number(deposit.user_id) !== Number(query?.from?.id) ||
    clean(query?.currency) !== 'XTR' ||
    Number(deposit.pay_amount) !== Number(query?.total_amount)
  ) {
    return { ok: false, error: 'Invoice ma’lumotlari mos kelmadi.' };
  }

  const expiresAt = new Date(deposit.expires_at || 0).getTime();

  if (expiresAt > 0 && Date.now() > expiresAt) {
    await supabase
      .from('deposit_transactions')
      .update({
        status: 'expired',
        admin_note: 'Telegram Stars invoice muddati tugadi.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deposit.id)
      .eq('status', 'pending');

    return { ok: false, error: 'Invoice muddati tugagan. Yangisini yarating.' };
  }

  if (deposit.status === 'pending') {
    const { error: confirmError } = await supabase
      .from('deposit_transactions')
      .update({
        status: 'confirming',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deposit.id)
      .eq('status', 'pending');

    if (confirmError) throw confirmError;
  }

  return {
    ok: true,
    deposit: {
      ...deposit,
      status: 'confirming',
    },
  };
}

export async function completeStarsPayment(message) {
  const payment = message?.successful_payment;
  const payload = invoicePayload(payment?.invoice_payload);

  if (!payment || !payload || !message?.from?.id) {
    throw new Error('Stars to‘lov ma’lumoti to‘liq emas.');
  }

  const depositId = payload.slice('deposit:'.length);
  const chargeId = clean(payment.telegram_payment_charge_id);

  if (!chargeId) {
    throw new Error('Telegram payment charge ID topilmadi.');
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('deposit_complete', {
    p_deposit_id: depositId,
    p_user_id: Number(message.from.id),
    p_external_id: `telegram:${chargeId}`,
    p_paid_amount: Number(payment.total_amount),
    p_paid_currency: clean(payment.currency),
    p_metadata: {
      provider: 'telegram_stars',
      telegramPaymentChargeId: chargeId,
      providerPaymentChargeId: clean(payment.provider_payment_charge_id),
      invoicePayload: payload,
      completedFromUpdate: true,
    },
  });

  if (error) {
    if (depositSqlError(error)) {
      throw new Error(
        'Deposit SQL o‘rnatilmagan. sql/deposit-system.sql faylini Run qiling.'
      );
    }

    throw error;
  }

  return data;
}

function uniqueGiftDetails(message) {
  const info = message?.unique_gift;
  const gift = info?.gift;

  if (!gift) return null;

  const slug = clean(gift.name);

  return {
    type: 'unique',
    title: `${clean(gift.base_name) || 'Unique Gift'} #${gift.number || '?'}`,
    giftUrl: slug ? `https://t.me/nft/${slug}` : '',
    externalId: clean(info.owned_gift_id),
    lastResaleCurrency: clean(info.last_resale_currency),
    lastResaleAmount: toNumber(info.last_resale_amount),
    metadata: {
      giftType: 'unique',
      origin: clean(info.origin),
      ownedGiftId: clean(info.owned_gift_id),
      giftId: clean(gift.gift_id),
      baseName: clean(gift.base_name),
      name: slug,
      number: Number(gift.number || 0),
      model: clean(gift.model?.name),
      symbol: clean(gift.symbol?.name),
      backdrop: clean(gift.backdrop?.name),
      lastResaleCurrency: clean(info.last_resale_currency),
      lastResaleAmount: toNumber(info.last_resale_amount),
    },
  };
}

function regularGiftDetails(message) {
  const info = message?.gift;
  const gift = info?.gift;

  if (!gift) return null;

  return {
    type: 'regular',
    title: clean(gift.title) || clean(gift.id) || 'Telegram Gift',
    giftUrl: '',
    externalId: clean(info.owned_gift_id),
    convertStars: toNumber(info.convert_star_count),
    metadata: {
      giftType: 'regular',
      ownedGiftId: clean(info.owned_gift_id),
      giftId: clean(gift.id),
      title: clean(gift.title),
      starCount: toNumber(gift.star_count),
      convertStarCount: toNumber(info.convert_star_count),
      text: clean(info.text).slice(0, 500),
    },
  };
}

function suggestedGiftCredit(details, settings) {
  const percent = settings.giftCreditPercent / 100;

  if (details.type === 'regular') {
    return Math.max(0, Math.floor(details.convertStars * percent));
  }

  if (details.lastResaleCurrency === 'XTR') {
    return Math.max(0, Math.floor(details.lastResaleAmount * percent));
  }

  if (
    details.lastResaleCurrency === 'TON' &&
    details.lastResaleAmount > 0 &&
    settings.tonStarsRate > 0
  ) {
    const tonAmount = details.lastResaleAmount / 1_000_000_000;
    return Math.max(
      0,
      Math.floor(tonAmount * settings.tonStarsRate * percent)
    );
  }

  return 0;
}

export async function recordIncomingGift(message) {
  const from = message?.from;
  const details = uniqueGiftDetails(message) || regularGiftDetails(message);

  if (!from?.id || !details) return null;

  const supabase = getSupabaseAdmin();
  const settings = await getDepositSettings(supabase);

  if (!settings.giftEnabled) return null;

  const { error: userError } = await supabase.from('users').upsert(
    {
      id: Number(from.id),
      first_name: from.first_name || null,
      username: from.username || null,
    },
    { onConflict: 'id' }
  );

  if (userError) throw userError;

  const fallbackExternalId = `telegram-gift:${message.chat?.id || from.id}:${message.message_id}`;
  const externalId = details.externalId
    ? `telegram-gift:${details.externalId}`
    : fallbackExternalId;
  const creditAmount = suggestedGiftCredit(details, settings);
  const metadata = {
    ...details.metadata,
    source: 'telegram_webhook',
    senderUserId: Number(from.id),
    senderUsername: clean(from.username),
    senderFirstName: clean(from.first_name),
    telegramChatId: Number(message.chat?.id || 0),
    telegramMessageId: Number(message.message_id || 0),
    suggestedCredit: creditAmount,
  };

  let existing = null;

  if (details.giftUrl) {
    const { data, error } = await supabase
      .from('deposit_transactions')
      .select('*')
      .eq('user_id', Number(from.id))
      .eq('method', 'gift')
      .eq('gift_url', details.giftUrl)
      .in('status', ['pending', 'confirming'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !depositSqlError(error)) throw error;
    existing = data || null;
  }

  if (!existing) {
    const { data, error } = await supabase
      .from('deposit_transactions')
      .select('*')
      .eq('user_id', Number(from.id))
      .eq('method', 'gift')
      .is('gift_url', null)
      .eq('status', 'pending')
      .gte(
        'created_at',
        new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && !depositSqlError(error)) throw error;
    existing = data || null;
  }

  if (existing) {
    const { data, error } = await supabase
      .from('deposit_transactions')
      .update({
        status: 'confirming',
        external_id: externalId,
        credit_amount:
          Number(existing.credit_amount || 0) > 0
            ? existing.credit_amount
            : creditAmount,
        metadata: {
          ...(existing.metadata &&
          typeof existing.metadata === 'object'
            ? existing.metadata
            : {}),
          ...metadata,
        },
        gift_url: existing.gift_url || details.giftUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const duplicate = await supabase
          .from('deposit_transactions')
          .select('*')
          .eq('external_id', externalId)
          .maybeSingle();

        if (duplicate.error) throw duplicate.error;
        return duplicate.data;
      }

      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from('deposit_transactions')
    .insert({
      user_id: Number(from.id),
      method: 'gift',
      status: 'confirming',
      pay_currency: 'GIFT',
      pay_amount: 1,
      credit_amount: creditAmount,
      external_id: externalId,
      gift_url: details.giftUrl || null,
      metadata,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = await supabase
        .from('deposit_transactions')
        .select('*')
        .eq('external_id', externalId)
        .maybeSingle();

      if (duplicate.error) throw duplicate.error;
      return duplicate.data;
    }

    if (depositSqlError(error)) {
      throw new Error(
        'Deposit SQL o‘rnatilmagan. sql/deposit-system.sql faylini Run qiling.'
      );
    }

    throw error;
  }

  return data;
}
