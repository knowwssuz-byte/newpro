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
import StarIcon from './StarIcon';

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
      <StarIcon variant="gold" size={46} />
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
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [promoNow, setPromoNow] = useState(() => Date.now());
  const [showHistory, setShowHistory] = useState(false);
  const [tonTransferLink, setTonTransferLink] = useState('');
  const [tonFallbackOpen, setTonFallbackOpen] = useState(false);
  const [tonTransferMode, setTonTransferMode] = useState('choice');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(false);
  const pollBusyRef = useRef(false);
  const manifestCheckRef = useRef(null);
  const promoRestoredRef = useRef(false);
  useEffect(() => {
    if (!promo?.expiresAt) return undefined;
    const timer = window.setInterval(() => setPromoNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [promo?.expiresAt]);

  const applyState = useCallback(
    (data) => {
      if (!data || !mountedRef.current) return;

      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.deposits)) setDeposits(data.deposits);
      if (Object.prototype.hasOwnProperty.call(data, 'promoSession') && !promoRestoredRef.current) {
        promoRestoredRef.current = true;
        if (data.promoSession?.code) {
          setPromo((current) => current || { ...data.promoSession, method: 'stars' });
          setPromoInput((current) => current || data.promoSession.code);
          setPromoNow(Date.now());
        }
      }

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
          { action: 'state', includePromo: true },
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
          setNotice('');
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

  async function applyPromo(event) {
    event.preventDefault();
    if (!promoInput.trim() || busy) return;
    setBusy('promo');
    setPromoError('');
    setPromo(null);
    try {
      const data = await apiPost('/api/deposit', {
        action: 'promo_activate',
        method,
        amount: method === 'stars' ? Number(starsAmount) : Number(tonAmount),
        promoCode: promoInput,
      }, { timeoutMs: 10_000 });
      setPromo({ ...data.promo, method });
      setPromoNow(Date.now());
    } catch (promoLoadError) {
      setPromoError(promoLoadError?.message || 'Promokod tekshiruvi amalga oshmadi.');
    } finally {
      if (mountedRef.current) setBusy('');
    }
  }

  const promoExpiry = promo?.expiresAt ? Date.parse(promo.expiresAt) : 0;
  const promoRemainingMs = Math.max(0, promoExpiry - promoNow);
  const promoExpired = Boolean(promo) && promoRemainingMs <= 0;
  const promoTimeText = [Math.floor(promoRemainingMs / 3_600_000),
    Math.floor((promoRemainingMs % 3_600_000) / 60_000),
    Math.floor((promoRemainingMs % 60_000) / 1000)]
    .map((part) => String(part).padStart(2, '0')).join(':');
  const promoWrongMethod = Boolean(promo) && promo.method !== method;
  const promoMinRequired = Boolean(promo) && (
    method === 'stars'
      ? number(starsAmount) < number(promo.minCredit)
      : Math.floor(number(tonAmount) * number(settings?.tonStarsRate)) < number(promo.minCredit)
  );
  const promoUsable = Boolean(promo) && !promoExpired && !promoWrongMethod && !promoMinRequired;
  const appliedPromoCode = promoUsable ? promo.code : '';
  const promoNeedsAttention = Boolean(promo) && !promoUsable;
  const existingPromoTonInvoice = Boolean(
    pendingTon && promo && pendingTon.promoCode === promo.code &&
    ['pending', 'confirming'].includes(pendingTon.status)
  );
  // An invoice already reserved before expiry keeps its bonus and may finish.
  const promoBlocksTonPayment = promoNeedsAttention && !existingPromoTonInvoice;

  async function payWithStars(event) {
    event.preventDefault();

    await runAction('stars', async () => {
      if (promoNeedsAttention) {
        throw new Error(promoExpired
          ? 'Promokodning 6 soati tugadi. Promokodni olib tashlang.'
          : 'Promokod uchun belgilangan minimal depozit miqdorini kiriting.');
      }
      const data = await apiPost(
        '/api/deposit',
        {
          action: 'create_stars',
          amount: Number(starsAmount),
          promoCode: appliedPromoCode,
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
      setTonTransferMode('choice');
      setTonFallbackOpen(false);
      setNotice('');
    });
  }

  async function payWithTonConnect(event) {
    event.preventDefault();

    await runAction('ton', async () => {
      if (promoBlocksTonPayment) {
        throw new Error(promoExpired
          ? 'Promokodning 6 soati tugadi. Yangi to‘lov uchun uni olib tashlang.'
          : 'Promokod uchun minimal depozit miqdori yetarli emas.');
      }
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
          promoCode: appliedPromoCode,
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
      if (promoBlocksTonPayment) {
        throw new Error(promoExpired
          ? 'Promokod muddati tugagan. Yangi to‘lov uchun uni olib tashlang.'
          : 'Promokod uchun minimal depozit miqdori yetarli emas.');
      }
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
          promoCode: appliedPromoCode,
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
          note: '',
        },
        { timeoutMs: 15_000 }
      );

      applyState(data);
      setGiftUrl('');
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
  const tonManualSelected = tonTransferMode === 'manual';
  const tonWalletActive = Boolean(tonConnectionRestored && tonAddress && tonWallet && !tonManualSelected);
  const tonDetailsVisible = tonManualSelected || tonWalletActive;
  const expectedTonCredit = Math.max(
    0,
    Math.floor(number(tonAmount) * number(settings?.tonStarsRate))
  );
  const baseCredit = method === 'stars' ? Math.max(0, number(starsAmount)) : expectedTonCredit;
  const promoBonus = promoUsable
    ? Math.floor(baseCredit * number(promo.bonusPercent) / 100)
    : 0;

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
            ready: settings?.starsConfigured,
          },
          {
            id: 'ton',
            title: 'TON/GRAM',
            ready: settings?.tonConfigured,
          },
          {
            id: 'gift',
            title: 'Gift',
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
              setPromo(null);
              setPromoError('');
              setError('');
              setNotice('');
              if (item.id === 'ton') {
                setTonTransferMode('choice');
                setTonFallbackOpen(false);
              }
            }}
          >
            <span className={styles.methodGlow} aria-hidden="true" />
            <MethodIcon method={item.id} />
            <strong>{item.title}</strong>
            {!loading && !item.ready ? <small>Sozlanmagan</small> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingCard} role="status" aria-label="Balans ochilmoqda">
          <span aria-hidden="true" />
        </div>
      ) : null}

      {!loading && (method === 'stars' || (method === 'ton' && tonDetailsVisible)) ? (
        <div className={styles.promoArea}>
          <form className={styles.promoForm} onSubmit={applyPromo}>
            <label htmlFor="deposit-promocode">PROMOKOD <span>ixtiyoriy</span></label>
            <div className={styles.promoEntry}>
              <input id="deposit-promocode" placeholder="Kodni kiriting" autoComplete="off"
                value={promoInput} maxLength={32}
                onChange={(e) => { setPromoInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')); setPromo(null); setPromoError(''); }} />
              <button type="submit" disabled={Boolean(busy) || !promoInput.trim()}>{busy === 'promo' ? '...' : 'Qo‘llash'}</button>
            </div>
          </form>
          {promoError ? <p className={styles.promoError} role="alert">{promoError}</p> : null}
          {promo && promo.method === method ? (
            <div className={`${styles.promoSuccess} ${promoNeedsAttention ? styles.promoInvalid : ''}`}>
              <div className={styles.promoStatusMain}>
                <strong>✓ {promo.code} · +{promo.bonusPercent}%</strong>
                <span>{promoExpired ? 'Muddati tugadi' : promoMinRequired
                  ? `Kamida ${formatBalance(promo.minCredit)} Stars to‘ldiring`
                  : `Bonus: +${formatBalance(promoBonus)} ⭐`}</span>
              </div>
              <div className={styles.promoClock} aria-live="off">
                <small>Qolgan vaqt</small><b>{promoTimeText}</b>
              </div>
              <button type="button" className={styles.promoRemove}
                onClick={() => { setPromo(null); setPromoInput(''); }}
                aria-label="Promokodni olib tashlash">×</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && method === 'stars' ? (
        <form className={`${styles.panel} ${styles.starsPanel}`} onSubmit={payWithStars}>
          <div className={styles.compactSectionHeading}>
            <StarsMark small />
            <h3>Stars to‘ldirish</h3>
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
            <strong><StarsMark small /> {formatBalance(number(starsAmount) + promoBonus)}</strong>
          </div>

          <button
            type="submit"
            className={`${styles.primaryButton} ${styles.starsButton}`}
            disabled={Boolean(busy) || !settings?.starsConfigured || promoNeedsAttention}
          >
            {busy === 'stars' ? <span className={styles.buttonSpinner} /> : <StarsMark small />}
            <span>{busy === 'stars' ? 'Invoice ochilmoqda...' : 'Telegram Stars bilan to‘lash'}</span>
          </button>

        </form>
      ) : null}

      {!loading && method === 'ton' ? (
        <div className={`${styles.panel} ${styles.tonPanel} ${styles.depositCleanPanel}`}>
          {!settings?.tonConfigured ? (
            <div className={styles.setupMessage}>TON to‘ldirish hozircha mavjud emas.</div>
          ) : (
            <>
              <div className={styles.tonChoiceGrid} role="group" aria-label="TON to‘lov turi">
                <button type="button"
                  className={`${styles.tonChoiceButton} ${styles.tonChoiceConnect} ${tonWalletActive ? styles.tonChoiceActive : ''}`}
                  onClick={() => {
                    setTonTransferMode('choice');
                    setTonFallbackOpen(false);
                    if (!tonAddress || !tonWallet) void connectTonWallet();
                  }}
                  disabled={Boolean(busy) || !tonConnectionRestored}
                  aria-pressed={tonWalletActive}
                >
                  <TonMark small />
                  <span>{tonWalletActive ? 'Wallet Connected' : 'Connect Wallet'}</span>
                </button>
                <button type="button"
                  className={`${styles.tonChoiceButton} ${styles.tonChoiceManual} ${tonManualSelected ? styles.tonChoiceActive : ''}`}
                  onClick={() => {
                    setTonTransferMode((current) => current === 'manual' ? 'choice' : 'manual');
                    setTonFallbackOpen(false);
                    setError('');
                    setNotice('');
                  }}
                  disabled={Boolean(busy)}
                  aria-pressed={tonManualSelected}
                >
                  <CopyIcon />
                  <span>Manual Transfer</span>
                </button>
              </div>

              {tonWalletActive ? (
                <div className={styles.tonConnectedRow}>
                  <span>{tonWalletName} · {shortAddress(tonAddress)}</span>
                  <button type="button" onClick={disconnectTonWallet}
                    disabled={Boolean(busy) || pendingTon?.status === 'confirming'}>Uzish</button>
                </div>
              ) : null}

              {tonDetailsVisible ? (
                <form className={styles.tonPaymentForm}
                  onSubmit={tonManualSelected
                    ? (event) => { event.preventDefault(); void createManualTonInvoice(); }
                    : payWithTonConnect}>
                  <div className={styles.amountInput}>
                    <TonMark />
                    <input type="number" min={settings.tonMin} max={settings.tonMax}
                      step="0.000000001" inputMode="decimal" value={tonAmount}
                      onChange={(event) => setTonAmount(event.target.value)}
                      aria-label="TON amount" required />
                    <span>TON</span>
                  </div>
                  <div className={styles.presetRow}>
                    {TON_PRESETS.filter(item =>
                      item >= number(settings.tonMin) && item <= number(settings.tonMax)
                    ).map(item => (
                      <button type="button" key={item}
                        className={Number(tonAmount) === item ? styles.selectedPreset : ''}
                        onClick={() => setTonAmount(String(item))}>{item}</button>
                    ))}
                  </div>
                  <div className={styles.summary}>
                    <span>Balansga</span>
                    <strong><StarsMark small /> {formatBalance(expectedTonCredit + promoBonus)}</strong>
                  </div>
                  <button type="submit" className={`${styles.primaryButton} ${styles.tonButton}`}
                    disabled={Boolean(busy) || promoBlocksTonPayment ||
                      pendingTon?.status === 'confirming' || (!tonManualSelected && !tonWalletActive)}>
                    {busy === 'ton' || busy === 'ton-manual'
                      ? <span className={styles.buttonSpinner} /> : <TonMark small />}
                    <span>
                      {busy === 'ton' || busy === 'ton-manual'
                        ? 'Tayyorlanmoqda...'
                        : pendingTon?.status === 'confirming'
                          ? 'Tekshirilmoqda'
                          : tonManualSelected ? 'Manual invoice yaratish' : 'TON bilan to‘lash'}
                    </span>
                  </button>
                </form>
              ) : null}
            </>
          )}

          {liveTonDeposit && (
            (tonManualSelected && tonFallbackOpen) || liveTonDeposit.status === 'confirming'
          ) ? (
            <div className={styles.tonInvoice}>
              <div className={styles.invoiceTop}>
                <span><i />{liveTonDeposit.status === 'confirming' ? 'TEKSHIRILMOQDA' : 'MANUAL TRANSFER'}</span>
                <small>{dateTime(liveTonDeposit.expiresAt)} gacha</small>
              </div>
              <div className={styles.invoiceAmount}>
                <TonMark />
                <strong>{formatTon(liveTonDeposit.payAmount)}</strong>
                <span>TON</span>
              </div>
              <div className={styles.invoiceRow}>
                <div><span>Qabul qiluvchi wallet</span><strong>{shortAddress(liveTonDeposit.tonWallet)}</strong></div>
                <button type="button" aria-label="Wallet manzilini nusxalash"
                  onClick={() => copy(liveTonDeposit.tonWallet, 'Wallet nusxalandi')}><CopyIcon /></button>
              </div>
              <div className={styles.invoiceRow}>
                <div><span>Comment (majburiy)</span><strong>{liveTonDeposit.tonMemo}</strong></div>
                <button type="button" aria-label="Comment nusxalash"
                  onClick={() => copy(liveTonDeposit.tonMemo, 'Comment nusxalandi')}><CopyIcon /></button>
              </div>
              {liveTonLink && liveTonDeposit.status !== 'confirming' ? (
                <a className={styles.walletButton} href={liveTonLink}
                  onClick={() => setNotice('Wallet ochildi. Blockchain tasdig‘i kutilmoqda.')}>
                  <TonMark small /><span>Walletda ochish</span>
                </a>
              ) : null}
              <p>Manual transferda summa va commentni aynan saqlang.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && method === 'gift' ? (
        <div className={`${styles.panel} ${styles.giftPanel}`}>
          <div className={styles.compactSectionHeading}>
            <GiftMark small />
            <h3>Gift to‘ldirish</h3>
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
                  <strong>@{settings.giftRecipient}</strong>
                </div>
                <button type="button" onClick={openGiftRecipient}>Ochish</button>
              </div>


              <form onSubmit={submitGift}>
                <label className={styles.textField}>
                  <span>Gift link <small>ixtiyoriy</small></span>
                  <input
                    type="url"
                    value={giftUrl}
                    onChange={(event) => setGiftUrl(event.target.value)}
                    placeholder="https://t.me/nft/GiftName-123"
                  />
                </label>

                <button
                  type="submit"
                  className={`${styles.primaryButton} ${styles.giftButton}`}
                  disabled={Boolean(busy)}
                >
                  {busy === 'gift' ? <span className={styles.buttonSpinner} /> : <GiftMark small />}
                  <span>{busy === 'gift' ? 'Yuborilmoqda...' : 'Tekshiruvga yuborish'}</span>
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
          <button type="button" onClick={() => setShowHistory((value) => !value)}>
            {showHistory ? 'Yopish' : 'Ko‘rish'}
          </button>
        </div>

        {showHistory && deposits.length ? (
          <div className={styles.historyList}>
            {deposits.slice(0, 8).map((deposit) => {
              const status = statusMeta(deposit.status);

              return (
                <article className={styles.historyItem} key={deposit.id}>
                  <MethodIcon method={deposit.method} small />
                  <div className={styles.historyCopy}>
                    <strong>{methodName(deposit.method)}</strong>
                    <span>{dateTime(deposit.createdAt)} · {deposit.giftTitle || (deposit.method === 'gift' ? 'Gift tekshiruvi' : `${formatTon(deposit.payAmount)} ${deposit.payCurrency}`)}</span>
                    {deposit.promoCode ? <small>Promokod: {deposit.promoCode}</small> : null}
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
        ) : showHistory ? (
          <div className={styles.emptyHistory}>
            <span>◎</span>
            <strong>Hali deposit yo‘q</strong>
            <p>Birinchi to‘lovingiz shu yerda ko‘rinadi.</p>
          </div>
        ) : null}
      </section>
    </section>
  );
}
