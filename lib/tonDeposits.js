import { Address, beginCell } from '@ton/core';

function clean(value = '') {
  return String(value ?? '').trim();
}

function crc16Xmodem(buffer) {
  let crc = 0;

  for (const byte of buffer) {
    crc ^= byte << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc;
}

function decodeFriendlyAddress(value) {
  const base64 = clean(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const bytes = Buffer.from(padded, 'base64');

  if (bytes.length !== 36) {
    throw new Error('TON wallet manzili uzunligi noto‘g‘ri.');
  }

  const checksum = crc16Xmodem(bytes.subarray(0, 34));
  const expected = (bytes[34] << 8) | bytes[35];

  if (checksum !== expected) {
    throw new Error('TON wallet checksum noto‘g‘ri.');
  }

  const tag = bytes[0] & 0x7f;

  if (tag !== 0x11 && tag !== 0x51) {
    throw new Error('TON wallet tag noto‘g‘ri.');
  }

  const workchain = bytes[1] > 127 ? bytes[1] - 256 : bytes[1];
  const hash = bytes.subarray(2, 34).toString('hex').toLowerCase();

  return `${workchain}:${hash}`;
}

export function normalizeTonAddress(value) {
  const address = clean(value);
  const raw = address.match(/^(-?\d+):([a-fA-F0-9]{64})$/);

  if (raw) {
    return `${Number(raw[1])}:${raw[2].toLowerCase()}`;
  }

  if (!/^[A-Za-z0-9_-]{48}$/.test(address)) {
    throw new Error('TON wallet manzili noto‘g‘ri.');
  }

  return decodeFriendlyAddress(address);
}

export function decimalToNano(value) {
  let text = clean(value);

  if (/e/i.test(text)) {
    const number = Number(text);

    if (!Number.isFinite(number)) throw new Error('TON miqdori noto‘g‘ri.');

    text = number.toFixed(9);
  }

  const match = text.match(/^(\d+)(?:\.(\d{0,9}))?$/);

  if (!match) {
    throw new Error('TON miqdori 9 tagacha kasr raqam bilan yozilishi kerak.');
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(9, '0') || '0');

  return whole * 1_000_000_000n + fraction;
}

export function buildTonTransferLink({ wallet, amount, memo, expiresAt }) {
  const amountNano = decimalToNano(amount);
  const params = new URLSearchParams({
    amount: amountNano.toString(),
    text: clean(memo),
  });

  if (expiresAt) {
    params.set(
      'exp',
      String(Math.floor(new Date(expiresAt).getTime() / 1000))
    );
  }

  return `ton://transfer/${clean(wallet)}?${params.toString()}`;
}

export function tonConnectRecipientAddress(wallet) {
  try {
    return Address.parse(clean(wallet)).toString({
      bounceable: false,
      testOnly: false,
      urlSafe: true,
    });
  } catch {
    throw new Error('TON wallet manzili TON Connect uchun noto‘g‘ri.');
  }
}

export function buildTonCommentPayload(memo) {
  const comment = clean(memo);

  if (!comment || Buffer.byteLength(comment, 'utf8') > 120) {
    throw new Error('TON payment comment uzunligi noto‘g‘ri.');
  }

  return beginCell()
    .storeUint(0, 32)
    .storeStringTail(comment)
    .endCell()
    .toBoc()
    .toString('base64');
}

export function buildTonConnectTransaction({
  wallet,
  amount,
  memo,
  expiresAt,
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const invoiceExpiry = Math.floor(new Date(expiresAt || 0).getTime() / 1000);
  const validUntil = Math.min(
    invoiceExpiry > nowSeconds ? invoiceExpiry : nowSeconds + 600,
    nowSeconds + 600
  );

  if (validUntil <= nowSeconds + 15) {
    throw new Error('TON invoice vaqti tugagan. Yangisini yarating.');
  }

  return {
    validUntil,
    network: '-239',
    messages: [
      {
        address: tonConnectRecipientAddress(wallet),
        amount: decimalToNano(amount).toString(),
        payload: buildTonCommentPayload(memo),
      },
    ],
  };
}

function actionTransfer(action) {
  return action?.TonTransfer || action?.ton_transfer || action?.tonTransfer || null;
}

function actionTransactionHash(action, event) {
  return (
    action?.base_transactions?.[0] ||
    action?.baseTransactions?.[0] ||
    event?.ext_msg_hash ||
    event?.event_id ||
    ''
  );
}

export async function findTonDepositPayment({
  wallet,
  amount,
  memo,
  sender,
  createdAt,
  expiresAt,
}) {
  const normalizedWallet = normalizeTonAddress(wallet);
  const normalizedSender = sender ? normalizeTonAddress(sender) : '';
  const expectedNano = decimalToNano(amount);
  const createdTimestamp = Math.max(
    0,
    Math.floor(new Date(createdAt || Date.now()).getTime() / 1000)
  );
  const expiresTimestamp = expiresAt
    ? Math.floor(new Date(expiresAt).getTime() / 1000)
    : 0;
  const startDate = Math.max(
    0,
    createdTimestamp - 90
  );
  const url = new URL(
    `https://tonapi.io/v2/accounts/${encodeURIComponent(wallet)}/events`
  );
  url.searchParams.set('limit', '100');
  url.searchParams.set('start_date', String(startDate));
  url.searchParams.set('subject_only', 'true');
  url.searchParams.set('sort_order', 'desc');

  const headers = { Accept: 'application/json' };
  const apiKey = clean(process.env.TONAPI_KEY);

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response;

  try {
    response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('TON tarmog‘i javobi kechikdi. Qayta tekshiriladi.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `TON tranzaksiyasini tekshirishda xatolik (${response.status}).`
    );
  }

  for (const event of data?.events || []) {
    if (event?.in_progress || event?.is_scam) continue;

    const eventTimestamp = Number(event?.timestamp || 0);

    if (
      !Number.isFinite(eventTimestamp) ||
      eventTimestamp <= 0 ||
      eventTimestamp < createdTimestamp - 90 ||
      (expiresTimestamp > 0 && eventTimestamp > expiresTimestamp + 90)
    ) {
      continue;
    }

    for (const action of event?.actions || []) {
      const transfer = actionTransfer(action);

      if (action?.type !== 'TonTransfer' || action?.status !== 'ok' || !transfer) {
        continue;
      }

      if (clean(transfer.comment) !== clean(memo)) continue;

      let receivedNano;

      try {
        receivedNano = BigInt(String(transfer.amount));
      } catch {
        continue;
      }

      if (receivedNano !== expectedNano) continue;

      const recipientAddress =
        transfer?.recipient?.address || transfer?.recipient?.raw_address || '';
      const senderAddress =
        transfer?.sender?.address || transfer?.sender?.raw_address || '';

      try {
        if (normalizeTonAddress(recipientAddress) !== normalizedWallet) continue;
        if (
          normalizedSender &&
          normalizeTonAddress(senderAddress) !== normalizedSender
        ) {
          continue;
        }
      } catch {
        continue;
      }

      const eventId = clean(event?.event_id);
      const transactionHash = clean(actionTransactionHash(action, event));

      if (!eventId && !transactionHash) continue;

      return {
        externalId: `ton:${eventId || transactionHash}`,
        eventId,
        transactionHash,
        senderAddress,
        amountNano: receivedNano.toString(),
        timestamp: eventTimestamp,
      };
    }
  }

  return null;
}
