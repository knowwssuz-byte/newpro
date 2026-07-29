import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  depositSettingsForClient,
  getDepositSettings,
} from '@/lib/depositSettings';
import {
  buildTonConnectTransaction,
  buildTonTransferLink,
  decimalToNano,
  findTonDepositPayment,
  normalizeTonAddress,
} from '@/lib/tonDeposits';
import { telegramApi } from '@/lib/telegramBot';
import { createStarsInvoicePayload } from '@/lib/starsInvoices';
import {
  ensureUser,
  jsonError,
  readTelegramRequest,
} from '@/lib/telegramAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 30;
const TON_CHECK_COOLDOWN_MS = 3_000;
const STARS_INVOICE_TTL_MS = 30 * 60_000;

function clean(value = '') {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);

  return Number.isSafeInteger(number) ? number : fallback;
}

function databaseErrorText(error) {
  return `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
}

function depositSqlMissing(error) {
  const text = databaseErrorText(error);

  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    text.includes('deposit_transactions') ||
    text.includes('deposit_complete')
  );
}

function throwDepositError(error) {
  if (depositSqlMissing(error)) {
    throw new Error(
      'Deposit SQL o‘rnatilmagan. Supabase’da sql/deposit-system.sql faylini to‘liq Run qiling.'
    );
  }

  throw error;
}

function publicDeposit(deposit) {
  if (!deposit) return null;

  const metadata =
    deposit.metadata && typeof deposit.metadata === 'object'
      ? deposit.metadata
      : {};

  const result = {
    id: deposit.id,
    method: deposit.method,
    status: deposit.status,
    payCurrency: deposit.pay_currency,
    payAmount: toNumber(deposit.pay_amount),
    creditAmount: toNumber(deposit.credit_amount),
    tonWallet: deposit.ton_wallet || '',
    tonMemo: deposit.ton_memo || '',
    giftUrl: deposit.gift_url || '',
    giftTitle:
      metadata.baseName ||
      metadata.title ||
      metadata.giftTitle ||
      '',
    adminNote: deposit.admin_note || '',
    createdAt: deposit.created_at,
    updatedAt: deposit.updated_at,
    expiresAt: deposit.expires_at,
    completedAt: deposit.completed_at,
  };

  if (
    deposit.method === 'ton' &&
    ['pending', 'confirming'].includes(deposit.status) &&
    deposit.ton_wallet &&
    deposit.ton_memo
  ) {
    try {
      result.tonConnectTransaction = buildTonConnectTransaction({
        wallet: deposit.ton_wallet,
        amount: deposit.pay_amount,
        memo: deposit.ton_memo,
        expiresAt: deposit.expires_at,
      });
    } catch {
      // Eski yoki vaqti tugagan invoice tarixda ko‘rinadi, ammo yuborilmaydi.
    }
  }

  return result;
}

async function fetchUserState(supabase, userId, settings = null) {
  const [userResult, depositsResult, resolvedSettings] = await Promise.all([
    supabase.from('users').select('id,balance').eq('id', userId).single(),
    supabase
      .from('deposit_transactions')
      .select(
        'id,method,status,pay_currency,pay_amount,credit_amount,ton_wallet,ton_memo,gift_url,metadata,admin_note,created_at,updated_at,expires_at,completed_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    settings ? Promise.resolve(settings) : getDepositSettings(supabase),
  ]);

  if (userResult.error) throw userResult.error;
  if (depositsResult.error) throwDepositError(depositsResult.error);

  return {
    balance: Math.max(0, toNumber(userResult.data?.balance)),
    settings: depositSettingsForClient(resolvedSettings),
    deposits: (depositsResult.data || []).map(publicDeposit),
  };
}

function validateStarsAmount(value, settings) {
  const amount = toInteger(value, -1);

  if (
    amount < settings.starsMin ||
    amount > settings.starsMax
  ) {
    throw new Error(
      `Stars miqdori ${settings.starsMin}–${settings.starsMax} oralig‘ida bo‘lishi kerak.`
    );
  }

  return amount;
}

function uniqueTonMemo(userId) {
  const userPart = Number(userId).toString(36).toUpperCase();
  const randomPart = crypto.randomBytes(5).toString('hex').toUpperCase();

  return `GM-${userPart}-${randomPart}`;
}

function tonConnectIntent(body = {}) {
  if (clean(body.flow).toLowerCase() !== 'ton_connect') return null;

  const senderAddress = normalizeTonAddress(body.senderAddress);
  const network = clean(body.network || '-239');

  if (network !== '-239') {
    throw new Error('TON Connect uchun mainnet walletni ulang.');
  }

  return {
    senderAddress,
    walletApp: clean(body.walletApp || 'TON Wallet').slice(0, 80),
    requestedAt: new Date().toISOString(),
  };
}

function mergeTonConnectMetadata(metadata, patch) {
  const current =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : {};
  const tonConnect =
    current.tonConnect &&
    typeof current.tonConnect === 'object' &&
    !Array.isArray(current.tonConnect)
      ? current.tonConnect
      : {};

  return {
    ...current,
    tonConnect: {
      ...tonConnect,
      ...patch,
    },
  };
}

function normalizeTonAmount(value, settings) {
  const nano = decimalToNano(value);

  if (nano <= 0n) {
    throw new Error('TON miqdori 0 dan katta bo‘lishi kerak.');
  }

  const amount = Number(nano) / 1_000_000_000;

  if (
    !Number.isFinite(amount) ||
    amount < settings.tonMin ||
    amount > settings.tonMax
  ) {
    throw new Error(
      `TON miqdori ${settings.tonMin}–${settings.tonMax} oralig‘ida bo‘lishi kerak.`
    );
  }

  return {
    amount,
    nano,
  };
}

function parseGiftLink(value) {
  const text = clean(value);

  if (!text) return '';

  const match = text.match(
    /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/nft\/([a-z0-9_-]+)\/?$/i
  );

  if (!match) {
    throw new Error(
      'Gift linki noto‘g‘ri. Masalan: https://t.me/nft/GiftName-123'
    );
  }

  return `https://t.me/nft/${match[1]}`;
}

async function createStarsDeposit({ supabase, userId, body, settings }) {
  if (!settings.starsEnabled) {
    throw new Error('Stars orqali depozit vaqtincha o‘chirilgan.');
  }

  const amount = validateStarsAmount(body.amount, settings);
  const depositId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + STARS_INVOICE_TTL_MS
  ).toISOString();
  const payload = createStarsInvoicePayload({
    depositId,
    userId,
    amount,
    expiresAt,
  });
  const row = {
    id: depositId,
    user_id: userId,
    method: 'stars',
    status: 'pending',
    pay_currency: 'XTR',
    pay_amount: amount,
    credit_amount: amount,
    invoice_payload: payload,
    expires_at: expiresAt,
    metadata: {
      version: 2,
      source: 'webapp',
      invoiceCreatedAt: new Date().toISOString(),
      fastPreCheckout: true,
    },
  };

  // DB insert va Telegram invoice link bir-biridan mustaqil. Ikkalasini
  // parallel kutish tugma bosilgandagi ortiqcha ketma-ket kechikishni oladi.
  const [insertOutcome, invoiceOutcome] = await Promise.allSettled([
    supabase
      .from('deposit_transactions')
      .insert(row)
      .select('*')
      .single(),
    telegramApi('createInvoiceLink', {
      title: 'Gift Myst balance',
      description: `${amount} Stars balansga avtomatik qo‘shiladi`,
      payload,
      currency: 'XTR',
      prices: [
        {
          label: `${amount} Stars balance`,
          amount,
        },
      ],
    }, { timeoutMs: 8_000 }),
  ]);

  const insertResult =
    insertOutcome.status === 'fulfilled'
      ? insertOutcome.value
      : { data: null, error: insertOutcome.reason };
  const deposit = insertResult.data;
  const insertError = insertResult.error;

  if (insertError) throwDepositError(insertError);
  if (!deposit) {
    throw new Error('Stars deposit bazada yaratilmadi.');
  }

  if (invoiceOutcome.status === 'rejected') {
    const error = invoiceOutcome.reason;

    await supabase
      .from('deposit_transactions')
      .update({
        status: 'cancelled',
        admin_note: `Invoice yaratilmadi: ${clean(error?.message).slice(0, 300)}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', depositId)
      .eq('status', 'pending');

    throw error;
  }

  return {
    deposit: publicDeposit(deposit),
    invoiceLink: invoiceOutcome.value,
  };
}

async function createTonDeposit({ supabase, userId, body, settings }) {
  if (!settings.tonEnabled) {
    throw new Error('TON / GRAM orqali depozit vaqtincha o‘chirilgan.');
  }

  if (!settings.tonWallet || settings.tonStarsRate <= 0) {
    throw new Error(
      'TON / GRAM depozit hali sozlanmagan. Admin wallet va kursni kiritishi kerak.'
    );
  }

  normalizeTonAddress(settings.tonWallet);
  const connectIntent = tonConnectIntent(body);

  const { data: activeDeposit, error: activeError } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('method', 'ton')
    .in('status', ['pending', 'confirming'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) throwDepositError(activeError);

  if (activeDeposit) {
    const activeExpiresAt = new Date(
      activeDeposit.expires_at || 0
    ).getTime();

    if (activeExpiresAt <= 0 || activeExpiresAt > Date.now()) {
      let resolvedDeposit = activeDeposit;
      let tonConnectReady = false;

      if (connectIntent && activeDeposit.status === 'pending') {
        const { data: started, error: startError } = await supabase
          .from('deposit_transactions')
          .update({
            status: 'confirming',
            metadata: mergeTonConnectMetadata(activeDeposit.metadata, {
              ...connectIntent,
              state: 'requested',
            }),
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeDeposit.id)
          .eq('user_id', userId)
          .eq('method', 'ton')
          .eq('status', 'pending')
          .select('*')
          .single();

        if (startError) throwDepositError(startError);
        resolvedDeposit = started;
        tonConnectReady = true;
      }

      return {
        deposit: publicDeposit(resolvedDeposit),
        transferLink: buildTonTransferLink({
          wallet: resolvedDeposit.ton_wallet,
          amount: resolvedDeposit.pay_amount,
          memo: resolvedDeposit.ton_memo,
          expiresAt: resolvedDeposit.expires_at,
        }),
        reused: true,
        tonConnectReady,
      };
    }

    const { error: expireError } = await supabase
      .from('deposit_transactions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeDeposit.id)
      .eq('user_id', userId)
      .in('status', ['pending', 'confirming']);

    if (expireError) throwDepositError(expireError);
  }

  const { amount, nano } = normalizeTonAmount(body.amount, settings);
  const creditAmount = Math.floor(amount * settings.tonStarsRate);

  if (creditAmount < 1) {
    throw new Error('Bu TON miqdori uchun balans 1 Starsdan kam chiqmoqda.');
  }

  const expiresAt = new Date(
    Date.now() + settings.tonExpiryMinutes * 60_000
  ).toISOString();
  const memo = uniqueTonMemo(userId);
  const row = {
    user_id: userId,
    method: 'ton',
    status: connectIntent ? 'confirming' : 'pending',
    pay_currency: 'TON',
    pay_amount: amount,
    credit_amount: creditAmount,
    ton_wallet: settings.tonWallet,
    ton_memo: memo,
    expires_at: expiresAt,
    metadata: {
      version: 1,
      source: 'webapp',
      amountNano: nano.toString(),
      starsRate: settings.tonStarsRate,
      ...(connectIntent
        ? {
            tonConnect: {
              ...connectIntent,
              state: 'requested',
            },
          }
        : {}),
    },
  };
  const { data: deposit, error } = await supabase
    .from('deposit_transactions')
    .insert(row)
    .select('*')
    .single();

  if (error) throwDepositError(error);

  return {
    deposit: publicDeposit(deposit),
    transferLink: buildTonTransferLink({
      wallet: settings.tonWallet,
      amount,
      memo,
      expiresAt,
    }),
    tonConnectReady: Boolean(connectIntent),
  };
}

async function updateTonConnectAttempt({
  supabase,
  userId,
  depositId,
  body,
  state,
}) {
  const { data: deposit, error } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('id', depositId)
    .eq('user_id', userId)
    .eq('method', 'ton')
    .maybeSingle();

  if (error) throwDepositError(error);
  if (!deposit) throw new Error('TON / GRAM depozit topilmadi.');

  if (deposit.status === 'completed') {
    return { deposit: publicDeposit(deposit), completed: true };
  }

  if (!['pending', 'confirming'].includes(deposit.status)) {
    throw new Error('Bu TON / GRAM invoice endi aktiv emas.');
  }

  const senderAddress = normalizeTonAddress(body.senderAddress);
  const currentTonConnect =
    deposit.metadata?.tonConnect &&
    typeof deposit.metadata.tonConnect === 'object'
      ? deposit.metadata.tonConnect
      : {};

  if (
    currentTonConnect.senderAddress &&
    normalizeTonAddress(currentTonConnect.senderAddress) !== senderAddress
  ) {
    throw new Error('Ulangan wallet invoice walletiga mos kelmadi.');
  }

  const timestamp = new Date().toISOString();
  const nextPatch = {
    senderAddress,
    walletApp: clean(body.walletApp || currentTonConnect.walletApp || 'TON Wallet').slice(0, 80),
    state,
  };

  if (state === 'submitted') {
    const boc = clean(body.boc);

    nextPatch.submittedAt = timestamp;
    nextPatch.bocSha256 = boc
      ? crypto.createHash('sha256').update(boc).digest('hex')
      : '';
  } else if (state === 'cancelled') {
    if (currentTonConnect.state === 'submitted') {
      return { deposit: publicDeposit(deposit), ignored: true };
    }

    nextPatch.cancelledAt = timestamp;
  }

  const { data: updated, error: updateError } = await supabase
    .from('deposit_transactions')
    .update({
      status: state === 'cancelled' ? 'pending' : 'confirming',
      metadata: mergeTonConnectMetadata(deposit.metadata, nextPatch),
      last_checked_at: state === 'submitted' ? null : deposit.last_checked_at,
      updated_at: timestamp,
    })
    .eq('id', deposit.id)
    .eq('user_id', userId)
    .in('status', ['pending', 'confirming'])
    .select('*')
    .single();

  if (updateError) throwDepositError(updateError);

  return {
    deposit: publicDeposit(updated),
    submitted: state === 'submitted',
    cancelled: state === 'cancelled',
  };
}

async function createGiftDeposit({ supabase, userId, body, settings }) {
  if (!settings.giftEnabled) {
    throw new Error('Gift orqali depozit vaqtincha o‘chirilgan.');
  }

  if (!settings.giftRecipient) {
    throw new Error('Gift qabul qiluvchi Telegram username sozlanmagan.');
  }

  const giftUrl = parseGiftLink(body.giftUrl);
  const note = clean(body.note).slice(0, 500);
  const { data: deposit, error } = await supabase
    .from('deposit_transactions')
    .insert({
      user_id: userId,
      method: 'gift',
      status: 'pending',
      pay_currency: 'GIFT',
      pay_amount: 1,
      credit_amount: 0,
      gift_url: giftUrl || null,
      metadata: {
        version: 1,
        source: 'webapp',
        userNote: note,
        giftRecipient: settings.giftRecipient,
      },
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && giftUrl) {
      throw new Error('Bu gift avval depozitga yuborilgan.');
    }

    throwDepositError(error);
  }

  return {
    deposit: publicDeposit(deposit),
    recipient: settings.giftRecipient,
  };
}

async function syncTonDeposit({ supabase, userId, depositId }) {
  const { data: deposit, error } = await supabase
    .from('deposit_transactions')
    .select('*')
    .eq('id', depositId)
    .eq('user_id', userId)
    .eq('method', 'ton')
    .maybeSingle();

  if (error) throwDepositError(error);
  if (!deposit) throw new Error('TON / GRAM depozit topilmadi.');

  if (deposit.status === 'completed') {
    return { deposit, completed: true };
  }

  if (!['pending', 'confirming'].includes(deposit.status)) {
    return { deposit, completed: false };
  }

  const lastCheckedAt = new Date(deposit.last_checked_at || 0).getTime();

  if (
    Number.isFinite(lastCheckedAt) &&
    Date.now() - lastCheckedAt < TON_CHECK_COOLDOWN_MS
  ) {
    return { deposit, completed: false, throttled: true };
  }

  const checkedAt = new Date().toISOString();
  const { error: checkUpdateError } = await supabase
    .from('deposit_transactions')
    .update({ last_checked_at: checkedAt, updated_at: checkedAt })
    .eq('id', deposit.id)
    .eq('user_id', userId);

  if (checkUpdateError) throwDepositError(checkUpdateError);

  const tonConnectMetadata =
    deposit.metadata?.tonConnect &&
    typeof deposit.metadata.tonConnect === 'object'
      ? deposit.metadata.tonConnect
      : {};
  const expectedTonConnectSender = ['requested', 'submitted'].includes(
    tonConnectMetadata.state
  )
    ? tonConnectMetadata.senderAddress || ''
    : '';
  const payment = await findTonDepositPayment({
    wallet: deposit.ton_wallet,
    amount: deposit.pay_amount,
    memo: deposit.ton_memo,
    sender: expectedTonConnectSender,
    createdAt: deposit.created_at,
    expiresAt: deposit.expires_at,
  });

  if (payment) {
    const { data: completed, error: completeError } = await supabase.rpc(
      'deposit_complete',
      {
        p_deposit_id: deposit.id,
        p_user_id: userId,
        p_external_id: payment.externalId,
        p_paid_amount: Number(deposit.pay_amount),
        p_paid_currency: 'TON',
        p_metadata: {
          provider: 'tonapi',
          tonEventId: payment.eventId,
          tonTransactionHash: payment.transactionHash,
          tonSenderAddress: payment.senderAddress,
          amountNano: payment.amountNano,
          eventTimestamp: payment.timestamp,
        },
      }
    );

    if (completeError) throwDepositError(completeError);

    return {
      deposit: completed,
      completed: true,
    };
  }

  const expiresAt = new Date(deposit.expires_at || 0).getTime();

  if (expiresAt > 0 && Date.now() > expiresAt) {
    const { data: expired, error: expireError } = await supabase
      .from('deposit_transactions')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deposit.id)
      .eq('user_id', userId)
      .in('status', ['pending', 'confirming'])
      .select('*')
      .single();

    if (expireError) throwDepositError(expireError);

    return { deposit: expired, completed: false };
  }

  return {
    deposit: { ...deposit, last_checked_at: checkedAt },
    completed: false,
  };
}

async function cancelStarsDeposit({ supabase, userId, depositId }) {
  const { data, error } = await supabase
    .from('deposit_transactions')
    .update({
      admin_note: 'Telegram invoice foydalanuvchi tomonidan yopildi.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', depositId)
    .eq('user_id', userId)
    .eq('method', 'stars')
    .in('status', ['pending', 'confirming'])
    .select('*')
    .maybeSingle();

  if (error) throwDepositError(error);

  return {
    deposit: data ? publicDeposit(data) : null,
    cancelled: Boolean(data),
  };
}

export async function POST(request) {
  try {
    const auth = await readTelegramRequest(request);

    if (!auth.ok) {
      return jsonError(auth.error, auth.status);
    }

    const supabase = getSupabaseAdmin();
    const [dbUser, settings] = await Promise.all([
      ensureUser(auth.telegramUser),
      getDepositSettings(supabase),
    ]);

    if (dbUser.is_banned) {
      return jsonError('Siz bloklangansiz.', 403);
    }

    const body = auth.body || {};
    const action = clean(body.action || 'state');
    const userId = Number(auth.telegramUser.id);
    let result = {};

    if (action === 'state') {
      return Response.json({
        ok: true,
        ...(await fetchUserState(supabase, userId, settings)),
      });
    }

    if (action === 'create_stars') {
      result = await createStarsDeposit({
        supabase,
        userId,
        body,
        settings,
      });

      // Invoice oynasi uchun kerakli linkni darhol qaytaramiz. To‘liq
      // history/balance qayta so‘rovi invoice ochilishini sekinlashtirmaydi.
      return Response.json({
        ok: true,
        ...result,
      });
    } else if (action === 'create_ton') {
      result = await createTonDeposit({
        supabase,
        userId,
        body,
        settings,
      });
    } else if (action === 'create_gift') {
      result = await createGiftDeposit({
        supabase,
        userId,
        body,
        settings,
      });
    } else if (action === 'sync_ton') {
      const depositId = clean(body.depositId);

      if (!/^[0-9a-f-]{36}$/i.test(depositId)) {
        return jsonError('Deposit ID noto‘g‘ri.', 400);
      }

      result = await syncTonDeposit({
        supabase,
        userId,
        depositId,
      });
    } else if (
      action === 'ton_connect_submitted' ||
      action === 'ton_connect_cancelled'
    ) {
      const depositId = clean(body.depositId);

      if (!/^[0-9a-f-]{36}$/i.test(depositId)) {
        return jsonError('Deposit ID noto‘g‘ri.', 400);
      }

      result = await updateTonConnectAttempt({
        supabase,
        userId,
        depositId,
        body,
        state:
          action === 'ton_connect_submitted' ? 'submitted' : 'cancelled',
      });
    } else if (action === 'cancel_stars') {
      const depositId = clean(body.depositId);

      if (!/^[0-9a-f-]{36}$/i.test(depositId)) {
        return jsonError('Deposit ID noto‘g‘ri.', 400);
      }

      result = await cancelStarsDeposit({
        supabase,
        userId,
        depositId,
      });
    } else {
      return jsonError('Noma’lum deposit amali.', 400);
    }

    return Response.json({
      ok: true,
      ...result,
      ...(await fetchUserState(supabase, userId, settings)),
    });
  } catch (error) {
    console.error('[deposit]', error);

    const message = error?.message || 'Deposit server xatosi.';
    const status =
      message.includes('oralig‘ida') ||
      message.includes('noto‘g‘ri') ||
      message.includes('avval') ||
      message.includes('sozlanmagan') ||
      message.includes('o‘chirilgan')
        ? 400
        : 500;

    return jsonError(message, status);
  }
}
