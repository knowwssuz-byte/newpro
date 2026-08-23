'use client';

import {
  useIsConnectionRestored,
  useTonAddress,
  useTonConnectUI,
  useTonWallet,
} from '@tonconnect/ui-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronLeft,
  Copy,
  ShieldCheck,
} from 'lucide-react';
import styles from './DepositView.module.css';

const STAR_PRESETS = [50, 100, 250, 500, 1000];
const TON_PRESETS = [0.5, 1, 2, 5];

function number(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatBalance(value) {
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 2,
  }).format(Math.max(0, number(value)));
}

function formatTon(value) {
  return number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function shortAddress(value = '') {
  const text = String(value || '');

  if (text.length <= 18) return text;

  return `${text.slice(0, 9)}…${text.slice(-7)}`;
}

function methodName(method) {
  if (method === 'stars') return 'Telegram Stars';
  if (method === 'ton') return 'TON / GRAM';
  if (method === 'gift') return 'Telegram Gift';
  return 'Deposit';
}

function statusMeta(status) {
  if (status === 'completed') return { label: 'Tushdi', tone: 'success' };
  if (status === 'confirming') return { label: 'Tekshirilmoqda', tone: 'live' };
  if (status === 'rejected') return { label: 'Rad etildi', tone: 'danger' };
  if (status === 'expired') return { label: 'Vaqti tugadi', tone: 'muted' };
  if (status === 'cancelled') return { label: 'Bekor qilindi', tone: 'muted' };

  return { label: 'Kutilmoqda', tone: 'pending' };
}

function dateTime(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function tonLinkFromDeposit(deposit) {
  if (!deposit?.tonWallet || !deposit?.tonMemo) return '';

  const amount = Math.round(number(deposit.payAmount) * 1_000_000_000);
  const params = new URLSearchParams({
    amount: String(amount),
    text: deposit.tonMemo,
  });

  if (deposit.expiresAt) {
    params.set(
      'exp',
      String(Math.floor(new Date(deposit.expiresAt).getTime() / 1000))
    );
  }

  return `ton://transfer/${deposit.tonWallet}?${params.toString()}`;
}

function StarsMark({ small = false }) {
  return (
    <span
      className={`${styles.starsMark} ${small ? styles.smallMark : ''}`}
      aria-hidden="true"
    >
      <Image
        src="/currency/stars-4k.webp"
        alt=""
        width={46}
        height={46}
        draggable={false}
      />
    </span>
  );
}

function TonMark({ small = false }) {
  return (
    <span className={`${styles.tonMark} ${small ? styles.smallMark : ''}`} aria-hidden="true">
      <Image
        src="/currency/ton.png"
        alt=""
        width={46}
        height={46}
        unoptimized
        draggable={false}
      />
    </span>
  );
}

function GiftMark({ small = false }) {
  return (
    <span className={`${styles.giftMark} ${small ? styles.smallMark : ''}`} aria-hidden="true">
      <Image
        src="/currency/gift.png"
        alt=""
        width={46}
        height={46}
        unoptimized
        draggable={false}
      />
    </span>
  );
}

function BackIcon() {
  return <ChevronLeft aria-hidden="true" strokeWidth={2.15} />;
}

function CopyIcon() {
  return <Copy aria-hidden="true" strokeWidth={2.15} />;
}

function ShieldIcon() {
  return <ShieldCheck aria-hidden="true" strokeWidth={2.15} />;
}

function openInvoice(tg, invoiceLink) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (status = 'opened') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(status);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(error);
    };
    const timeout = window.setTimeout(() => finish('opened'), 180_000);

    try {
      if (typeof tg?.openInvoice === 'function') {
        const result = tg.openInvoice(invoiceLink, finish);

        if (result && typeof result.then === 'function') {
          result.then(finish).catch(fail);
        }

        return;
      }

      const popup = window.open(invoiceLink, '_blank', 'noopener,noreferrer');

      if (!popup) {
        window.location.href = invoiceLink;
      }

      finish('opened');
    } catch (error) {
      fail(error);
    }
  });
}

function tonConnectRejected(error) {
  const code = Number(error?.code ?? error?.statusCode ?? error?.errorCode);
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();

  return (
    code === 300 ||
    name.includes('userreject') ||
    name.includes('user_reject') ||
    message.includes('user reject') ||
    message.includes('user declined')
  );
}

function tonConnectErrorMessage(error) {
  const code = Number(
    error?.code ??
    error?.statusCode ??
    error?.errorCode
  );
  const message = String(error?.message || '').toLowerCase();

  if (
    code === 2 ||
    message.includes('manifest_not_found') ||
    message.includes('manifest not found')
  ) {
    return 'TON Connect manifest topilmadi. Ilovaning yangi versiyasini deploy qiling.';
  }

  if (
    code === 3 ||
    message.includes('manifest_content') ||
    message.includes('manifest content')
  ) {
    return 'TON Connect manifest formati noto‘g‘ri. Deploy sozlamalarini tekshiring.';
  }

  if (tonConnectRejected(error)) {
    return 'Wallet ulanishi foydalanuvchi tomonidan bekor qilindi.';
  }

  return error?.message || 'Walletni ulab bo‘lmadi. Qayta urinib ko‘ring.';
}

function MethodIcon({ method, small = false }) {
  if (method === 'stars') return <StarsMark small={small} />;
  if (method === 'ton') return <TonMark small={small} />;
  return <GiftMark small={small} />;
}

export default function DepositView({
  apiPost,
  profile,
  tg,
  onBack,
  onBalanceChange,
  onToast,
}) {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const tonAddress = useTonAddress(true);
  const tonConnectionRestored = useIsConnectionRestored();
  const [method, setMethod] = useState('stars');
  const [settings, setSettings] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [balance, setBalance] = useState(() => number(profile?.balance));
  const [starsAmount, setStarsAmount] = useState('100');
  const [tonAmount, setTonAmount] = useState('1');
  const [giftUrl, setGiftUrl] = useState('');
  const [giftNote, setGiftNote] = useState('');
  const [tonTransferLink, setTonTransferLink] = useState('');
  const [tonFallbackOpen, setTonFallbackOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(false);
  const pollBusyRef = useRef(false);
  const manifestCheckRef = useRef(null);

  const applyState = useCallback(
    (data) => {
      if (!data || !mountedRef.current) return;

      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.deposits)) setDeposits(data.deposits);

      if (data.balance != null) {
        const nextBalance = Math.max(0, number(data.balance));
        setBalance(nextBalance);
        onBalanceChange?.(nextBalance);
      }
    },
    [onBalanceChange]
  );

  const loadState = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);

      try {
        const data = await apiPost(
          '/api/deposit',
          { action: 'state' },
          { timeoutMs: 12_000 }
        );
        applyState(data);
        setError('');
      } catch (loadError) {
        if (mountedRef.current && !silent) {
          setError(loadError.message || 'Deposit ma’lumotlari yuklanmadi.');
        }
      } finally {
        if (mountedRef.current && !silent) setLoading(false);
      }
    },
    [apiPost, applyState]
  );

  useEffect(() => {
    mountedRef.current = true;
    loadState();

    return () => {
      mountedRef.current = false;
    };
  }, [loadState]);

  useEffect(() => {
    const nextBalance = Math.max(0, number(profile?.balance));
    setBalance(nextBalance);
  }, [profile?.balance]);

  useEffect(() => {
    const unsubscribe = tonConnectUI.onStatusChange(
      (wallet) => {
        if (wallet && mountedRef.current) {
          setError('');
          setNotice('TON Connect wallet muvaffaqiyatli ulandi.');
        }
      },
      (connectionError) => {
        if (mountedRef.current) {
          setError(tonConnectErrorMessage(connectionError));
        }
      }
    );

    return unsubscribe;
  }, [tonConnectUI]);

  const ensureTonConnectManifest = useCallback(async () => {
    if (!manifestCheckRef.current) {
      manifestCheckRef.current = fetch('/api/tonconnect-manifest?v=3', {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `TON Connect manifest ochilmadi (HTTP ${response.status}).`
            );
          }

          const manifest = await response.json();

          if (!manifest?.url || !manifest?.name || !manifest?.iconUrl) {
            throw new Error('TON Connect manifest to‘liq emas.');
          }

          return manifest;
        })
        .catch((manifestError) => {
          manifestCheckRef.current = null;
          throw manifestError;
        });
    }

    return manifestCheckRef.current;
  }, []);

  const pendingDeposit = useMemo(
    () =>
      deposits.find(
        (item) =>
          item.status === 'confirming' ||
          (item.status === 'pending' && item.method !== 'stars')
      ) || null,
    [deposits]
  );

  const pendingTon = useMemo(
    () =>
      deposits.find(
        (item) =>
          item.method === 'ton' &&
          ['pending', 'confirming'].includes(item.status)
      ) || null,
    [deposits]
  );

  useEffect(() => {
    if (!pendingDeposit) return undefined;

    let timer = null;
    let cancelled = false;

    const poll = async () => {
      if (
        cancelled ||
        pollBusyRef.current ||
        document.visibilityState === 'hidden'
      ) {
        if (!cancelled) timer = window.setTimeout(poll, 4_500);
        return;
      }

      pollBusyRef.current = true;

      try {
        const payload = pendingTon
          ? { action: 'sync_ton', depositId: pendingTon.id }
          : { action: 'state' };
        const data = await apiPost('/api/deposit', payload, {
          timeoutMs: 12_000,
        });

        if (!cancelled) {
          applyState(data);

          if (data.completed && pendingTon) {
            setNotice('TON / GRAM to‘lovi tasdiqlandi va balansga tushdi.');
            onToast?.('TON / GRAM deposit balansga tushdi ✅');
          }
        }
      } catch {
        // Background tekshiruvi UI'ni bloklamaydi. Keyingi poll yana urinadi.
      } finally {
        pollBusyRef.current = false;
        if (!cancelled) timer = window.setTimeout(poll, 4_500);
      }
    };

    timer = window.setTimeout(poll, 2_000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [apiPost, applyState, onToast, pendingDeposit, pendingTon]);

  const syncStarsPayment = useCallback(
    async (depositId) => {
      if (!depositId) return;

      const delays = [0, 600, 1_200, 2_000, 3_200];

      for (const delay of delays) {
        if (delay > 0) await wait(delay);
        if (!mountedRef.current) return;

        try {
          const data = await apiPost(
            '/api/deposit',
            { action: 'state' },
            { timeoutMs: 8_000 }
          );

          applyState(data);
          const current = data.deposits?.find(
            (item) => item.id === depositId
          );

          if (current?.status === 'completed') {
            setNotice('Stars balansga muvaffaqiyatli tushdi.');
            return;
          }

          if (
            current &&
            ['rejected', 'expired', 'cancelled'].includes(current.status)
          ) {
            return;
          }
        } catch {
          // Webhook va keyingi urinish balansni tiklaydi.
        }
      }
    },
    [apiPost, applyState]
  );

  async function runAction(actionName, callback) {
    if (busy) return null;

    setBusy(actionName);
    setError('');
    setNotice('');

    try {
      return await callback();
    } catch (actionError) {
      if (mountedRef.current) {
        setError(actionError.message || 'Amalni bajarib bo‘lmadi.');
      }

      return null;
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  async function payWithStars(event) {
    event.preventDefault();

    await runAction('stars', async () => {
      const data = await apiPost(
        '/api/deposit',
        {
          action: 'create_stars',
          amount: Number(starsAmount),
        },
        { timeoutMs: 10_000 }
      );

      applyState(data);

      if (!data.invoiceLink) {
        throw new Error('Telegram invoice link kelmadi.');
      }

      const status = await openInvoice(tg, data.invoiceLink);

      if (status === 'paid') {
        setNotice('To‘lov qabul qilindi. Balans tasdiqlanmoqda...');
        onToast?.('Stars to‘lovi qabul qilindi ⭐');
        // Tugmani webhook/balance refresh kutib spinnerda ushlab turmaymiz.
        // successful_payment ledgerga tushishi bilan fon so‘rovi UI'ni yangilaydi.
        void syncStarsPayment(data.deposit?.id);
      } else if (status === 'cancelled' || status === 'failed') {
        void apiPost(
          '/api/deposit',
          {
            action: 'cancel_stars',
            depositId: data.deposit?.id,
          },
          { timeoutMs: 10_000 }
        )
          .then(applyState)
          .catch(() => {});
        setNotice('To‘lov yakunlanmadi. Xohlasangiz qayta urinishingiz mumkin.');
      } else {
        setNotice('Invoice ochildi. To‘lovdan keyin balans avtomatik yangilanadi.');
        void syncStarsPayment(data.deposit?.id);
      }
    });
  }

  async function connectTonWallet() {
    await runAction('ton-connect', async () => {
      if (!tonConnectionRestored) {
        setNotice('Wallet ulanishi tiklanmoqda. Bir soniya kuting.');
        return;
      }

      await ensureTonConnectManifest();
      await tonConnectUI.openModal();
    });
  }

  async function disconnectTonWallet() {
    await runAction('ton-disconnect', async () => {
      await tonConnectUI.disconnect();
      setNotice('TON Connect wallet uzildi.');
    });
  }

  async function payWithTonConnect(event) {
    event.preventDefault();

    await runAction('ton', async () => {
      if (!tonConnectionRestored) {
        setNotice('Wallet ulanishi tiklanmoqda. Bir soniya kuting.');
        return;
      }

      if (!tonAddress || !tonWallet) {
        await ensureTonConnectManifest();
        await tonConnectUI.openModal();
        return;
      }

      if (String(tonWallet.account?.chain || '') !== '-239') {
        throw new Error('Mainnet TON / GRAM walletni ulang.');
      }

      if (pendingTon?.status === 'confirming') {
        setNotice(
          'Oldingi to‘lov blockchain’da tekshirilmoqda. Qayta yubormang.'
        );
        return;
      }

      const data = await apiPost(
        '/api/deposit',
        {
          action: 'create_ton',
          amount: tonAmount,
          flow: 'ton_connect',
          senderAddress: tonAddress,
          network: tonWallet.account?.chain,
          walletApp:
            tonWallet.device?.appName ||
            tonWallet.name ||
            'TON Wallet',
        },
        { timeoutMs: 15_000 }
      );

      applyState(data);
      setTonTransferLink(data.transferLink || tonLinkFromDeposit(data.deposit));
      setTonFallbackOpen(false);

      const deposit = data.deposit;
      const transaction = deposit?.tonConnectTransaction;

      if (!data.tonConnectReady) {
        setNotice(
          'Bu invoice boshqa qurilmada yoki oldingi so‘rovda tekshirilmoqda. Qayta yubormang.'
        );
        return;
      }

      if (!deposit?.id || !transaction?.messages?.length) {
        throw new Error('TON Connect transaction tayyorlanmadi.');
      }

      let result;

      try {
        result = await tonConnectUI.sendTransaction({
          ...transaction,
          from: tonAddress,
        });
      } catch (sendError) {
        if (tonConnectRejected(sendError)) {
          const cancelled = await apiPost(
            '/api/deposit',
            {
              action: 'ton_connect_cancelled',
              depositId: deposit.id,
              senderAddress: tonAddress,
              walletApp:
                tonWallet.device?.appName ||
                tonWallet.name ||
                'TON Wallet',
            },
            { timeoutMs: 10_000 }
          );

          applyState(cancelled);
          setNotice('To‘lov walletda bekor qilindi. Pul yechilmadi.');
          return;
        }

        setNotice(
          'Wallet javobi uzildi. Qayta to‘lamang — blockchain avtomatik tekshirilmoqda.'
        );
        return;
      }

      try {
        const submitted = await apiPost(
          '/api/deposit',
          {
            action: 'ton_connect_submitted',
            depositId: deposit.id,
            senderAddress: tonAddress,
            walletApp:
              tonWallet.device?.appName ||
              tonWallet.name ||
              'TON Wallet',
            boc: result?.boc || result?.response?.boc || '',
          },
          { timeoutMs: 10_000 }
        );

        applyState(submitted);
      } catch {
        // Invoice create paytidayoq confirming bo‘ladi. Polling on-chain
        // natijani tiklaydi, shuning uchun foydalanuvchiga qayta yubortirmaymiz.
      }

      setNotice(
        'So‘rov walletda tasdiqlandi. Blockchain tasdig‘idan keyin balans avtomatik tushadi.'
      );
      onToast?.('TON / GRAM to‘lovi yuborildi 💎');
    });
  }

  async function createManualTonInvoice() {
    await runAction('ton-manual', async () => {
      if (pendingTon?.status === 'confirming') {
        setNotice(
          'TON Connect to‘lovi tekshirilmoqda. Takroriy transfer yubormang.'
        );
        return;
      }

      const data = await apiPost(
        '/api/deposit',
        {
          action: 'create_ton',
          amount: tonAmount,
          flow: 'manual',
        },
        { timeoutMs: 15_000 }
      );

      applyState(data);
      setTonTransferLink(data.transferLink || tonLinkFromDeposit(data.deposit));
      setTonFallbackOpen(true);
      setNotice(
        data.reused
          ? 'Oldingi TON / GRAM invoice ochildi.'
          : 'Manual invoice tayyor. Summa va commentni o‘zgartirmang.'
      );
    });
  }

  async function submitGift(event) {
    event.preventDefault();

    await runAction('gift', async () => {
      const data = await apiPost(
        '/api/deposit',
        {
          action: 'create_gift',
          giftUrl,
          note: giftNote,
        },
        { timeoutMs: 15_000 }
      );

      applyState(data);
      setGiftUrl('');
      setGiftNote('');
      setNotice(
        `Gift request yaratildi. Giftni @${data.recipient || settings?.giftRecipient} ga yuboring.`
      );
      onToast?.('Gift tekshiruvga yuborildi 🎁');
    });
  }

  async function copy(value, successText) {
    const text = String(value || '');

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      onToast?.(successText);
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      onToast?.(successText);
    }
  }

  function openGiftRecipient() {
    const recipient = settings?.giftRecipient;

    if (!recipient) return;

    const link = `https://t.me/${recipient}`;

    if (typeof tg?.openTelegramLink === 'function') {
      tg.openTelegramLink(link);
      return;
    }

    window.open(link, '_blank', 'noopener,noreferrer');
  }

  const liveTonDeposit = pendingTon;
  const liveTonLink =
    tonTransferLink || tonLinkFromDeposit(liveTonDeposit);
  const tonWalletName =
    tonWallet?.device?.appName ||
    tonWallet?.name ||
    'TON Wallet';
  const expectedTonCredit = Math.max(
    0,
    Math.floor(number(tonAmount) * number(settings?.tonStarsRate))
  );

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Orqaga">
          <BackIcon />
        </button>

        <div className={styles.headerTitle}>
          <span>Balance center</span>
          <h1>Deposit</h1>
        </div>

        <div className={styles.balancePill}>
          <StarsMark small />
          <strong>{formatBalance(balance)}</strong>
        </div>
      </header>

      <div className={styles.secureStrip}>
        <span className={styles.secureIcon}><ShieldIcon /></span>
        <div>
          <strong>Xavfsiz deposit</strong>
          <span>Server himoyasi · har bir to‘lov faqat bir marta hisoblanadi</span>
        </div>
        <em>LIVE</em>
      </div>

      {error ? (
        <div className={styles.alert} role="alert">
          <strong>Xatolik</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      ) : null}

      {notice ? (
        <div className={styles.notice}>
          <span>✓</span>
          <p>{notice}</p>
        </div>
      ) : null}

      <div className={styles.methodGrid} aria-label="Deposit methods">
        {[
          {
            id: 'stars',
            title: 'Stars',
            caption: 'Avtomatik',
            ready: settings?.starsConfigured,
          },
          {
            id: 'ton',
            title: 'TON/GRAM',
            caption: 'TON Connect',
            ready: settings?.tonConfigured,
          },
          {
            id: 'gift',
            title: 'Gift',
            caption: 'Telegram',
            ready: settings?.giftConfigured,
          },
        ].map((item) => (
          <button
            type="button"
            key={item.id}
            className={`${styles.methodCard} ${styles[item.id]} ${
              method === item.id ? styles.activeMethod : ''
            }`}
            aria-pressed={method === item.id}
            onClick={() => {
              setMethod(item.id);
              setError('');
              setNotice('');
            }}
          >
            <span className={styles.methodGlow} aria-hidden="true" />
            <MethodIcon method={item.id} />
            <strong>{item.title}</strong>
            <small>{loading ? '...' : item.ready ? item.caption : 'Sozlanmagan'}</small>
            {item.id === 'stars' || item.id === 'ton' ? <em>AUTO</em> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingCard}>
          <span />
          <p>Deposit tizimi sinxronlanmoqda...</p>
        </div>
      ) : null}

      {!loading && method === 'stars' ? (
        <form className={`${styles.panel} ${styles.starsPanel}`} onSubmit={payWithStars}>
          <div className={styles.panelHeading}>
            <div>
              <span>TELEGRAM STARS</span>
              <h3>Avtomatik to‘ldirish</h3>
            </div>
            <span className={styles.autoBadge}><i /> AUTO</span>
          </div>

          <div className={styles.amountLabel}>
            <span>Miqdor</span>
            <small>{settings?.starsMin}–{formatBalance(settings?.starsMax)} Stars</small>
          </div>

          <div className={styles.amountInput}>
            <StarsMark />
            <input
              type="number"
              min={settings?.starsMin || 1}
              max={settings?.starsMax || 10000}
              step="1"
              inputMode="numeric"
              value={starsAmount}
              onChange={(event) => setStarsAmount(event.target.value)}
              aria-label="Stars amount"
              required
            />
            <span>Stars</span>
          </div>

          <div className={styles.presetRow}>
            {STAR_PRESETS.filter(
              (item) =>
                item >= number(settings?.starsMin, 1) &&
                item <= number(settings?.starsMax, 10_000)
            ).map((item) => (
              <button
                type="button"
                key={item}
                className={Number(starsAmount) === item ? styles.selectedPreset : ''}
                onClick={() => setStarsAmount(String(item))}
              >
                {item}
              </button>
            ))}
          </div>

          <div className={styles.summary}>
            <span>Siz olasiz</span>
            <strong><StarsMark small /> {formatBalance(starsAmount)}</strong>
          </div>

          <button
            type="submit"
            className={`${styles.primaryButton} ${styles.starsButton}`}
            disabled={Boolean(busy) || !settings?.starsConfigured}
          >
            {busy === 'stars' ? <span className={styles.buttonSpinner} /> : <StarsMark small />}
            <span>{busy === 'stars' ? 'Invoice ochilmoqda...' : 'Telegram Stars bilan to‘lash'}</span>
          </button>

          <p className={styles.panelFootnote}>
            Telegram invoice tasdiqlangach, webhook balansni avtomatik yangilaydi.
          </p>
        </form>
      ) : null}

      {!loading && method === 'ton' ? (
        <div className={`${styles.panel} ${styles.tonPanel}`}>
          <form onSubmit={payWithTonConnect}>
            <div className={styles.panelHeading}>
              <div>
                <span>TON / GRAM NETWORK</span>
                <h3>TON Connect orqali</h3>
              </div>
              <span className={styles.chainBadge}>AUTO</span>
            </div>

            {!settings?.tonConfigured ? (
              <div className={styles.setupMessage}>
                Admin panelda TON / GRAM wallet va kursni kiriting.
              </div>
            ) : (
              <>
                <div className={`${styles.walletConnect} ${
                  tonAddress ? styles.walletConnected : ''
                }`}>
                  <TonMark />
                  <div>
                    <span>
                      {!tonConnectionRestored
                        ? 'Wallet tiklanmoqda...'
                        : tonAddress
                          ? tonWalletName
                          : 'TON Connect wallet'}
                    </span>
                    <strong>
                      {!tonConnectionRestored
                        ? 'Ulanish tekshirilmoqda'
                        : tonAddress
                          ? shortAddress(tonAddress)
                          : 'Tonkeeper, Wallet yoki boshqa wallet'}
                    </strong>
                  </div>
                  {tonAddress ? (
                    <button
                      type="button"
                      onClick={disconnectTonWallet}
                      disabled={Boolean(busy) || pendingTon?.status === 'confirming'}
                    >
                      Uzish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={connectTonWallet}
                      disabled={Boolean(busy) || !tonConnectionRestored}
                    >
                      Ulanish
                    </button>
                  )}
                </div>

                <div className={styles.rateLine}>
                  <span>Joriy ichki kurs</span>
                  <strong>1 TON / GRAM = {formatBalance(settings.tonStarsRate)} <StarsMark small /></strong>
                </div>

                <div className={styles.amountInput}>
                  <TonMark />
                  <input
                    type="number"
                    min={settings.tonMin}
                    max={settings.tonMax}
                    step="0.000000001"
                    inputMode="decimal"
                    value={tonAmount}
                    onChange={(event) => setTonAmount(event.target.value)}
                    aria-label="TON amount"
                    required
                  />
                  <span>TON/GRAM</span>
                </div>

                <div className={styles.presetRow}>
                  {TON_PRESETS.filter(
                    (item) =>
                      item >= number(settings.tonMin) &&
                      item <= number(settings.tonMax)
                  ).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={Number(tonAmount) === item ? styles.selectedPreset : ''}
                      onClick={() => setTonAmount(String(item))}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className={styles.summary}>
                  <span>Taxminiy balans</span>
                  <strong><StarsMark small /> {formatBalance(expectedTonCredit)}</strong>
                </div>

                <button
                  type="submit"
                  className={`${styles.primaryButton} ${styles.tonButton}`}
                  disabled={
                    Boolean(busy) ||
                    !tonConnectionRestored ||
                    pendingTon?.status === 'confirming'
                  }
                >
                  {busy === 'ton' ? <span className={styles.buttonSpinner} /> : <TonMark small />}
                  <span>
                    {busy === 'ton'
                      ? 'Walletga yuborilmoqda...'
                      : pendingTon?.status === 'confirming'
                        ? 'Blockchain tasdig‘i kutilmoqda'
                        : tonAddress
                          ? 'TON / GRAM bilan to‘lash'
                          : 'Avval walletni ulang'}
                  </span>
                </button>

                <button
                  type="button"
                  className={styles.manualToggle}
                  onClick={() => {
                    if (liveTonDeposit) {
                      setTonFallbackOpen((current) => !current);
                    } else {
                      createManualTonInvoice();
                    }
                  }}
                  disabled={Boolean(busy) || pendingTon?.status === 'confirming'}
                >
                  {busy === 'ton-manual'
                    ? 'Manual invoice tayyorlanmoqda...'
                    : tonFallbackOpen
                      ? 'Manual usulni yopish'
                      : 'Wallet ulanmasa — manual transfer'}
                </button>
              </>
            )}
          </form>

          {liveTonDeposit && (
            tonFallbackOpen || liveTonDeposit.status === 'confirming'
          ) ? (
            <div className={styles.tonInvoice}>
              <div className={styles.invoiceTop}>
                <span>
                  <i />
                  {liveTonDeposit.status === 'confirming'
                    ? ' BLOCKCHAIN TEKSHIRUVI'
                    : ' TO‘LOV KUTILMOQDA'}
                </span>
                <small>{dateTime(liveTonDeposit.expiresAt)} gacha</small>
              </div>

              <div className={styles.invoiceAmount}>
                <TonMark />
                <strong>{formatTon(liveTonDeposit.payAmount)}</strong>
                <span>TON / GRAM</span>
              </div>

              <div className={styles.invoiceRow}>
                <div>
                  <span>Wallet</span>
                  <strong>{shortAddress(liveTonDeposit.tonWallet)}</strong>
                </div>
                <button type="button" onClick={() => copy(liveTonDeposit.tonWallet, 'Wallet nusxalandi')}>
                  <CopyIcon />
                </button>
              </div>

              <div className={styles.invoiceRow}>
                <div>
                  <span>Comment — majburiy</span>
                  <strong>{liveTonDeposit.tonMemo}</strong>
                </div>
                <button type="button" onClick={() => copy(liveTonDeposit.tonMemo, 'Comment nusxalandi')}>
                  <CopyIcon />
                </button>
              </div>

              {liveTonLink && liveTonDeposit.status !== 'confirming' ? (
                <a
                  className={styles.walletButton}
                  href={liveTonLink}
                  onClick={() => {
                    setNotice(
                      'Wallet ochildi. To‘lovdan keyin blockchain avtomatik tekshiriladi.'
                    );
                  }}
                >
                  <TonMark small />
                  <span>Manual walletda ochish</span>
                </a>
              ) : null}

              <p>
                TON Connect ishlatilsa summa va comment avtomatik yuboriladi.
                Manual usulda ularni o‘zgartirmang.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && method === 'gift' ? (
        <div className={`${styles.panel} ${styles.giftPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <span>TELEGRAM COLLECTIBLE</span>
              <h3>Gift orqali to‘ldirish</h3>
            </div>
            <span className={styles.reviewBadge}>CHECK</span>
          </div>

          {!settings?.giftConfigured ? (
            <div className={styles.setupMessage}>
              Admin panelda gift qabul qiluvchi Telegram username’ni kiriting.
            </div>
          ) : (
            <>
              <div className={styles.giftRecipient}>
                <GiftMark />
                <div>
                  <span>Giftni shu akkauntga yuboring</span>
                  <strong>@{settings.giftRecipient}</strong>
                </div>
                <button type="button" onClick={openGiftRecipient}>Ochish</button>
              </div>

              <ol className={styles.steps}>
                <li><span>1</span><p>Telegram’da giftni <strong>@{settings.giftRecipient}</strong> ga yuboring.</p></li>
                <li><span>2</span><p>Unique Gift bo‘lsa linkini kiriting; oddiy Gift uchun bu ixtiyoriy.</p></li>
                <li><span>3</span><p>Gift kelishi bilan bot aniqlaydi, admin narxni tasdiqlaydi.</p></li>
              </ol>

              <form onSubmit={submitGift}>
                <label className={styles.textField}>
                  <span>Gift link <small>Unique Gift uchun</small></span>
                  <input
                    type="url"
                    value={giftUrl}
                    onChange={(event) => setGiftUrl(event.target.value)}
                    placeholder="https://t.me/nft/GiftName-123"
                  />
                </label>

                <label className={styles.textField}>
                  <span>Izoh <small>ixtiyoriy</small></span>
                  <input
                    type="text"
                    value={giftNote}
                    onChange={(event) => setGiftNote(event.target.value)}
                    placeholder="Giftni yubordim"
                    maxLength={500}
                  />
                </label>

                <button
                  type="submit"
                  className={`${styles.primaryButton} ${styles.giftButton}`}
                  disabled={Boolean(busy)}
                >
                  {busy === 'gift' ? <span className={styles.buttonSpinner} /> : <GiftMark small />}
                  <span>{busy === 'gift' ? 'Yuborilmoqda...' : 'Giftni tekshiruvga yuborish'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      ) : null}

      <section className={styles.history}>
        <div className={styles.historyHeading}>
          <div>
            <span>ACTIVITY</span>
            <h3>Oxirgi depositlar</h3>
          </div>
          <button type="button" onClick={() => loadState()} disabled={loading}>
            Yangilash
          </button>
        </div>

        {deposits.length ? (
          <div className={styles.historyList}>
            {deposits.slice(0, 8).map((deposit) => {
              const status = statusMeta(deposit.status);

              return (
                <article className={styles.historyItem} key={deposit.id}>
                  <MethodIcon method={deposit.method} small />
                  <div className={styles.historyCopy}>
                    <strong>{methodName(deposit.method)}</strong>
                    <span>{dateTime(deposit.createdAt)} · {deposit.giftTitle || (deposit.method === 'gift' ? 'Gift tekshiruvi' : `${formatTon(deposit.payAmount)} ${deposit.payCurrency}`)}</span>
                    {deposit.adminNote ? <small>{deposit.adminNote}</small> : null}
                  </div>
                  <div className={styles.historyValue}>
                    <strong>
                      {deposit.creditAmount > 0 ? `+${formatBalance(deposit.creditAmount)}` : '—'}
                      {deposit.creditAmount > 0 ? <StarsMark small /> : null}
                    </strong>
                    <span className={styles[status.tone]}>{status.label}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyHistory}>
            <span>◎</span>
            <strong>Hali deposit yo‘q</strong>
            <p>Birinchi to‘lovingiz shu yerda ko‘rinadi.</p>
          </div>
        )}
      </section>
    </section>
  );
}
