'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
  ArrowDownToLine,
  Award,
  Boxes,
  Check,
  Circle,
  Clock3,
  Copy,
  Gamepad2,
  Gem,
  Gift,
  History,
  House,
  PackageOpen,
  RefreshCw,
  Rocket,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  TrendingUp,
  UserRound,
  UserCheck,
  UserPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import caseOpeningStyles from './CaseOpening.module.css';
import liquidNavStyles from './LiquidGlassNav.module.css';
import gameCardStyles from './PremiumGameCards.module.css';
import DepositView from './DepositView';
import RocketGame from './RocketGame';

const CASE_ROLL_DURATION_MS = 4600;
const CASE_ROLL_FALLBACK_MS = CASE_ROLL_DURATION_MS + 1200;

const emptyCaseForm = {
  title: '',
  description: '',
  price: '0',
  image_url: '',
  badge_text: '',
  badge_color: '#8b5cf6',
  accent_color: '#22c55e',
  card_style: 'default',
};

const emptyGiftForm = {
  case_id: '',
  title: '',
  type: 'gift',
  value: '',
  chance: '10',
  real_chance: '10',
  stock: '999',
  rarity: 'rare',
  image_url: '',
  animation_url: '',
  background_value: 'linear-gradient(135deg,#ffc400 0%,#23c59a 100%)',
  is_active: true,
};

const emptyUserForm = {
  userId: '',
  amount: '',
};

const WARMED_IMAGE_URLS = new Set();

const GIFT_BACKGROUND_PRESETS = [
  { name: 'Gold', value: '#f59e0b' },
  { name: 'Emerald', value: '#22c55e' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Ocean', value: '#2563eb' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Dark', value: '#2d3340' },
];


function imageUrlOf(item) {
  return item?.image_url || item?.png_url || item?.webp_url || '';
}

function warmImageCacheFromData(...groups) {
  if (typeof window === 'undefined') return;

  const urls = [];

  groups
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      const url = typeof item === 'string' ? item : imageUrlOf(item);

      if (!url || WARMED_IMAGE_URLS.has(url)) return;

      WARMED_IMAGE_URLS.add(url);
      urls.push(url);
    });

  if (!urls.length) return;

  const loadOne = (url, eager = false) => {
    try {
      // `Image` yuqorida next/image komponenti sifatida import qilingan.
      // Preload uchun esa native browser konstruktori kerak.
      const img = new window.Image();

      img.decoding = 'async';
      img.loading = eager ? 'eager' : 'lazy';
      img.src = url;

      if (typeof img.decode === 'function') {
        img.decode().catch(() => {});
      }
    } catch (error) {
      console.warn('Image preload failed:', url, error);
    }
  };

  // Birinchi ko'rinadigan rasmlar darhol qizdiriladi.
  urls.slice(0, 18).forEach((url) => loadOne(url, true));

  const rest = urls.slice(18, 72);
  if (!rest.length) return;

  const warmRest = () => rest.forEach((url) => loadOne(url, false));

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmRest, { timeout: 1200 });
  } else {
    window.setTimeout(warmRest, 160);
  }
}

function defaultGiftBackground(rarity = 'rare') {
  const key = String(rarity || 'rare').toLowerCase();
  if (key === 'mythic') return GIFT_BACKGROUND_PRESETS[4].value;
  if (key === 'legendary') return GIFT_BACKGROUND_PRESETS[0].value;
  if (key === 'epic') return GIFT_BACKGROUND_PRESETS[2].value;
  if (key === 'rare') return GIFT_BACKGROUND_PRESETS[3].value;
  return GIFT_BACKGROUND_PRESETS[5].value;
}

function toChanceNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function visibleChance(gift) {
  return Math.max(0, toChanceNumber(gift?.chance, 0));
}

function realChance(gift) {
  return Math.max(
    0,
    toChanceNumber(
      gift?.real_chance ?? gift?.drop_chance ?? gift?.true_chance ?? gift?.chance,
      visibleChance(gift)
    )
  );
}

function eligibleGift(gift) {
  return gift?.is_active !== false && Number(gift?.stock || 0) > 0;
}

function openableGift(gift) {
  return eligibleGift(gift) && realChance(gift) > 0;
}

function solidGiftBackground(value, fallback = '#2d3340') {
  const raw = String(value || '').trim();

  if (!raw) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  if (/^rgba?\(/.test(raw) || /^hsla?\(/.test(raw)) return raw;

  const hex = raw.match(/#[0-9a-fA-F]{6}/)?.[0];
  if (hex) return hex;

  return fallback;
}

function rewardType(gift) {
  return String(gift?.type || '').toLowerCase() === 'balance' ? 'balance' : 'gift';
}

function isBalanceReward(gift) {
  return rewardType(gift) === 'balance';
}

function rewardValue(gift) {
  return Number(gift?.value || 0);
}

function rewardSubtitle(gift) {
  if (isBalanceReward(gift)) return `Balance +${money(rewardValue(gift))}`;
  return gift?.value ? String(gift.value) : 'Gift reward';
}

function giftSellPrice(gift) {
  if (!gift || isBalanceReward(gift)) return 0;

  const rawValue = gift.sell_price ?? gift.buy_price ?? gift.floor_price ?? gift.price ?? gift.value ?? 0;
  const number = Number(rawValue);

  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function sellButtonText(gift) {
  const price = giftSellPrice(gift);

  return price > 0 ? `Sotish ${formatPrice(price)} ⭐` : 'Sotish';
}

function sellConfirmText(gift) {
  const price = giftSellPrice(gift);

  return price > 0
    ? `Siz buni ${formatPrice(price)} ⭐ ga sotmoqchimisiz?`
    : 'Siz buni sotmoqchimisiz?';
}

function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('uz-UZ').format(number);
}

function formatPrice(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  if (number === 0) return '0';
  if (number < 100) return number.toString().replace(/\.0+$/, '');
  return money(number);
}

function safeColor(value, fallback = '#22c55e') {
  if (!value || typeof value !== 'string') return fallback;
  const color = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  if (/^rgba?\(/.test(color) || /^hsla?\(/.test(color)) return color;
  return fallback;
}

function caseAccent(caseItem) {
  return safeColor(caseItem?.accent_color, '#22c55e');
}

function caseBadgeColor(caseItem) {
  return safeColor(caseItem?.badge_color, '#8b5cf6');
}

function caseBadgeText(caseItem, gifts = []) {
  if (caseItem?.badge_text) return String(caseItem.badge_text).toUpperCase();
  const readyGifts = gifts.filter(eligibleGift);
  if (!readyGifts.length) return '';
  const minChance = readyGifts.reduce((min, gift) => Math.min(min, visibleChance(gift) || 100), 100);
  if (minChance <= 5) return 'LIMITED';
  if (Number(caseItem?.price || 0) === 0) return 'FREE';
  return '';
}

function giftRarity(gift) {
  const chance = visibleChance(gift);
  if (chance <= 3) return 'mythic';
  if (chance <= 8) return 'legendary';
  if (chance <= 18) return 'epic';
  if (chance <= 40) return 'rare';
  return 'common';
}

function groupGiftsByCase(gifts) {
  return (gifts || []).reduce((acc, gift) => {
    const key = gift.case_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(gift);
    return acc;
  }, {});
}

function sortCasesForDisplay(items = []) {
  return [...items].sort((a, b) => {
    const pinnedDiff = Number(Boolean(b?.is_pinned)) - Number(Boolean(a?.is_pinned));
    if (pinnedDiff) return pinnedDiff;

    const aOrder = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 999999;
    const bOrder = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 999999;

    if (aOrder !== bOrder) return aOrder - bOrder;

    return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
  });
}

function buildStartAppLink(botUsername, referralCode) {
  const cleanBot = String(botUsername || 'GiftMystBot').replace('@', '').trim() || 'GiftMystBot';
  const appShortName = String(process.env.NEXT_PUBLIC_TELEGRAM_APP_SHORT_NAME || '').replace('/', '').trim();

  if (appShortName) {
    return `https://t.me/${cleanBot}/${appShortName}?startapp=${encodeURIComponent(referralCode)}`;
  }

  return `https://t.me/${cleanBot}?startapp=${encodeURIComponent(referralCode)}`;
}

function getTelegramStartParam(app) {
  const urlParams = new URLSearchParams(window.location.search || '');
  return (
    app?.initDataUnsafe?.start_param ||
    urlParams.get('tgWebAppStartParam') ||
    urlParams.get('startapp') ||
    ''
  );
}

function randomItem(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function buildOpeningReel(gifts = [], winningGift) {
  const availableGifts = Array.isArray(gifts) ? gifts.filter(Boolean) : [];
  const safeGifts = availableGifts.length
    ? availableGifts
    : [winningGift].filter(Boolean);
  const reel = [];
  let previousId = '';

  const pickDifferent = () => {
    if (!safeGifts.length) return null;
    if (safeGifts.length === 1) return safeGifts[0];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const picked = randomItem(safeGifts);
      if (String(picked?.id || '') !== previousId) {
        previousId = String(picked?.id || '');
        return picked;
      }
    }

    const fallback = randomItem(safeGifts);
    previousId = String(fallback?.id || '');
    return fallback;
  };

  // Raffle logic: winner doim aniq indexga qo'yiladi.
  // Keyin JS transition o'sha indexni marker markaziga olib keladi.
  for (let index = 0; index < 48; index += 1) {
    reel.push(pickDifferent());
  }

  if (winningGift) {
    previousId = String(winningGift.id || '');
    reel.push(winningGift);
  }

  for (let index = 0; index < 8; index += 1) {
    reel.push(pickDifferent());
  }

  return reel.filter(Boolean);
}

function getWinningIndexFromReel(reel = []) {
  // buildOpeningReel: 48 random + winner + 8 random => winner index = length - 9
  return Math.max(0, reel.length - 9);
}

function coinIcon() {
  return (
    <span className="coin-icon stars-currency-icon" aria-hidden="true">
      <Image
        src="/currency/stars.png"
        alt=""
        width={31}
        height={31}
        unoptimized
        draggable={false}
      />
    </span>
  );
}

const APP_ICONS = {
  admin: ShieldCheck,
  award: Award,
  box: PackageOpen,
  cases: Boxes,
  check: Check,
  clock: Clock3,
  coin: Sparkles,
  copy: Copy,
  deposit: WalletCards,
  games: Gamepad2,
  gem: Gem,
  gift: Gift,
  history: History,
  home: House,
  inventory: PackageOpen,
  profile: UserRound,
  refresh: RefreshCw,
  referral: UsersRound,
  rocket: Rocket,
  send: Send,
  settings: Settings,
  shield: ShieldCheck,
  spark: Sparkles,
  swords: Swords,
  trend: TrendingUp,
  userCheck: UserCheck,
  userPlus: UserPlus,
  withdraw: ArrowDownToLine,
};

function AppIcon({ name, className = '' }) {
  const Icon = APP_ICONS[name] || Circle;

  return (
    <Icon
      className={`app-icon ${className}`.trim()}
      aria-hidden="true"
      strokeWidth={2.15}
    />
  );
}

export default function WebAppClient() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Gift Myst';

  const [tg, setTg] = useState(null);
  const [initData, setInitData] = useState('');
  const [startParam, setStartParam] = useState('');
  const [tab, setTab] = useState('home');
  const [adminTab, setAdminTab] = useState('cases');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [opening, setOpening] = useState(null);
  const [rocketRoundActive, setRocketRoundActive] = useState(false);

  const [profile, setProfile] = useState(null);
  const [telegramUser, setTelegramUser] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [cases, setCases] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [history, setHistory] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [featureSettings, setFeatureSettings] = useState({});
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminWithdrawals, setAdminWithdrawals] = useState([]);

  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [caseImageFile, setCaseImageFile] = useState(null);
  const [giftForm, setGiftForm] = useState(emptyGiftForm);
  const [giftImageFile, setGiftImageFile] = useState(null);
  const [giftAnimationFile, setGiftAnimationFile] = useState(null);
  const [userForm, setUserForm] = useState(emptyUserForm);

  const toastTimerRef = useRef(null);
  const actionLockRef = useRef(false);
  const openingLockRef = useRef(false);
  const pendingOpeningRef = useRef(null);
  const openingFallbackTimerRef = useRef(null);
  const rocketReturnTabRef = useRef('home');
  const depositReturnTabRef = useRef('home');
  const hasBootstrappedRef = useRef(false);
  const referralTrackedRef = useRef(false);
  const mountedRef = useRef(false);

  const giftsByCase = useMemo(() => groupGiftsByCase(gifts), [gifts]);
  const activeCases = useMemo(() => sortCasesForDisplay(cases.filter((item) => item.is_active !== false)), [cases]);

  const navItems = useMemo(
    () => [
      { id: 'games', icon: 'games', image: '/nav/games.svg', label: 'Games' },
      { id: 'inventory', icon: 'inventory', image: '/nav/cases.svg', label: 'Inventory' },
      { id: 'home', icon: 'home', image: '/nav/home.svg', label: 'Home' },
      { id: 'history', icon: 'history', image: '/nav/history.svg', label: 'History' },
      { id: 'referral', icon: 'referral', image: '/nav/referral.svg', label: 'Referal' },
    ],
    []
  );

  useEffect(() => {
    warmImageCacheFromData(
      '/feature/premium-arcade/rocket-premium-static-v16.png',
      '/feature/premium-arcade/pvp-premium-static-v16.png',
      '/feature/premium-arcade/rocket-launch-deck-bg-v16.webp',
      '/feature/premium-arcade/pvp-golden-arena-bg-v16.webp',
      activeCases.slice(0, 8),
      gifts.slice(0, 42),
      selectedCase ? giftsByCase[selectedCase.id] || [] : []
    );
  }, [activeCases, gifts, giftsByCase, selectedCase]);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const apiPost = useCallback(
    async (url, payload = {}, options = {}) => {
      if (!initData) {
        throw new Error("Telegram initData topilmadi. Web App'ni bot tugmasidan oching.");
      }

      const timeoutMs = Number(options.timeoutMs || 0);
      const controller =
        timeoutMs > 0 && typeof AbortController !== 'undefined'
          ? new AbortController()
          : null;
      const timeout = controller
        ? window.setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, ...payload }),
          signal: controller?.signal,
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || `Server xatosi (${response.status})`);
        }

        return data;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('Server javobi kechikdi. Qayta ulanmoqda...');
        }

        throw error;
      } finally {
        if (timeout) window.clearTimeout(timeout);
      }
    },
    [initData]
  );


  useEffect(() => {
    if (!initData) return;

    let cancelled = false;

    const loadProfilePhoto = async () => {
      try {
        const data = await apiPost('/api/profile-photo');

        if (!cancelled && data?.photoUrl) {
          setProfilePhotoUrl(data.photoUrl);
        }
      } catch (err) {
        // Telegram photo_url har doim kelmasligi mumkin. Bu xatoni UIga chiqarmaymiz.
        console.warn('Profile photo load failed:', err?.message || err);
      }
    };

    loadProfilePhoto();

    return () => {
      cancelled = true;
    };
  }, [apiPost, initData]);

  const apiFormPost = useCallback(
    async (url, formData) => {
      if (!initData) {
        throw new Error("Telegram initData topilmadi. Web App'ni bot tugmasidan oching.");
      }

      formData.append('initData', initData);

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Server xatosi (${response.status})`);
      }

      return data;
    },
    [initData]
  );

  const loadApp = useCallback(
    async ({ silent = false } = {}) => {
      if (!initData) return;

      if (!silent && !hasBootstrappedRef.current) {
        setLoading(true);
      }

      setError('');

      try {
        const data = await apiPost('/api/bootstrap');
        if (!mountedRef.current) return;

        warmImageCacheFromData(data.cases || [], data.gifts || [], data.history || []);
        setProfile(data.user);
        setTelegramUser(data.telegramUser);
        setIsAdmin(Boolean(data.isAdmin));
        setCases(data.cases || []);
        setGifts(data.gifts || []);
        setHistory(data.history || []);
        setWithdrawals(data.withdrawals || []);
        setFeatureSettings(data.featureSettings || {});

        if (data.cases?.[0]?.id) {
          setGiftForm((current) => (current.case_id ? current : { ...current, case_id: data.cases[0].id }));
        }

        hasBootstrappedRef.current = true;
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message || 'Ma’lumot yuklashda xatolik');
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [apiPost, initData]
  );

  useEffect(() => {
    mountedRef.current = true;

    let attempts = 0;
    let telegramTimer = null;

    const cleanup = () => {
      mountedRef.current = false;

      if (telegramTimer) {
        window.clearTimeout(telegramTimer);
        telegramTimer = null;
      }

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }

      if (openingFallbackTimerRef.current) {
        window.clearTimeout(openingFallbackTimerRef.current);
        openingFallbackTimerRef.current = null;
      }
    };

    const initTelegram = () => {
      if (!mountedRef.current) return;

      const app = window.Telegram?.WebApp;

      if (!app) {
        attempts += 1;

        if (attempts < 80) {
          telegramTimer = window.setTimeout(initTelegram, 50);
          return;
        }

        setLoading(false);
        setError("Telegram WebApp script yuklanmadi. Botdagi Menu Button/Main App URL aynan /webapp bo‘lishi kerak.");
        return;
      }

      try {
        app.ready();
        app.expand();
        app.MainButton?.hide?.();
        app.BackButton?.hide?.();

        setTg(app);
        setInitData(app.initData || '');
        setStartParam(getTelegramStartParam(app));
        setTelegramUser(app.initDataUnsafe?.user || null);

        if (!app.initData) {
          setLoading(false);
          setError("Telegram initData kelmadi. Web App oddiy browserda yoki noto‘g‘ri URL orqali ochilgan. BotFather’da URL: https://your-domain.vercel.app/webapp bo‘lishi kerak.");
        }
      } catch (err) {
        setLoading(false);
        setError(err.message || "Telegram WebApp ishga tushmadi.");
      }
    };

    initTelegram();

    return cleanup;
  }, []);

  useEffect(() => {
    loadApp();
  }, [loadApp]);


  useEffect(() => {
    if (!initData || !startParam || referralTrackedRef.current) return;

    const cleanStartParam = String(startParam || '').trim();

    if (!/^ref[_-]?\d+$/i.test(cleanStartParam)) return;

    referralTrackedRef.current = true;

    apiPost('/api/referral/startapp', { startParam: cleanStartParam }).catch((err) => {
      console.warn('Referral startapp track failed:', err?.message || err);
    });
  }, [apiPost, initData, startParam]);

  async function runAction(callback, successText, { silent = false } = {}) {
    if (actionLockRef.current) return null;

    actionLockRef.current = true;
    if (!silent) setBusy(true);
    setError('');

    try {
      const result = await callback();

      if (successText) showToast(successText);
      tg?.HapticFeedback?.notificationOccurred?.('success');

      return result;
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return null;
    } finally {
      actionLockRef.current = false;
      if (!silent) setBusy(false);
    }
  }

  const finalizeCaseOpening = useCallback(
    (spinKey) => {
      const completed = pendingOpeningRef.current;

      if (
        !completed ||
        completed.stage !== 'rolling' ||
        completed.spinKey !== spinKey
      ) {
        return;
      }

      pendingOpeningRef.current = null;

      if (openingFallbackTimerRef.current) {
        window.clearTimeout(openingFallbackTimerRef.current);
        openingFallbackTimerRef.current = null;
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              balance: completed.balanceAfter ?? completed.balance,
            }
          : current
      );

      setGifts((current) =>
        current.map((item) =>
          String(item.id) === String(completed.gift.id)
            ? { ...item, ...completed.gift }
            : item
        )
      );

      if (completed.history?.id) {
        setHistory((current) => [
          completed.history,
          ...current.filter(
            (item) => String(item.id) !== String(completed.history.id)
          ),
        ]);
      }

      setOpening({
        ...completed,
        stage: 'result',
      });

      openingLockRef.current = false;
      tg?.HapticFeedback?.notificationOccurred?.('success');
    },
    [tg]
  );

  async function openCase(caseItem) {
    if (!caseItem || openingLockRef.current) return;

    const caseGifts = giftsByCase[caseItem.id] || [];
    const activeGiftPool = caseGifts.filter(openableGift);

    if (activeGiftPool.length === 0) {
      setSelectedCase(caseItem);
      setError("Bu case ochilishi uchun kamida 1 ta tushadigan sovg'a kerak: real chance > 0 va stock > 0.");
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return;
    }

    if (Number(profile?.balance || 0) < Number(caseItem.price || 0)) {
      setError(`Balans yetarli emas. Kerak: ${money(caseItem.price)}`);
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return;
    }

    openingLockRef.current = true;
    pendingOpeningRef.current = null;
    setError('');

    // Home'dagi pastroqda joylashgan case tugmasidan ochilganda eski scroll
    // pozitsiyasini yangi case sahifasiga olib o'tmaslik kerak. Aks holda reel
    // tepada qoladi va foydalanuvchi opening paytida faqat gift gridni ko'radi.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    setSelectedCase(caseItem);

    setOpening({
      stage: 'preparing',
      caseItem,
      gift: null,
      reel: [],
      spinKey: Date.now(),
    });

    try {
      tg?.HapticFeedback?.impactOccurred?.('light');

      const result = await apiPost('/api/open-case', { caseId: caseItem.id });

      if (!result?.gift) {
        throw new Error('Server natija qaytarmadi. Qayta urinib ko‘ring.');
      }

      const latestGiftPool =
        Array.isArray(result.reelPool) && result.reelPool.length
          ? result.reelPool
          : activeGiftPool;

      warmImageCacheFromData(latestGiftPool, result.gift);

      const reel = buildOpeningReel(latestGiftPool, result.gift);
      const spinKey = Date.now();
      const winningIndex = getWinningIndexFromReel(reel);

      const rollingOpening = {
        stage: 'rolling',
        caseItem,
        gift: result.gift,
        reel,
        winningIndex,
        opening: result.opening,
        history: result.history || null,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        balance: result.balance,
        spinKey,
      };

      pendingOpeningRef.current = rollingOpening;
      setOpening(rollingOpening);

      tg?.HapticFeedback?.impactOccurred?.('medium');

      openingFallbackTimerRef.current = window.setTimeout(
        () => finalizeCaseOpening(spinKey),
        CASE_ROLL_FALLBACK_MS
      );
    } catch (err) {
      pendingOpeningRef.current = null;

      if (openingFallbackTimerRef.current) {
        window.clearTimeout(openingFallbackTimerRef.current);
        openingFallbackTimerRef.current = null;
      }

      setOpening(null);
      setError(err.message || 'Case ochishda xatolik yuz berdi');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      openingLockRef.current = false;
    }
  }

  async function createWithdraw(historyId) {
    await runAction(() => apiPost('/api/withdraw', { historyId }), 'Yechish so‘rovi yuborildi ✅');
    await loadApp({ silent: true });
  }

  async function sellOpeningReward(openingPayload) {
    if (!openingPayload?.gift || isBalanceReward(openingPayload.gift)) {
      showToast('Bu reward balansga avtomatik qo‘shiladi');
      return;
    }

    const historyId = openingPayload.history?.id;
    const price = giftSellPrice(openingPayload.gift);

    if (!historyId) {
      showToast('Sotish uchun history ID topilmadi. Inventorydan tekshiring.');
      return;
    }

    if (!window.confirm(sellConfirmText(openingPayload.gift))) {
      return;
    }

    const result = await runAction(
      () =>
        apiPost('/api/sell-gift', {
          historyId,
        }),
      price > 0 ? `Sotildi: ${formatPrice(price)} ⭐` : 'Sotildi ✅'
    );

    if (!result) return;

    if (result.user) {
      setProfile(result.user);
    } else if (typeof result.balance !== 'undefined') {
      setProfile((current) => (current ? { ...current, balance: result.balance } : current));
    }

    setOpening(null);
    setSelectedCase(null);
    await loadApp({ silent: true });
    setTab('inventory');
  }

  async function uploadCaseImage() {
    if (!caseImageFile) return null;

    const formData = new FormData();
    formData.append('file', caseImageFile);

    const result = await apiFormPost('/api/admin/upload-case-image', formData);
    return result.publicUrl;
  }

  async function uploadGiftAsset(file, kind = 'image') {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    const result = await apiFormPost('/api/admin/upload-gift-asset', formData);
    return result.publicUrl;
  }

  async function createCase(event) {
    event.preventDefault();

    await runAction(async () => {
      const uploadedImageUrl = await uploadCaseImage();

      return apiPost('/api/admin/case', {
        action: 'create',
        ...caseForm,
        image_url: uploadedImageUrl || caseForm.image_url || '',
      });
    }, 'Case qo‘shildi ✅');

    setCaseForm(emptyCaseForm);
    setCaseImageFile(null);
    await loadApp({ silent: true });
  }

  async function updateCase(caseItem, updates) {
    await runAction(
      () =>
        apiPost('/api/admin/case', {
          action: 'update',
          caseId: caseItem.id,
          ...updates,
        }),
      'Case yangilandi ✅'
    );

    await loadApp({ silent: true });
  }

  async function deleteCase(caseId) {
    if (!window.confirm("Case o'chirilsinmi? Ichidagi sovg'alar ham o'chadi.")) return;

    await runAction(
      () =>
        apiPost('/api/admin/case', {
          action: 'delete',
          caseId,
        }),
      "Case o'chirildi"
    );

    await loadApp({ silent: true });
  }

  async function createGift(event) {
    event.preventDefault();

    await runAction(async () => {
      const chanceNumber = Number(giftForm.chance);
      const stockNumber = Math.floor(Number(giftForm.stock));
      const cleanTitle = String(giftForm.title || '').trim();
      const currentRewardType = giftForm.type === 'balance' ? 'balance' : 'gift';
      const balanceAmount = Number(giftForm.value || 0);

      if (!giftForm.case_id) throw new Error("Avval sovg'a qaysi casega qo'shilishini tanlang.");
      if (cleanTitle.length < 2) throw new Error("Sovg'a nomini yozing.");
      if (!Number.isFinite(chanceNumber) || chanceNumber <= 0 || chanceNumber > 100) {
        throw new Error('Chance 0 dan katta va 100 dan oshmasligi kerak.');
      }
      if (!Number.isFinite(stockNumber) || stockNumber <= 0) {
        throw new Error("Stock kamida 1 bo'lishi kerak.");
      }

      if (currentRewardType === 'balance') {
        if (!Number.isFinite(balanceAmount) || balanceAmount <= 0) {
          throw new Error('Balans reward uchun summa 0 dan katta bo‘lishi kerak.');
        }
      } else if (!giftImageFile && !giftForm.image_url) {
        throw new Error("Gift reward uchun sovg'a rasmi majburiy.");
      }

      const uploadedImageUrl = currentRewardType === 'gift' ? await uploadGiftAsset(giftImageFile, 'image') : '';
      const uploadedAnimationUrl = currentRewardType === 'gift' ? await uploadGiftAsset(giftAnimationFile, 'animation') : '';
      const rarity = giftForm.rarity || giftRarity({ chance: chanceNumber });

      return apiPost('/api/admin/gift', {
        action: 'create',
        ...giftForm,
        type: currentRewardType,
        title: cleanTitle,
        value: currentRewardType === 'balance' ? String(balanceAmount) : giftForm.value,
        chance: chanceNumber,
        real_chance: Number(giftForm.real_chance || giftForm.chance || 0),
        stock: stockNumber,
        rarity,
        is_active: true,
        background_value: giftForm.background_value || defaultGiftBackground(rarity),
        image_url: currentRewardType === 'gift' ? uploadedImageUrl || giftForm.image_url || '' : giftForm.image_url || '',
        animation_url: currentRewardType === 'gift' ? uploadedAnimationUrl || giftForm.animation_url || '' : '',
      });
    }, "Sovg'a qo'shildi ✅");

    setGiftForm((current) => ({
      ...emptyGiftForm,
      case_id: current.case_id,
      type: current.type || 'gift',
      background_value: current.background_value || emptyGiftForm.background_value,
    }));
    setGiftImageFile(null);
    setGiftAnimationFile(null);
    await loadApp({ silent: true });
  }

  async function updateGift(gift, updates) {
    await runAction(
      () =>
        apiPost('/api/admin/gift', {
          action: 'update',
          giftId: gift.id,
          ...updates,
        }),
      "Sovg'a yangilandi ✅"
    );

    await loadApp({ silent: true });
  }

  async function deleteGift(giftId) {
    if (!window.confirm("Sovg'a o'chirilsinmi?")) return;

    await runAction(
      () =>
        apiPost('/api/admin/gift', {
          action: 'delete',
          giftId,
        }),
      "Sovg'a o'chirildi"
    );

    await loadApp({ silent: true });
  }

  async function loadAdminUsers() {
    try {
      const result = await apiPost('/api/admin/user', { action: 'list' });
      if (result?.users) setAdminUsers(result.users);
    } catch (err) {
      setError(err.message || 'Admin userlarni yuklashda xatolik');
    }
  }

  async function addBalance(event) {
    event.preventDefault();

    await runAction(
      () =>
        apiPost('/api/admin/user', {
          action: 'add_balance',
          ...userForm,
        }),
      'Balans yangilandi ✅'
    );

    setUserForm(emptyUserForm);
    await loadAdminUsers();
  }

  async function toggleBan(user) {
    await runAction(
      () =>
        apiPost('/api/admin/user', {
          action: 'ban',
          userId: user.id,
          is_banned: !user.is_banned,
        }),
      'User holati yangilandi ✅'
    );

    await loadAdminUsers();
  }

  async function loadAdminWithdrawals() {
    try {
      const result = await apiPost('/api/admin/withdrawals', { action: 'list' });
      if (result?.withdrawals) setAdminWithdrawals(result.withdrawals);
    } catch (err) {
      setError(err.message || 'Yechish so‘rovlarini yuklashda xatolik');
    }
  }

  async function updateWithdrawal(requestId, status) {
    await runAction(
      () =>
        apiPost('/api/admin/withdrawals', {
          action: 'update',
          requestId,
          status,
        }),
      "So'rov yangilandi ✅"
    );

    await loadAdminWithdrawals();
  }

  useEffect(() => {
    if (!isAdmin || tab !== 'profile') return;

    if (adminTab === 'users') loadAdminUsers();
    if (adminTab === 'withdrawals') loadAdminWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, isAdmin, tab]);

  const openRocketGame = useCallback((returnTab = 'home') => {
    rocketReturnTabRef.current = returnTab === 'games' ? 'games' : 'home';
    setError('');
    setOpening(null);
    setSelectedCase(null);
    setTab('rocket');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const closeRocketGame = useCallback(() => {
    setRocketRoundActive(false);
    setTab(rocketReturnTabRef.current || 'home');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const updateRocketBalance = useCallback((nextBalance) => {
    const value = Number(nextBalance);

    if (!Number.isFinite(value)) return;

    setProfile((current) => (current ? { ...current, balance: value } : current));
  }, []);

  const openDeposit = useCallback((returnTab = 'home') => {
    depositReturnTabRef.current = [
      'home',
      'games',
      'inventory',
      'history',
      'referral',
    ].includes(returnTab)
      ? returnTab
      : 'home';
    setError('');
    setOpening(null);
    setSelectedCase(null);
    setTab('deposit');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const closeDeposit = useCallback(() => {
    setTab(depositReturnTabRef.current || 'home');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  if (loading) {
    return (
      <div className="minimal-loader-screen">
        <div className="minimal-loader-bg" />
        <div className="morph-loader" aria-label="Loading">
          <div className="morph-box morph-box1" />
          <div className="morph-box morph-box2" />
          <div className="morph-box morph-box3" />
        </div>
      </div>
    );
  }

  const isCaseOpening =
    opening?.stage === 'preparing' || opening?.stage === 'rolling';
  const bottomNavActiveId = !selectedCase
    ? tab === 'rocket'
      ? 'games'
      : navItems.some((item) => item.id === tab)
        ? tab
        : 'none'
    : 'none';

  return (
    <div className="app-frame">
      <div className="app-shell">


        {toast ? <div className="toast">{toast}</div> : null}
        {error ? (
          <div className="global-alert">
            <strong>Xatolik</strong>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}>
              ×
            </button>
          </div>
        ) : null}
        {busy ? <div className="busy-indicator">Amal bajarilmoqda...</div> : null}

        {tab !== 'rocket' && tab !== 'deposit' ? (
          <GlobalBalanceBar
            telegramUser={telegramUser}
            profile={profile}
            profilePhotoUrl={profilePhotoUrl}
            onDeposit={() => openDeposit(tab)}
          />
        ) : null}

        <main
          className={`app-main ${
            selectedCase ? 'case-page-main' : ''
          } ${tab === 'rocket' ? 'rocket-game-main' : ''} ${
            tab === 'deposit' ? 'deposit-page-main' : ''
          }`}
        >
          {selectedCase ? (
            <CaseDetailPage
              caseItem={selectedCase}
              gifts={giftsByCase[selectedCase.id] || []}
              opening={
                opening && String(opening.caseItem?.id) === String(selectedCase.id)
                  ? opening
                  : null
              }
              busy={busy}
              onBack={() => {
                setOpening(null);
                setSelectedCase(null);
              }}
              onOpen={() => openCase(selectedCase)}
              onCloseResult={() => setOpening(null)}
              onSellResult={sellOpeningReward}
              onRollComplete={finalizeCaseOpening}
            />
          ) : (
            <>
              {tab === 'home' ? (
                <HomeView
                  telegramUser={telegramUser}
                  profile={profile}
                  cases={activeCases}
                  giftsByCase={giftsByCase}
                  onGoCases={() => setTab('games')}
                  onGoInventory={() => setTab('inventory')}
                  onOpenCase={openCase}
                  onSelectCase={(caseItem) => { setOpening(null); setSelectedCase(caseItem); }}
                  onOpenRocket={() => openRocketGame('home')}
                  onComingSoon={() => showToast('Tez orada 🚀')}
                  busy={busy}
                  featureSettings={featureSettings}
                />
              ) : null}

              {tab === 'games' ? (
                <CasesView
                  onGoHome={() => setTab('home')}
                  onOpenRocket={() => openRocketGame('games')}
                  onComingSoon={() => showToast('Tez orada 🚀')}
                  featureSettings={featureSettings}
                />
              ) : null}

              {tab === 'rocket' ? (
                <RocketGame
                  apiPost={apiPost}
                  profile={profile}
                  tg={tg}
                  onBack={closeRocketGame}
                  onBalanceChange={updateRocketBalance}
                  onRoundStateChange={setRocketRoundActive}
                  onToast={showToast}
                />
              ) : null}

              {tab === 'deposit' ? (
                <DepositView
                  apiPost={apiPost}
                  profile={profile}
                  tg={tg}
                  onBack={closeDeposit}
                  onBalanceChange={updateRocketBalance}
                  onToast={showToast}
                />
              ) : null}

              {tab === 'inventory' ? (
                <InventoryView
                  history={history}
                  gifts={gifts}
                  cases={cases}
                  withdrawals={withdrawals}
                  busy={busy}
                  onWithdraw={createWithdraw}
                />
              ) : null}

              {tab === 'history' ? (
                <HistoryView history={history} gifts={gifts} cases={cases} withdrawals={withdrawals} />
              ) : null}

              {tab === 'referral' ? (
                <ReferralView
                  telegramUser={telegramUser}
                  profile={profile}
                  apiPost={apiPost}
                  tg={tg}
                  onToast={showToast}
                  onBalanceChange={updateRocketBalance}
                />
              ) : null}
            </>
          )}
        </main>

        <nav
          className={liquidNavStyles.dock}
          data-active={bottomNavActiveId}
          aria-label="Bottom navigation"
        >
          <div
            className={liquidNavStyles.gamesOrb}
            data-selected={bottomNavActiveId === 'games' ? 'true' : 'false'}
          >
            <span className={liquidNavStyles.orbLens} aria-hidden="true" />
            {navItems
              .filter((item) => item.id === 'games')
              .map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={!selectedCase && (tab === item.id || tab === 'rocket')}
                  disabled={isCaseOpening || rocketRoundActive}
                  onClick={() => {
                    if (isCaseOpening || rocketRoundActive) return;
                    setOpening(null);
                    setSelectedCase(null);
                    setTab(item.id);
                  }}
                  mobile
                />
              ))}
          </div>

          <div className={liquidNavStyles.nav} data-active={bottomNavActiveId}>
            <span className={liquidNavStyles.selectionLens} aria-hidden="true" />
            {navItems
              .filter((item) => item.id !== 'games')
              .map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={!selectedCase && tab === item.id}
                  disabled={isCaseOpening || rocketRoundActive}
                  onClick={() => {
                    if (isCaseOpening || rocketRoundActive) return;
                    setOpening(null);
                    setSelectedCase(null);
                    setTab(item.id);
                  }}
                  mobile
                />
              ))}
          </div>
        </nav>

      </div>
    </div>
  );
}

function Brand({ appName }) {
  return (
    <div className="brand">
      <strong>{appName}</strong>
      <span>Premium case opening</span>
    </div>
  );
}

function BalancePill({ balance }) {
  return (
    <div className="balance-pill">
      {coinIcon()}
      <strong>{formatPrice(balance)}</strong>
    </div>
  );
}


function GlobalBalanceBar({
  telegramUser,
  profile,
  profilePhotoUrl,
  onDeposit,
}) {
  const avatarUrl = profilePhotoUrl || telegramUser?.photo_url || '';

  return (
    <div className="global-balance-stabilizer">
      <div className="home-hero premium-card global-balance-bar">
        <div className="home-hero-bg" aria-hidden="true" />

        <div className="home-user-zone">
          <div className="home-avatar-wrap">
            <div className={`home-avatar ${avatarUrl ? 'has-photo' : ''}`}>
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  draggable={false}
                />
              ) : (
                telegramUser?.first_name?.[0] || 'U'
              )}
            </div>
          </div>

          <div className="home-balance-copy" aria-label="Balance">
            <strong>
              {coinIcon()}
              {formatPrice(profile?.balance)}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="deposit-button"
          aria-label="Deposit"
          onClick={onDeposit}
        >
          <AppIcon name="deposit" />
          <span>Deposit</span>
        </button>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick, mobile = false, disabled = false }) {
  const preventIconMenu = (event) => {
    event.preventDefault();
    return false;
  };

  const buttonClassName = mobile
    ? [
        liquidNavStyles.item,
        active ? liquidNavStyles.active : '',
        item.center ? liquidNavStyles.center : '',
      ]
        .filter(Boolean)
        .join(' ')
    : `nav-button ${active ? 'active' : ''} ${item.center ? 'center-home' : ''}`;
  const iconWrapClassName = mobile ? liquidNavStyles.iconWrap : 'nav-icon-wrap';
  const iconClassName = mobile ? liquidNavStyles.icon : 'nav-icon-img';
  const labelClassName = mobile ? liquidNavStyles.label : undefined;
  const homeDotClassName = mobile ? liquidNavStyles.homeDot : 'home-glow-dot';

  return (
    <button
      type="button"
      className={buttonClassName}
      onClick={onClick}
      disabled={disabled}
      onContextMenu={preventIconMenu}
      data-nav={item.id}
      aria-current={active ? 'page' : undefined}
    >
      <span className={iconWrapClassName} onContextMenu={preventIconMenu}>
        {item.image ? (
          <Image
            className={iconClassName}
            src={item.image}
            alt=""
            width={32}
            height={32}
            priority
            unoptimized
            draggable={false}
            aria-hidden="true"
            onContextMenu={preventIconMenu}
          />
        ) : (
          <AppIcon name={item.icon} />
        )}
      </span>
      <strong className={labelClassName}>{item.label}</strong>
      {item.center ? <em className={homeDotClassName} /> : null}
    </button>
  );
}

function PromoImageCard({
  variant,
  image,
  badge,
  title,
  actionText,
  onClick,
}) {
  const [failed, setFailed] = useState(false);
  const isPvp = variant === 'pvp';
  const accessibleAction = actionText ? `, ${actionText}` : '';

  return (
    <button
      type="button"
      className={`${gameCardStyles.heroCard} ${gameCardStyles[variant]} ${failed ? gameCardStyles.imageFailed : ''}`}
      onClick={onClick}
      aria-label={`${title}, ${badge}${accessibleAction}`}
    >
      {!failed && image ? (
        <Image
          src={image}
          alt=""
          className={gameCardStyles.completeCardArt}
          width={768}
          height={1152}
          sizes="(max-width: 590px) 46vw, 240px"
          priority
          unoptimized
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={gameCardStyles.fallbackCard} aria-hidden="true">
          <AppIcon name={isPvp ? 'swords' : 'rocket'} />
          <strong>{title}</strong>
          <em>{badge}</em>
        </span>
      )}
    </button>
  );
}

function HomeView({
  telegramUser,
  profile,
  cases,
  giftsByCase,
  onGoCases,
  onGoInventory,
  onOpenCase,
  onSelectCase,
  onOpenRocket,
  onComingSoon,
  busy,
}) {
  const featuredCases = cases || [];

  const showComingSoon = () => {
    if (typeof onComingSoon === 'function') {
      onComingSoon();
    }
  };

  return (
    <section className="home-view premium-home">
      <div className={gameCardStyles.stack}>
        <PromoImageCard
          variant="rocket"
          image="/feature/giftmyst-complete-v39/rocket-card-live-transparent-v39.webp"
          badge="LIVE"
          title="ROCKET"
          actionText="Play"
          onClick={onOpenRocket}
        />

        <PromoImageCard
          variant="pvp"
          image="/feature/giftmyst-complete-v39/pvp-card-duel-transparent-v39.webp"
          badge="DUEL"
          title="PVP"
          actionText="Tez orada"
          onClick={showComingSoon}
        />
      </div>

      <div className={gameCardStyles.actionsGrid}>
        <button type="button" className={`${gameCardStyles.actionCard} ${gameCardStyles.contracts}`} onClick={onGoCases}>
          <span className={gameCardStyles.actionIcon}>
            <AppIcon name="box" />
          </span>
          <span className={gameCardStyles.actionCopy}>
            <strong>CONTRACTS</strong>
            <small>Open cases</small>
          </span>
          <b className={gameCardStyles.actionChevron} aria-hidden="true">›</b>
        </button>

        <button type="button" className={`${gameCardStyles.actionCard} ${gameCardStyles.upgrade}`} onClick={onGoInventory}>
          <span className={gameCardStyles.actionIcon}>
            <AppIcon name="spark" />
          </span>
          <span className={gameCardStyles.actionCopy}>
            <strong>UPGRADE</strong>
            <small>Boost items</small>
          </span>
          <b className={gameCardStyles.actionChevron} aria-hidden="true">›</b>
        </button>
      </div>

      <div className="cases-section">
        <div className="section-title-row cases-title-only">
          <div>
            <AppIcon name="cases" />
            <h2>Cases</h2>
          </div>
        </div>

        {featuredCases.length === 0 ? (
          <EmptyState
            icon="box"
            title="Case hali qo‘shilmagan"
            text="Admin paneldan Rocket, PVP yoki boshqa case qo‘shing."
          />
        ) : (
          <div className="cases-grid premium-cases-grid">
            {featuredCases.map((caseItem) => (
              <CaseCard
                key={caseItem.id}
                caseItem={caseItem}
                gifts={giftsByCase[caseItem.id] || []}
                busy={busy}
                onOpen={onOpenCase}
                onDetails={onSelectCase}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CasesView({ onGoHome, onOpenRocket, onComingSoon }) {
  return (
    <section className="screen-stack">
      <div className="page-header premium-card games-page-header">
        <button type="button" className="ghost-back" onClick={onGoHome}>
          ‹ Home
        </button>
        <h1>Games</h1>
        <p>Stavkani tanlang va raketa portlashidan oldin yutuqni oling.</p>
      </div>

      <div className={`${gameCardStyles.stack} ${gameCardStyles.gamesStack}`}>
        <PromoImageCard
          variant="rocket"
          image="/feature/giftmyst-complete-v39/rocket-card-live-transparent-v39.webp"
          badge="LIVE"
          title="ROCKET"
          actionText="Play"
          onClick={onOpenRocket}
        />

        <PromoImageCard
          variant="pvp"
          image="/feature/giftmyst-complete-v39/pvp-card-duel-transparent-v39.webp"
          badge="DUEL"
          title="PVP"
          actionText="Tez orada"
          onClick={onComingSoon}
        />
      </div>
    </section>
  );
}

function CaseCard({ caseItem, gifts, busy, onOpen, onDetails }) {
  const accent = caseAccent(caseItem);
  const badge = caseBadgeText(caseItem, gifts);
  const badgeColor = caseBadgeColor(caseItem);
  const readyCount = gifts.filter(eligibleGift).length;
  const disabled = busy || readyCount === 0;
  const isFree = Number(caseItem.price || 0) === 0;
  const buttonText = isFree ? 'FREE' : formatPrice(caseItem.price);

  return (
    <article
      className={`${caseOpeningStyles.caseTile} ${
        disabled ? caseOpeningStyles.caseTileDisabled : ''
      }`}
      style={{
        '--case-accent': accent,
        '--case-badge': badgeColor,
      }}
    >
      <button
        type="button"
        className={caseOpeningStyles.caseTileDetails}
        aria-label={`${caseItem.title} case tafsilotlari`}
        onClick={() => onDetails(caseItem)}
      />

      <div className={caseOpeningStyles.caseTileMedia}>
        <span className={caseOpeningStyles.caseTileHalo} aria-hidden="true" />

        {caseItem.image_url ? (
          <img
            className={caseOpeningStyles.caseTileImage}
            src={caseItem.image_url}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className={caseOpeningStyles.caseTileFallback}>
            <AppIcon name="box" />
          </span>
        )}

        {badge ? (
          <span className={caseOpeningStyles.caseTileBadge}>{badge}</span>
        ) : null}
      </div>

      <div className={caseOpeningStyles.caseTileFooter}>
        <div className={caseOpeningStyles.caseTileCopy}>
          <h3>{caseItem.title}</h3>
          <p>{readyCount || gifts.length || 0} rewards</p>
        </div>

        <button
          type="button"
          className={caseOpeningStyles.caseTileOpen}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(caseItem);
          }}
        >
          <AppIcon name="gift" />
          <span>{buttonText}</span>
        </button>
      </div>
    </article>
  );
}



function isImageAnimationUrl(url = '') {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();

  return (
    cleanUrl.endsWith('.webp') ||
    cleanUrl.endsWith('.gif') ||
    cleanUrl.endsWith('.png') ||
    cleanUrl.endsWith('.jpg') ||
    cleanUrl.endsWith('.jpeg') ||
    cleanUrl.includes('/manual-gifts/webp/')
  );
}

function isTgsAnimationUrl(url = '') {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.tgs') || cleanUrl.includes('/telegram/animations/');
}

const tgsDataCache = new Map();
const tgsPreviewCache = new Map();

function loadTgsData(src) {
  if (!tgsDataCache.has(src)) {
    tgsDataCache.set(src, fetch(`/api/gift-animation?url=${encodeURIComponent(src)}`, { cache: 'force-cache' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload.animationData) throw new Error(payload?.error || `TGS download failed: ${response.status}`);
        return payload.animationData;
      })
      .catch((error) => { tgsDataCache.delete(src); throw error; }));
  }
  return tgsDataCache.get(src);
}

async function createTgsPreview(src) {
  if (!tgsPreviewCache.has(src)) {
    tgsPreviewCache.set(src, (async () => {
      const [{ default: lottie }, animationData] = await Promise.all([import('lottie-web'), loadTgsData(src)]);
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', left: '-9999px', top: '-9999px', width: '180px', height: '180px', opacity: '0', pointerEvents: 'none' });
      document.body.appendChild(host);
      const animation = lottie.loadAnimation({ container: host, renderer: 'svg', loop: false, autoplay: false, animationData });
      try {
        await new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error('Preview timeout')), 6000);
          animation.addEventListener('DOMLoaded', () => { window.clearTimeout(timer); resolve(); });
          animation.addEventListener('data_failed', () => { window.clearTimeout(timer); reject(new Error('Preview failed')); });
        });
        animation.goToAndStop(0, true);
        const svg = host.querySelector('svg');
        if (!svg) throw new Error('Preview SVG topilmadi');
        return URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
      } finally { animation.destroy(); host.remove(); }
    })().catch((error) => { tgsPreviewCache.delete(src); throw error; }));
  }
  return tgsPreviewCache.get(src);
}

function TelegramTgsAnimation({ src, className, animate = false }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    let animation = null;
    let cancelled = false;

    async function loadAnimation() {
      try {
        setFailed(false);
        if (!animate) {
          const url = await createTgsPreview(src);
          if (!cancelled) setPreviewUrl(url);
          return;
        }
        const [{ default: lottie }, animationData] = await Promise.all([import('lottie-web'), loadTgsData(src)]);

        if (cancelled || !containerRef.current) return;

        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData,
        });
      } catch (error) {
        console.warn('TGS animation failed:', error?.message || error);
        if (!cancelled) setFailed(true);
      }
    }

    loadAnimation();

    return () => {
      cancelled = true;
      if (animation) {
        animation.destroy();
      }
    };
  }, [src, animate]);

  return (
    <span className={`${className} tgs-gift-media`}>
      {previewUrl && !animate ? <img src={previewUrl} className="tgs-static-preview" alt="" draggable="false" /> : null}
      {animate ? <span ref={containerRef} className="tgs-gift-canvas" /> : null}
      {failed ? <AppIcon name="gift" /> : null}
    </span>
  );
}

function GiftMedia({ gift, compact = false, preferStatic = false, animate = false }) {
  const mediaClass = compact ? 'gift-media compact' : 'gift-media';

  if (!gift) {
    return (
      <span className={mediaClass}>
        <AppIcon name="gift" />
      </span>
    );
  }

  if (isBalanceReward(gift)) {
    return (
      <span className={`${mediaClass} balance-reward`}>
        {coinIcon()}
      </span>
    );
  }

  const imageUrl = gift.image_url || gift.png_url || gift.webp_url || '';
  const animationUrl = gift.animation_url || '';

  if (imageUrl) {
    return (
      <img
        className={`${mediaClass} gift-media-visual`}
        src={imageUrl}
        alt=""
        loading={preferStatic ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={preferStatic ? 'high' : 'auto'}
        draggable="false"
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        aria-hidden="true"
      />
    );
  }

  if (animationUrl && isTgsAnimationUrl(animationUrl)) {
    return <TelegramTgsAnimation src={animationUrl} className={mediaClass} animate={animate} />;
  }

  if (animationUrl && isImageAnimationUrl(animationUrl)) {
    return <img className={`${mediaClass} gift-media-visual`} src={animationUrl} alt="" loading="lazy" decoding="async" draggable="false" aria-hidden="true" />;
  }

  return (
    <span className={mediaClass}>
      <AppIcon name="gift" />
    </span>
  );
}

function InventoryView({ history, gifts, cases, withdrawals, busy, onWithdraw }) {
  const wins = history.map((item) => {
    const gift = gifts.find((giftItem) => String(giftItem.id) === String(item.gift_id));
    const caseItem = cases.find((caseValue) => String(caseValue.id) === String(item.case_id));
    const request = withdrawals.find((withdraw) => String(withdraw.gift_id) === String(item.gift_id));
    const isSold = Boolean(item.sold_at);
    return { item, gift, caseItem, request, isSold };
  });

  return (
    <section className="screen-stack">
      <div className="page-header premium-card">
        <h1>Inventory</h1>
        <p>Yutgan gift rewardlar shu yerda. Balance reward esa avtomatik balansga qo‘shiladi.</p>
      </div>

      {wins.length === 0 ? (
        <EmptyState icon="inventory" title="Inventory bo‘sh" text="Case ochib, sovg‘a yuting." />
      ) : (
        <div className="inventory-list">
          {wins.map(({ item, gift, caseItem, request, isSold }) => (
            <div className="inventory-card premium-card" key={item.id}>
              <GiftMedia gift={gift} />
              <div>
                <span className={`status-badge ${isSold ? 'sold' : request?.status || 'available'}`}>
                  {isSold ? 'sold' : request?.status || 'available'}
                </span>
                <h3>{gift?.title || 'Sovg‘a'}</h3>
                <p>
                  {caseItem?.title || 'Case'} · {rewardSubtitle(gift)} ·{' '}
                  {item.created_at ? new Date(item.created_at).toLocaleString('uz-UZ') : ''}
                </p>
              </div>
              {isBalanceReward(gift) ? (
                <button type="button" disabled className="ghost-btn">
                  Balansga qo‘shilgan
                </button>
              ) : isSold ? (
                <button type="button" disabled className="ghost-btn">
                  Sotilgan
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busy || Boolean(request)}
                  onClick={() => onWithdraw(item.gift_id)}
                >
                  <AppIcon name="withdraw" /> {request ? 'So‘rov yuborilgan' : 'Yechish'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryView({ history, gifts, cases, withdrawals }) {
  const rows = history.map((item) => {
    const gift = gifts.find((giftItem) => String(giftItem.id) === String(item.gift_id));
    const caseItem = cases.find((caseValue) => String(caseValue.id) === String(item.case_id));
    const request = withdrawals.find((withdraw) => String(withdraw.gift_id) === String(item.gift_id));
    const isSold = Boolean(item.sold_at);
    return { item, gift, caseItem, request, isSold };
  });

  return (
    <section className="screen-stack">
      <div className="page-header premium-card">
        <h1>History</h1>
        <p>Case ochish tarixi va yutuqlar.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="history" title="History bo‘sh" text="Birinchi case’ni oching." />
      ) : (
        <div className="activity-list">
          {rows.map(({ item, gift, caseItem, request, isSold }) => (
            <div className="activity-row premium-card" key={item.id}>
              <GiftMedia gift={gift} compact preferStatic />
              <div>
                <strong>{gift?.title || 'Sovg‘a'}</strong>
                <span>
                  {caseItem?.title || 'Case'} · {rewardSubtitle(gift)} ·{' '}
                  {item.created_at ? new Date(item.created_at).toLocaleString('uz-UZ') : ''}
                </span>
              </div>
              {isSold ? <span className="status-badge sold">sold</span> : request ? <span className={`status-badge ${request.status}`}>{request.status}</span> : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function referralDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function referralStatus(status) {
  const value = String(status || 'joined').toLowerCase();

  if (value === 'rewarded') {
    return { label: 'Bonus berildi', icon: 'check', className: 'is-rewarded' };
  }

  if (value === 'active') {
    return { label: 'Faol', icon: 'userCheck', className: 'is-active' };
  }

  return { label: 'Kutilmoqda', icon: 'clock', className: 'is-pending' };
}

function ReferralView({ telegramUser, profile, apiPost, tg, onToast, onBalanceChange }) {
  const [copied, setCopied] = useState(false);
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [refreshingOverview, setRefreshingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'GiftMystBot').replace('@', '');
  const userId = telegramUser?.id || profile?.id || '';
  const referralCode = userId ? `ref_${userId}` : 'ref';
  const referralLink = buildStartAppLink(botUsername, referralCode);
  const inviterReward = Number(overview?.settings?.inviterReward || 0);
  const inviteeReward = Number(overview?.settings?.inviteeReward || 0);
  const shareText = inviteeReward > 0
    ? `Gift Mystga qo‘shiling — faol bo‘lsangiz ${formatPrice(inviteeReward)} Stars bonus olasiz 🎁`
    : 'Gift Mystga qo‘shiling va sovg‘alar yuting 🎁';
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`;
  const stats = overview?.stats || {
    total: 0,
    active: 0,
    pending: 0,
    earned: 0,
    conversionRate: 0,
  };
  const friends = overview?.friends || [];
  const conversionRate = Math.min(100, Math.max(0, Number(stats.conversionRate || 0)));

  const loadOverview = useCallback(
    async ({ silent = false } = {}) => {
      if (!apiPost) return;

      if (silent) {
        setRefreshingOverview(true);
      } else {
        setLoadingOverview(true);
      }

      try {
        const data = await apiPost('/api/referral/overview', {}, { timeoutMs: 8_000 });
        setOverview(data.referral || null);
        onBalanceChange?.(data.referral?.balance);
        setOverviewError('');
      } catch (error) {
        setOverviewError(error?.message || 'Referal statistikasi yuklanmadi.');
      } finally {
        setLoadingOverview(false);
        setRefreshingOverview(false);
      }
    },
    [apiPost, onBalanceChange]
  );

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      if (cancelled) return;
      await loadOverview();
    };

    initialLoad();

    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) loadOverview({ silent: true });
    }, 30_000);

    const handleVisibility = () => {
      if (!document.hidden) loadOverview({ silent: true });
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadOverview]);

  const copyReferral = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = referralLink;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      setCopied(true);
      onToast?.('Referal link nusxalandi ✅');
      tg?.HapticFeedback?.notificationOccurred?.('success');
      window.setTimeout(() => setCopied(false), 1700);
    } catch {
      setCopied(false);

      if (typeof tg?.openTelegramLink === 'function') {
        tg.openTelegramLink(shareLink);
      } else {
        window.open(shareLink, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const shareReferral = () => {
    tg?.HapticFeedback?.impactOccurred?.('light');

    if (typeof tg?.openTelegramLink === 'function') {
      tg.openTelegramLink(shareLink);
      return;
    }

    window.open(shareLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="screen-stack referral-view" aria-busy={loadingOverview}>
      <header className="referral-page-head">
        <h1>Referal</h1>
      </header>

      <article className="referral-reward-card premium-card">
        <div className="referral-reward-top">
          <div className="referral-reward-copy">
            <h2>Do‘stlaringiz bilan yuting</h2>
            <strong className="referral-reward-amount">
              {loadingOverview ? '—' : `+${formatPrice(inviterReward)}`}
              <span>Stars</span>
            </strong>
            <span className="referral-invitee-chip">
              {coinIcon()}
              <span>
                Do‘stingizga <strong>{loadingOverview ? '—' : `+${formatPrice(inviteeReward)} Stars`}</strong>
              </span>
            </span>
          </div>

          <div className="referral-reward-art" aria-hidden="true">
            <Image
              src="/referral/referral-reward-hero.png"
              alt=""
              width={1024}
              height={1024}
              priority
              draggable={false}
            />
          </div>
        </div>

        <button type="button" className="referral-primary-share" onClick={shareReferral}>
          <AppIcon name="send" />
          <span>Telegramda ulashish</span>
        </button>

        <button
          type="button"
          className={`referral-inline-link${copied ? ' is-copied' : ''}`}
          onClick={copyReferral}
          aria-label={copied ? 'Referal link nusxalandi' : 'Referal linkni nusxalash'}
        >
          <span>{referralLink}</span>
          <AppIcon name={copied ? 'check' : 'copy'} />
        </button>
      </article>

      <section className="referral-overview-card premium-card" aria-label="Referal statistikasi">
        <article className="referral-overview-stat">
          <span>Takliflar</span>
          <strong>{loadingOverview ? '—' : money(stats.total)}</strong>
        </article>

        <article className="referral-overview-stat">
          <span>Faol</span>
          <strong>{loadingOverview ? '—' : money(stats.active)}</strong>
        </article>

        <article className="referral-overview-stat is-earned">
          <span>Yig‘ilgan</span>
          <div>{coinIcon()}<strong>{loadingOverview ? '—' : formatPrice(stats.earned)}</strong></div>
        </article>

        <article className="referral-overview-rate">
          <div
            className="referral-progress-ring"
            style={{ '--referral-rate': `${loadingOverview ? 0 : conversionRate}%` }}
          >
            <span>
              <strong>{loadingOverview ? '—' : `${conversionRate.toFixed(0)}%`}</strong>
              <small>faollik</small>
            </span>
          </div>
        </article>
      </section>

      <section className="referral-friends-section">
        <div className="referral-friends-head">
          <h2>Do‘stlaringiz</h2>
          <button
            type="button"
            className="referral-refresh-btn"
            onClick={() => loadOverview({ silent: true })}
            disabled={refreshingOverview}
            aria-label="Statistikani yangilash"
          >
            <AppIcon name="refresh" className={refreshingOverview ? 'is-spinning' : ''} />
          </button>
        </div>

        {overviewError ? (
          <div className="referral-load-error">
            <AppIcon name="clock" />
            <div><strong>Statistika yuklanmadi</strong><span>{overviewError}</span></div>
            <button type="button" onClick={() => loadOverview()}>Qayta urinish</button>
          </div>
        ) : loadingOverview ? (
          <div className="referral-skeleton-list" aria-label="Statistika yuklanmoqda">
            {[0, 1, 2].map((item) => <span key={item} />)}
          </div>
        ) : friends.length ? (
          <div className="referral-friends-list">
            {friends.map((friend) => {
              const status = referralStatus(friend.status);
              const displayName = friend.firstName || (friend.username ? `@${friend.username}` : `User ${friend.userId}`);
              const initial = String(displayName || '?').replace('@', '').slice(0, 1).toUpperCase();

              return (
                <article className="referral-friend-row" key={friend.id || friend.userId}>
                  <span className="referral-friend-avatar">{initial}</span>
                  <div className="referral-friend-copy">
                    <strong>{displayName}</strong>
                    <span>{friend.username && friend.firstName ? `@${friend.username} · ` : ''}{referralDate(friend.joinedAt)}</span>
                  </div>
                  <div className={`referral-friend-status ${status.className}`}>
                    <span><AppIcon name={status.icon} /> {status.label}</span>
                    {Number(friend.rewardAmount || 0) > 0 ? <strong>+{formatPrice(friend.rewardAmount)} ★</strong> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="referral-empty-friends">
            <span><AppIcon name="userPlus" /></span>
            <strong>Hali taklif yo‘q</strong>
            <p>Linkni yuboring — birinchi do‘stingiz shu yerda ko‘rinadi.</p>
            <button type="button" onClick={shareReferral}><AppIcon name="send" /> Linkni ulashish</button>
          </div>
        )}
      </section>

      <div className="referral-flow" aria-label="Referal dasturi uch bosqichi">
        <article>
          <b>1</b>
          <span>Ulashish</span>
        </article>
        <article>
          <b>2</b>
          <span>Qo‘shilish</span>
        </article>
        <article>
          <b>3</b>
          <span>Bonus</span>
        </article>
      </div>
    </section>
  );
}

function ProfileView({
  telegramUser,
  profile,
  isAdmin,
  adminTab,
  setAdminTab,
  adminUsers,
  adminWithdrawals,
  cases,
  gifts,
  caseForm,
  setCaseForm,
  setCaseImageFile,
  giftForm,
  setGiftForm,
  setGiftImageFile,
  setGiftAnimationFile,
  userForm,
  setUserForm,
  createCase,
  updateCase,
  deleteCase,
  createGift,
  updateGift,
  deleteGift,
  addBalance,
  toggleBan,
  updateWithdrawal,
  busy,
}) {
  return (
    <section className="screen-stack">
      <div className="profile-card premium-card">
        <div className="home-avatar">
          {telegramUser?.first_name?.[0] || 'U'}
        </div>
        <div>
          <h1>{telegramUser?.first_name || 'Telegram user'}</h1>
          <p>{telegramUser?.username ? `@${telegramUser.username}` : `ID: ${telegramUser?.id || profile?.id || '-'}`}</p>
          <strong>{money(profile?.balance)} balance</strong>
        </div>
      </div>

      {isAdmin ? (
        <AdminPanel
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          adminUsers={adminUsers}
          adminWithdrawals={adminWithdrawals}
          cases={cases}
          gifts={gifts}
          caseForm={caseForm}
          setCaseForm={setCaseForm}
          setCaseImageFile={setCaseImageFile}
          giftForm={giftForm}
          setGiftForm={setGiftForm}
          setGiftImageFile={setGiftImageFile}
          setGiftAnimationFile={setGiftAnimationFile}
          userForm={userForm}
          setUserForm={setUserForm}
          createCase={createCase}
          updateCase={updateCase}
          deleteCase={deleteCase}
          createGift={createGift}
          updateGift={updateGift}
          deleteGift={deleteGift}
          addBalance={addBalance}
          toggleBan={toggleBan}
          updateWithdrawal={updateWithdrawal}
          busy={busy}
        />
      ) : (
        <EmptyState icon="profile" title="Profile" text="Admin panel faqat adminlarga ko‘rinadi." />
      )}
    </section>
  );
}

function AdminPanel({
  adminTab,
  setAdminTab,
  adminUsers,
  adminWithdrawals,
  cases,
  gifts,
  caseForm,
  setCaseForm,
  setCaseImageFile,
  giftForm,
  setGiftForm,
  setGiftImageFile,
  setGiftAnimationFile,
  userForm,
  setUserForm,
  createCase,
  updateCase,
  deleteCase,
  createGift,
  updateGift,
  deleteGift,
  addBalance,
  toggleBan,
  updateWithdrawal,
  busy,
}) {
  return (
    <div className="admin-panel premium-card">
      <div className="admin-tabs">
        {['cases', 'gifts', 'users', 'withdrawals'].map((item) => (
          <button
            key={item}
            type="button"
            className={adminTab === item ? 'active' : ''}
            onClick={() => setAdminTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {adminTab === 'cases' ? (
        <div className="admin-section">
          <form className="admin-form" onSubmit={createCase}>
            <h2>Case qo‘shish</h2>
            <label className="field">
              <span>Title</span>
              <input value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} required />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea value={caseForm.description} onChange={(event) => setCaseForm({ ...caseForm, description: event.target.value })} />
            </label>
            <label className="field">
              <span>Price</span>
              <input type="number" value={caseForm.price} onChange={(event) => setCaseForm({ ...caseForm, price: event.target.value })} />
            </label>
            <label className="field">
              <span>Badge</span>
              <input value={caseForm.badge_text} onChange={(event) => setCaseForm({ ...caseForm, badge_text: event.target.value })} placeholder="HOT, NEW, LIMITED" />
            </label>
            <label className="field">
              <span>Image URL</span>
              <input value={caseForm.image_url} onChange={(event) => setCaseForm({ ...caseForm, image_url: event.target.value })} />
            </label>
            <label className="field">
              <span>Upload image</span>
              <input type="file" accept="image/*" onChange={(event) => setCaseImageFile(event.target.files?.[0] || null)} />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>Create case</button>
          </form>

          <AdminList title="Existing cases">
            {cases.map((caseItem) => (
              <div className="admin-item" key={caseItem.id}>
                <div className="admin-item-main">
                  <strong>{caseItem.title}</strong>
                  <span>{money(caseItem.price)} · {caseItem.is_active === false ? 'hidden' : 'active'}</span>
                </div>
                <button type="button" onClick={() => updateCase(caseItem, { is_active: caseItem.is_active === false })}>
                  {caseItem.is_active === false ? 'Show' : 'Hide'}
                </button>
                <button type="button" className="danger-btn" onClick={() => deleteCase(caseItem.id)}>Delete</button>
              </div>
            ))}
          </AdminList>
        </div>
      ) : null}

      {adminTab === 'gifts' ? (
        <div className="admin-section">
          <form className="admin-form" onSubmit={createGift}>
            <h2>Gift qo‘shish</h2>
            <label className="field">
              <span>Case</span>
              <select value={giftForm.case_id} onChange={(event) => setGiftForm({ ...giftForm, case_id: event.target.value })} required>
                <option value="">Case tanlang</option>
                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>{caseItem.title}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Title</span>
              <input value={giftForm.title} onChange={(event) => setGiftForm({ ...giftForm, title: event.target.value })} required />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={giftForm.type} onChange={(event) => setGiftForm({ ...giftForm, type: event.target.value })}>
                <option value="gift">Gift</option>
                <option value="balance">Balance</option>
              </select>
            </label>
            <label className="field">
              <span>Value</span>
              <input value={giftForm.value} onChange={(event) => setGiftForm({ ...giftForm, value: event.target.value })} placeholder="Balance amount yoki gift code" />
            </label>
            <label className="field">
              <span>Chance</span>
              <input type="number" value={giftForm.chance} onChange={(event) => setGiftForm({ ...giftForm, chance: event.target.value })} />
            </label>
            <label className="field">
              <span>Stock</span>
              <input type="number" value={giftForm.stock} onChange={(event) => setGiftForm({ ...giftForm, stock: event.target.value })} />
            </label>
            <label className="field">
              <span>Image URL</span>
              <input value={giftForm.image_url} onChange={(event) => setGiftForm({ ...giftForm, image_url: event.target.value })} />
            </label>
            <label className="field">
              <span>Upload image</span>
              <input type="file" accept="image/*" onChange={(event) => setGiftImageFile(event.target.files?.[0] || null)} />
            </label>
            <label className="field">
              <span>Upload animation</span>
              <input type="file" accept="video/*,image/gif" onChange={(event) => setGiftAnimationFile(event.target.files?.[0] || null)} />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>Create gift</button>
          </form>

          <AdminList title="Existing gifts">
            {gifts.map((gift) => (
              <div className="admin-item" key={gift.id}>
                <GiftMedia gift={gift} compact preferStatic />
                <div className="admin-item-main">
                  <strong>{gift.title}</strong>
                  <span>{gift.type} · chance {visibleChance(gift)}% · stock {gift.stock}</span>
                </div>
                <button type="button" onClick={() => updateGift(gift, { is_active: gift.is_active === false })}>
                  {gift.is_active === false ? 'Show' : 'Hide'}
                </button>
                <button type="button" className="danger-btn" onClick={() => deleteGift(gift.id)}>Delete</button>
              </div>
            ))}
          </AdminList>
        </div>
      ) : null}

      {adminTab === 'users' ? (
        <div className="admin-section">
          <form className="admin-form" onSubmit={addBalance}>
            <h2>User balance</h2>
            <label className="field">
              <span>User ID</span>
              <input value={userForm.userId} onChange={(event) => setUserForm({ ...userForm, userId: event.target.value })} required />
            </label>
            <label className="field">
              <span>Amount</span>
              <input type="number" value={userForm.amount} onChange={(event) => setUserForm({ ...userForm, amount: event.target.value })} required />
            </label>
            <button className="primary-btn" type="submit" disabled={busy}>Add balance</button>
          </form>

          <AdminList title="Users">
            {adminUsers.map((user) => (
              <div className="admin-item" key={user.id}>
                <div className="admin-item-main">
                  <strong>{user.first_name || user.username || user.id}</strong>
                  <span>ID: {user.id} · {money(user.balance)} balance</span>
                </div>
                <button type="button" onClick={() => toggleBan(user)}>
                  {user.is_banned ? 'Unban' : 'Ban'}
                </button>
              </div>
            ))}
          </AdminList>
        </div>
      ) : null}

      {adminTab === 'withdrawals' ? (
        <div className="admin-section">
          <AdminList title="Withdraw requests">
            {adminWithdrawals.map((request) => (
              <div className="admin-item" key={request.id}>
                <div className="admin-item-main">
                  <strong>{request.gifts?.title || 'Gift request'}</strong>
                  <span>User: {request.user_id} · {request.status}</span>
                </div>
                <button type="button" disabled={request.status !== 'pending'} onClick={() => updateWithdrawal(request.id, 'approved')}>Approve</button>
                <button type="button" disabled={request.status !== 'pending'} className="danger-btn" onClick={() => updateWithdrawal(request.id, 'rejected')}>Reject</button>
              </div>
            ))}
          </AdminList>
        </div>
      ) : null}
    </div>
  );
}

function AdminList({ title, children }) {
  return (
    <div className="admin-list">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function InlineRaffleRoller({ opening, idleGifts, targetIndex = 0, onRollComplete }) {
  const trackRef = useRef(null);
  const finalDistanceRef = useRef(null);
  const completedSpinRef = useRef(null);
  const [rollerStyle, setRollerStyle] = useState({
    '--raffle-x': '0px',
    '--raffle-transition': 'none',
  });

  const isLive =
    opening?.stage === 'rolling' || opening?.stage === 'result';
  const isResult = opening?.stage === 'result';
  const isRolling = opening?.stage === 'rolling';
  const isPreparing = opening?.stage === 'preparing';
  const reel = isLive ? opening.reel : idleGifts;

  const measureCardDistance = useCallback((index) => {
    const track = trackRef.current;
    const viewport = track?.parentElement;
    const card = track?.children?.[index];

    if (!track || !viewport || !card) return 0;

    return Math.max(
      0,
      card.offsetLeft +
        card.offsetWidth / 2 -
        viewport.clientWidth / 2
    );
  }, []);

  useLayoutEffect(() => {
    let firstFrame = null;
    let secondFrame = null;

    const resetStyle = {
      '--raffle-x': '0px',
      '--raffle-transition': 'none',
    };

    if (!opening || opening.stage === 'preparing') {
      finalDistanceRef.current = null;
      completedSpinRef.current = null;
      setRollerStyle(resetStyle);
      return undefined;
    }

    if (opening.stage === 'result') {
      const measuredDistance =
        finalDistanceRef.current ?? measureCardDistance(targetIndex);

      finalDistanceRef.current = measuredDistance;
      setRollerStyle({
        '--raffle-x': `-${measuredDistance}px`,
        '--raffle-transition': 'none',
      });
      return undefined;
    }

    if (opening.stage !== 'rolling') {
      return undefined;
    }

    const startIndex = Math.min(3, Math.max(0, targetIndex - 1));
    const startDistance = measureCardDistance(startIndex);
    const measuredDistance = measureCardDistance(targetIndex);
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches;
    const duration = reduceMotion ? 320 : CASE_ROLL_DURATION_MS;

    finalDistanceRef.current = measuredDistance;
    completedSpinRef.current = null;

    setRollerStyle({
      '--raffle-x': `-${startDistance}px`,
      '--raffle-transition': 'none',
    });

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setRollerStyle({
          '--raffle-x': `-${measuredDistance}px`,
          '--raffle-transition': `transform ${duration}ms cubic-bezier(.10,.68,.08,1)`,
        });
      });
    });

    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [measureCardDistance, opening, targetIndex]);

  const finishRoll = (event) => {
    if (
      !isRolling ||
      event.target !== trackRef.current ||
      event.propertyName !== 'transform' ||
      completedSpinRef.current === opening?.spinKey
    ) {
      return;
    }

    completedSpinRef.current = opening.spinKey;
    onRollComplete?.(opening.spinKey);
  };

  const idleLoopBase = idleGifts.length
    ? Array.from({ length: Math.max(18, idleGifts.length * 5) }, (_, index) => idleGifts[index % idleGifts.length])
    : [];
  const idleLoopGifts = idleLoopBase.length ? [...idleLoopBase, ...idleLoopBase] : [];

  return (
    <div
      className={[
        caseOpeningStyles.roller,
        isLive ? caseOpeningStyles.live : '',
        isResult ? caseOpeningStyles.result : '',
        isPreparing ? caseOpeningStyles.preparing : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Case prizes preview"
      aria-busy={isPreparing || isRolling}
    >
      <span className={caseOpeningStyles.centerGuide} aria-hidden="true" />
      <span
        className={`${caseOpeningStyles.marker} ${caseOpeningStyles.markerTop}`}
        aria-hidden="true"
      />
      <span
        className={`${caseOpeningStyles.marker} ${caseOpeningStyles.markerBottom}`}
        aria-hidden="true"
      />

      {!isLive ? (
        <div
          className={`${caseOpeningStyles.idleTrack} ${
            isPreparing ? caseOpeningStyles.idleTrackPaused : ''
          }`}
        >
          {idleLoopGifts.map((gift, index) => (
            <div
              className={caseOpeningStyles.card}
              key={`${gift?.id || 'gift'}-idle-${index}`}
              style={{
                '--gift-color': solidGiftBackground(
                  gift?.background_value,
                  defaultGiftBackground(gift?.rarity)
                ),
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!idleLoopGifts.length ? (
            <div className={caseOpeningStyles.emptyCard}>
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          ref={trackRef}
          className={`${caseOpeningStyles.spinTrack} ${
            isRolling ? caseOpeningStyles.rolling : ''
          }`}
          style={rollerStyle}
          onTransitionEnd={finishRoll}
        >
          {reel.map((gift, index) => (
            <div
              className={`${caseOpeningStyles.card} ${
                index === targetIndex ? caseOpeningStyles.winnerCard : ''
              }`}
              data-winning={index === targetIndex ? 'true' : undefined}
              key={`${gift?.id || 'gift'}-${index}-${opening?.spinKey || 'idle'}`}
              style={{
                '--gift-color': solidGiftBackground(
                  gift?.background_value,
                  defaultGiftBackground(gift?.rarity)
                ),
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!reel.length ? (
            <div className={caseOpeningStyles.emptyCard}>
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CaseWinResult({ opening, onClose, onSell }) {
  if (!opening?.gift || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={`win-screen-layer ${caseOpeningStyles.resultPortal}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-win-title"
    >
      <div
        className={`win-screen-card ${caseOpeningStyles.resultPanel} ${
          isBalanceReward(opening.gift) ? 'balance-win' : ''
        }`}
        style={{
          '--win-screen-bg': solidGiftBackground(
            opening.gift?.background_value,
            defaultGiftBackground(opening.gift?.rarity)
          ),
        }}
      >
        <span className="win-screen-shine" aria-hidden="true" />
        <span className="win-screen-badge">YOU WON</span>

        <div className="win-screen-media">
          <GiftMedia gift={opening.gift} animate />
        </div>

        <div className="win-screen-copy">
          <strong id="case-win-title">{opening.gift?.title || 'Reward'}</strong>
          <p>{rewardSubtitle(opening.gift)}</p>
        </div>

        <div className="win-screen-actions">
          {!isBalanceReward(opening.gift) ? (
            <button type="button" className="sell-btn" onClick={() => onSell(opening)}>
              {sellButtonText(opening.gift)}
            </button>
          ) : (
            <button type="button" className="sell-btn" onClick={onClose}>
              Balansga qo‘shildi
            </button>
          )}
          <button type="button" className="close-win-btn" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CaseDetailPage({
  caseItem,
  gifts,
  opening,
  busy,
  onBack,
  onOpen,
  onCloseResult,
  onSellResult,
  onRollComplete,
}) {
  const readyGifts = gifts.filter(eligibleGift);
  const openableGifts = readyGifts.filter(openableGift);
  const isFree = Number(caseItem.price || 0) === 0;
  const openText = isFree ? 'OPEN' : `OPEN ${formatPrice(caseItem.price)}`;
  const previewGifts = readyGifts.length ? readyGifts : gifts;
  const inlineOpening = opening && String(opening.caseItem?.id) === String(caseItem.id) ? opening : null;
  const isSpinning = inlineOpening && inlineOpening.stage !== 'result';
  const isResult = inlineOpening?.stage === 'result';
  const isOpeningActive = Boolean(inlineOpening);
  const targetIndex =
    typeof inlineOpening?.winningIndex === 'number'
      ? inlineOpening.winningIndex
      : getWinningIndexFromReel(inlineOpening?.reel || []);
  const stripSource = previewGifts.length ? previewGifts : [];
  const stripGifts = stripSource.length
    ? Array.from({ length: Math.min(9, Math.max(7, stripSource.length)) }, (_, index) => stripSource[index % stripSource.length])
    : [];

  useLayoutEffect(() => {
    if (!isOpeningActive) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const scrollY =
      window.scrollY || root.scrollTop || body.scrollTop || 0;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      right: body.style.right,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    const previousRoot = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.right = '0';
    body.style.left = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    const preventScroll = (event) => {
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('wheel', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('wheel', preventScroll);

      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.right = previousBody.right;
      body.style.left = previousBody.left;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      body.style.overscrollBehavior = previousBody.overscrollBehavior;
      root.style.overflow = previousRoot.overflow;
      root.style.overscrollBehavior = previousRoot.overscrollBehavior;

      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [isOpeningActive]);

  return (
    <section className={`case-page-screen ${isSpinning ? 'is-inline-spinning' : ''} ${isResult ? 'has-inline-result' : ''}`}>
      <div className="case-page-top">
        <button
          type="button"
          className="case-page-back"
          onClick={onBack}
          disabled={isSpinning}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <span className="eyebrow">Case detail</span>
          <h1>{caseItem.title}</h1>
        </div>
      </div>

      <div
        className="case-page-hero premium-card inline-case-hero"
        style={{
          '--case-page-accent': caseAccent(caseItem),
          '--case-page-badge': caseBadgeColor(caseItem),
        }}
      >
        <span className="case-page-glow glow-one" aria-hidden="true" />
        <span className="case-page-glow glow-two" aria-hidden="true" />

        <div className="case-page-copy">
          <span className="case-page-pill">Premium case</span>
          <h2>{caseItem.title}</h2>
          <p>{caseItem.description || `${readyGifts.length || gifts.length || 0} ta sovg‘a ichidan random yutuq.`}</p>
        </div>

        <InlineRaffleRoller
          opening={inlineOpening}
          idleGifts={stripGifts}
          targetIndex={targetIndex}
          onRollComplete={onRollComplete}
        />

        <button
          type="button"
          className={caseOpeningStyles.openButton}
          disabled={busy || isSpinning || openableGifts.length === 0}
          onClick={onOpen}
          aria-busy={isSpinning}
          aria-live="polite"
        >
          <AppIcon name="spark" />
          <span>{isSpinning ? (inlineOpening.stage === 'preparing' ? 'OPENING' : 'ROLLING') : openText}</span>
        </button>

      </div>

      {isResult ? (
        <CaseWinResult
          opening={inlineOpening}
          onClose={onCloseResult}
          onSell={onSellResult}
        />
      ) : null}

      <div className="case-page-prizes-head">
        <div>
          <span className="eyebrow">Inside this case</span>
          <h2>Sovg‘alar</h2>
        </div>
        <strong>{previewGifts.length || 0} ta</strong>
      </div>

      <div className="case-page-prize-grid">
        {previewGifts.map((gift, index) => (
          <div
            className="case-page-prize-card"
            key={gift.id}
            style={{
              '--float-delay': `${(index % 6) * 0.13}s`,
              '--gift-card-bg': solidGiftBackground(gift.background_value, defaultGiftBackground(gift.rarity)),
            }}
          >
            <span className="prize-card-shine" aria-hidden="true" />
            <div className="case-page-prize-image">
              <GiftMedia gift={gift} compact preferStatic />
            </div>
            <div className="case-page-prize-copy">
              <strong>{gift.title}</strong>
              <span>{visibleChance(gift)}% · stock {gift.stock}</span>
            </div>
          </div>
        ))}
        {!previewGifts.length ? (
          <div className="case-page-empty-prizes">
            <AppIcon name="box" />
            <strong>Hozircha sovg‘alar yo‘q</strong>
            <span>Bu case tez orada to‘ldiriladi.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OpeningModal({ opening, onClose, onInventory, onOpenAgain, busy }) {
  const isResult = opening.stage === 'result';
  const itemWidth = 84;
  const gap = 9;
  const stopIndex = Math.max(0, opening.reel.length - 5);
  const distance = stopIndex * (itemWidth + gap);

  return (
    <div className="modal-backdrop opening-backdrop" role="dialog" aria-modal="true">
      <div className="opening-modal premium-card">
        <div className="opening-topline">
          <span className="eyebrow">{opening.caseItem?.title || 'Case'}</span>
          <strong>{opening.stage === 'preparing' ? 'Preparing...' : isResult ? 'Reward ready' : 'Rolling...'}</strong>
        </div>

        {!isResult ? (
          <>
            <h2>{opening.stage === 'preparing' ? 'Get ready' : 'Opening case'}</h2>
            <div className="pro-reel-shell">
              <div className="reel-center-line">
                <span>◆</span>
              </div>
              <div
                className={`pro-reel-track ${opening.stage === 'preparing' ? 'is-preparing' : 'is-rolling'}`}
                style={{
                  '--reel-distance': `${distance}px`,
                }}
                key={opening.spinKey}
              >
                {opening.reel.map((gift, index) => (
                  <div
                    className="pro-reel-item media-only premium-reel-item super-reel-item"
                    key={`${gift.id}-${index}`}
                    style={{
                      '--reel-item-delay': `${index * 0.026}s`,
                    }}
                  >
                    <GiftMedia gift={gift} preferStatic />
                  </div>
                ))}
              </div>
            </div>
            <div className="opening-info-row compact">
              <span><AppIcon name="spark" /> Fair random</span>
              <span><AppIcon name="gem" /> Secure result</span>
            </div>
          </>
        ) : (
          <div className={`win-result ${isBalanceReward(opening.gift) ? 'balance-win' : ''}`}>
            <span className="win-spark">
              <AppIcon name="spark" />
              YOU WON
            </span>

            <div
              className="win-gift-media premium-win-gift-media"
              style={{
                '--gift-bg': opening.gift?.background_value || defaultGiftBackground(opening.gift?.rarity),
              }}
            >
              <GiftMedia gift={opening.gift} animate />
            </div>

            <h2>{opening.gift?.title || 'Reward'}</h2>
            <p>{rewardSubtitle(opening.gift)}</p>

            <div className="win-stats">
              <div>
                <span>Before</span>
                <strong>{formatPrice(opening.balanceBefore)}</strong>
              </div>
              <div>
                <span>After</span>
                <strong>{formatPrice(opening.balanceAfter)}</strong>
              </div>
            </div>

            <div className="win-actions">
              <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
              {!isBalanceReward(opening.gift) ? (
                <button type="button" className="primary-btn" onClick={onInventory}>Inventory</button>
              ) : null}
              <button type="button" className="primary-btn" disabled={busy} onClick={onOpenAgain}>
                Open again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="empty-state premium-card">
      <AppIcon name={icon} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}
