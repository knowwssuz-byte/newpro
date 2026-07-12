'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  groups.flat().filter(Boolean).forEach((item) => {
    const url = typeof item === 'string' ? item : imageUrlOf(item);
    if (!url || WARMED_IMAGE_URLS.has(url)) return;

    WARMED_IMAGE_URLS.add(url);
    urls.push(url);
  });

  if (!urls.length) return;

  const loadOne = (url, eager = false) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = eager ? 'eager' : 'lazy';
    img.src = url;

    if (typeof img.decode === 'function') {
      img.decode().catch(() => {});
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

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function buildOpeningReel(gifts, winningGift) {
  const safeGifts = gifts.length ? gifts : [winningGift].filter(Boolean);
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
      <img src="/currency/stars.svg" alt="" draggable="false" />
    </span>
  );
}

function AppIcon({ name, className = '' }) {
  const common = {
    className: `app-icon ${className}`.trim(),
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3.5 11.3 12 4l8.5 7.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.8 10.4v8.3h4.1v-4.9h4.2v4.9h4.1v-8.3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'games':
      return (
        <svg {...common}>
          <path d="M7.8 10.4h8.4a4.2 4.2 0 0 1 4.1 3.4l.5 2.6a2.1 2.1 0 0 1-3.4 2l-1.7-1.5H8.3l-1.7 1.5a2.1 2.1 0 0 1-3.4-2l.5-2.6a4.2 4.2 0 0 1 4.1-3.4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M8.3 13.2v3M6.8 14.7h3M15.8 14.2h.1M18 16h.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 10.4V7.8h6v2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'inventory':
    case 'box':
    case 'cases':
      return (
        <svg {...common}>
          <path d="m12 3.5 7.2 4.1v8.8L12 20.5l-7.2-4.1V7.6L12 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M4.9 7.7 12 11.9l7.1-4.2M12 20.2v-8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 5.5v3.4h3.4M12 7.9v4.4l3 1.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <path d="M12 12.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z" stroke="currentColor" strokeWidth="2.2" />
          <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'referral':
      return (
        <svg {...common}>
          <path d="M9.4 11.3a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" stroke="currentColor" strokeWidth="2.1" />
          <path d="M3.9 19.4a5.8 5.8 0 0 1 10.8-2.9" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M16.6 9.5a2.6 2.6 0 1 0 0-5.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M16.4 14.3h2.2a2.7 2.7 0 0 1 0 5.4h-2.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M17.6 17h-4.7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case 'coin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="url(#coinGradient)" stroke="currentColor" strokeWidth="1.2" />
          <path d="m12 6.8 4.2 2.4-4.2 8-4.2-8 4.2-2.4Z" fill="white" opacity=".96" />
          <path d="m12 9.2 1.8 1-1.8 3.5-1.8-3.5 1.8-1Z" fill="#10bdf7" />
          <defs>
            <linearGradient id="coinGradient" x1="4" y1="4" x2="20" y2="20">
              <stop stopColor="#36e3ff" />
              <stop offset="1" stopColor="#2772ff" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'deposit':
      return (
        <svg {...common}>
          <path d="M4.5 7.7h15v11h-15v-11Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
          <path d="M7 7.7V5.3h8.4v2.4M15 13h4.5M16.9 11.2l2 1.8-2 1.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'rocket':
      return (
        <svg {...common}>
          <path d="M14.2 4.2c2.7-1 5.5-.6 5.5-.6s.4 2.8-.6 5.5c-.8 2.1-2.7 4.5-5.5 6.9l-5.6-5.6c2.4-2.8 4.8-4.7 6.2-6.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 15.3 6.2 18l-.7-3.5-2.8-.8 2.8-2.8M13.5 18.5l-2.8 2.8-.8-2.8-3.5-.7 2.7-2.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.8" cy="7.5" r="1.7" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'swords':
      return (
        <svg {...common}>
          <path d="m4.8 19.2 5.7-5.7M13.5 10.5l5.7-5.7M18.5 3.8l1.7 1.7-5.8 5.8-1.7-1.7 5.8-5.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m19.2 19.2-5.7-5.7M10.5 10.5 4.8 4.8M5.5 3.8 3.8 5.5l5.8 5.8 1.7-1.7-5.8-5.8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'gift':
      return (
        <svg {...common}>
          <path d="M4.2 10h15.6v10H4.2V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M3.5 7.2h17v3h-17v-3ZM12 7.2V20M12 7.1s-3.8.1-4.8-1.1c-1-1.1-.3-3 1.3-3 2 0 3.5 4.1 3.5 4.1Zm0 0s3.8.1 4.8-1.1c1-1.1.3-3-1.3-3-2 0-3.5 4.1-3.5 4.1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'gem':
      return (
        <svg {...common}>
          <path d="M6.5 4h11L21 9l-9 11L3 9l3.5-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m8.2 9 3.8 11 3.8-11M3 9h18M8 4l-1.5 5M16 4l1.5 5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 'withdraw':
      return (
        <svg {...common}>
          <path d="M5 5h14v7.5H5V5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 8v10M8.5 14.5 12 18l3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 2.8 14.2 9l6.4 2.2-6.4 2.2L12 19.6l-2.2-6.2-6.4-2.2L9.8 9 12 2.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m18.5 16.2.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" fill="currentColor" />
        </svg>
      );
    case 'admin':
      return (
        <svg {...common}>
          <path d="M12 3.2 19 6v5.2c0 4.4-2.8 7.6-7 9.6-4.2-2-7-5.2-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="m8.8 12 2 2 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" stroke="currentColor" strokeWidth="2" />
          <path d="M19.4 13.6a7.9 7.9 0 0 0 0-3.2l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-2.8-1.6L13.8 2h-3.6l-.4 2.9A8.2 8.2 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.5a7.9 7.9 0 0 0 0 3.2l-2 1.5 2 3.4 2.4-1a8.2 8.2 0 0 0 2.8 1.6l.4 2.9h3.6l.4-2.9a8.2 8.2 0 0 0 2.8-1.6l2.4 1 2-3.4-2-1.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
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

  const [profile, setProfile] = useState(null);
  const [telegramUser, setTelegramUser] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [cases, setCases] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [history, setHistory] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
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
  const hasBootstrappedRef = useRef(false);
  const referralTrackedRef = useRef(false);
  const mountedRef = useRef(false);

  const giftsByCase = useMemo(() => groupGiftsByCase(gifts), [gifts]);
  const activeCases = useMemo(() => sortCasesForDisplay(cases.filter((item) => item.is_active !== false)), [cases]);

  const navItems = useMemo(
    () => [
      { id: 'games', icon: 'games', image: '/nav/games.svg', label: 'Games' },
      { id: 'inventory', icon: 'inventory', image: '/nav/cases.svg', label: 'Inventory' },
      { id: 'home', icon: 'home', image: '/nav/home.svg', label: 'Home', center: true },
      { id: 'history', icon: 'history', image: '/nav/history.svg', label: 'History' },
      { id: 'referral', icon: 'referral', image: '/nav/referral.svg', label: 'Referal' },
    ],
    []
  );

  useEffect(() => {
    warmImageCacheFromData(activeCases.slice(0, 8), gifts.slice(0, 42), selectedCase ? giftsByCase[selectedCase.id] || [] : []);
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
    async (url, payload = {}) => {
      if (!initData) {
        throw new Error("Telegram initData topilmadi. Web App'ni bot tugmasidan oching.");
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, ...payload }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Server xatosi (${response.status})`);
      }

      return data;
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
    setError('');
    setSelectedCase(caseItem);

    const previewReel = buildOpeningReel(activeGiftPool, null);

    setOpening({
      stage: 'preparing',
      caseItem,
      gift: null,
      reel: previewReel,
      spinKey: Date.now(),
    });

    try {
      tg?.HapticFeedback?.impactOccurred?.('light');

      const [result] = await Promise.all([
        apiPost('/api/open-case', { caseId: caseItem.id }),
        delay(140),
      ]);

      if (!result?.gift) {
        throw new Error('Server natija qaytarmadi. Qayta urinib ko‘ring.');
      }

      const reel = buildOpeningReel(activeGiftPool, result.gift);
      const spinKey = Date.now();
      const winningIndex = getWinningIndexFromReel(reel);

      setOpening({
        stage: 'rolling',
        caseItem,
        gift: result.gift,
        reel,
        winningIndex,
        opening: result.opening,
        history: result.history || null,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        spinKey,
      });

      tg?.HapticFeedback?.impactOccurred?.('medium');

      // Animatsiya paytida balance/gifts/history state'larini yangilamaslik kerak.
      // Aks holda Telegram WebView qayta render qilib, reel qotib/stutter bo'lishi mumkin.
      await delay(5000);

      setProfile((current) => (current ? { ...current, balance: result.balanceAfter ?? result.balance } : current));

      setGifts((current) =>
        current.map((item) => (String(item.id) === String(result.gift.id) ? { ...item, ...result.gift } : item))
      );

      if (result.history?.id) {
        setHistory((current) => [result.history, ...current.filter((item) => String(item.id) !== String(result.history.id))]);
      }

      setOpening({
        stage: 'result',
        caseItem,
        gift: result.gift,
        reel,
        winningIndex,
        opening: result.opening,
        history: result.history || null,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        spinKey,
      });

      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (err) {
      setOpening(null);
      setError(err.message || 'Case ochishda xatolik yuz berdi');
      tg?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
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

        <GlobalBalanceBar telegramUser={telegramUser} profile={profile} profilePhotoUrl={profilePhotoUrl} />

        <main className={`app-main ${selectedCase ? 'case-page-main' : ''}`}>
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
                  onComingSoon={() => showToast('Tez orada 🚀')}
                  busy={busy}
                />
              ) : null}

              {tab === 'games' ? (
                <CasesView
                  cases={activeCases}
                  giftsByCase={giftsByCase}
                  busy={busy}
                  onOpenCase={openCase}
                  onSelectCase={(caseItem) => { setOpening(null); setSelectedCase(caseItem); }}
                  onGoHome={() => setTab('home')}
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
                />
              ) : null}
            </>
          )}
        </main>

        <nav className="mobile-nav premium-card" aria-label="Bottom navigation">
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={!selectedCase && tab === item.id}
              onClick={() => {
                setOpening(null);
                setSelectedCase(null);
                setTab(item.id);
              }}
              mobile
            />
          ))}
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


function GlobalBalanceBar({ telegramUser, profile, profilePhotoUrl }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const avatarUrl = profilePhotoUrl || telegramUser?.photo_url || '';

  const toggleSettings = () => {
    setSettingsOpen((value) => !value);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
  };

  return (
    <div className="global-balance-stabilizer">
      <div className="home-hero premium-card global-balance-bar">
        <div className="home-hero-bg" aria-hidden="true" />

        <div className="home-user-zone">
          <div className="home-avatar-wrap">
            <div className={`home-avatar ${avatarUrl ? 'has-photo' : ''}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" draggable="false" />
              ) : (
                telegramUser?.first_name?.[0] || 'U'
              )}
            </div>

            <button
              type="button"
              className="avatar-shield settings-badge"
              aria-label="Settings"
              aria-expanded={settingsOpen ? 'true' : 'false'}
              onClick={toggleSettings}
            >
              <AppIcon name="settings" />
            </button>

            {settingsOpen ? (
              <div className="quick-settings-menu">
                <button type="button" onClick={closeSettings}>
                  <AppIcon name="gift" />
                  <span>Bonus settings</span>
                  <em>soon</em>
                </button>

                <button type="button" onClick={closeSettings}>
                  <AppIcon name="history" />
                  <span>Activity</span>
                  <em>soon</em>
                </button>

                <button type="button" onClick={closeSettings}>
                  <AppIcon name="deposit" />
                  <span>Payment settings</span>
                  <em>soon</em>
                </button>
              </div>
            ) : null}
          </div>

          <div className="home-balance-copy">
            <span>Your balance</span>
            <strong>
              {coinIcon()}
              {formatPrice(profile?.balance)}
            </strong>
          </div>
        </div>

        <button type="button" className="deposit-button">
          <AppIcon name="deposit" />
          <span>Deposit</span>
        </button>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick, mobile = false }) {
  const preventIconMenu = (event) => {
    event.preventDefault();
    return false;
  };

  return (
    <button
      type="button"
      className={`nav-button ${active ? 'active' : ''} ${item.center ? 'center-home' : ''} ${mobile ? 'mobile-nav-btn' : ''}`}
      onClick={onClick}
      onContextMenu={preventIconMenu}
    >
      <span className="nav-icon-wrap" onContextMenu={preventIconMenu}>
        {item.image ? (
          <img
            className="nav-icon-img"
            src={item.image}
            alt=""
            loading="eager"
            draggable="false"
            aria-hidden="true"
            onContextMenu={preventIconMenu}
          />
        ) : (
          <AppIcon name={item.icon} />
        )}
      </span>
      <strong>{item.label}</strong>
      {item.center ? <em className="home-glow-dot" /> : null}
    </button>
  );
}

function PromoImageCard({
  variant,
  image,
  badge,
  badgeIcon,
  title,
  subtitle,
  actionText,
  onClick,
}) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      type="button"
      className={`promo-banner promo-image-banner premium-promo ${variant} ${failed ? 'image-failed' : ''}`}
      onClick={onClick}
      aria-label={title}
    >
      <span className="promo-shine" aria-hidden="true" />
      <span className="promo-orbit one" aria-hidden="true" />
      <span className="promo-orbit two" aria-hidden="true" />

      <div className="promo-banner-copy">
        <span className={`promo-badge ${variant === 'pvp' ? 'new' : ''}`}>
          <AppIcon name={badgeIcon} /> {badge}
        </span>

        <span className="promo-banner-text">
          <strong>{title}</strong>
          {subtitle ? <em>{subtitle}</em> : null}
        </span>

        <span className="promo-action-chip">
          {actionText || 'Open'}
          <b>›</b>
        </span>
      </div>

      <div className="promo-webp-stage" aria-hidden="true">
        {!failed && image ? (
          <img
            src={image}
            alt=""
            className="promo-webp"
            draggable="false"
            loading="eager"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="promo-fallback-icon">
            <AppIcon name={variant === 'pvp' ? 'swords' : 'rocket'} />
          </span>
        )}
      </div>
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
      <div className="home-promo-stack">
        <PromoImageCard
          variant="rocket"
          image="/feature/rocket.webp"
          badge="HOT!"
          badgeIcon="rocket"
          title="ROCKET"
          subtitle="Mini game · Tez orada"
          actionText="Tez orada"
          onClick={showComingSoon}
        />

        <PromoImageCard
          variant="pvp"
          image="/feature/pvp.webp"
          badge="NEW!"
          badgeIcon="spark"
          title="PVP"
          subtitle="Battle mode · Tez orada"
          actionText="Tez orada"
          onClick={showComingSoon}
        />
      </div>

      <div className="home-actions-grid">
        <button type="button" className="home-action-btn contracts" onClick={onGoCases}>
          <span>
            <AppIcon name="box" />
          </span>
          <strong>CONTRACTS</strong>
          <b>›</b>
        </button>

        <button type="button" className="home-action-btn upgrade" onClick={onGoInventory}>
          <span>
            <AppIcon name="spark" />
          </span>
          <strong>UPGRADE</strong>
          <b>›</b>
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

function CasesView({ onGoHome }) {
  return (
    <section className="screen-stack">
      <div className="page-header premium-card games-page-header">
        <button type="button" className="ghost-back" onClick={onGoHome}>
          ‹ Home
        </button>
        <h1>Games</h1>
        <p>Bu bo‘lim hozircha tayyorlanmoqda.</p>
      </div>

      <EmptyState icon="games" title="Hozircha bo‘sh" text="Rocket va PVP Home’da turadi, bosilganda “Tez orada” chiqadi." />
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
    <button
      type="button"
      className={`case-card case-showcase-card ${disabled ? 'disabled' : ''}`}
      style={{
        '--case-accent': accent,
        '--case-badge': badgeColor,
      }}
      onClick={() => onDetails(caseItem)}
    >
      <div className="case-showcase-media">
        <span className="case-showcase-glow" aria-hidden="true" />

        {caseItem.image_url ? (
          <img src={caseItem.image_url} alt="" loading="lazy" />
        ) : (
          <span className="case-showcase-fallback">
            <AppIcon name="box" />
          </span>
        )}

        {badge ? <span className="case-showcase-badge">{badge}</span> : null}
      </div>

      <div className="case-showcase-footer">
        <div className="case-showcase-copy">
          <h3>{caseItem.title}</h3>
          <p>{caseItem.description || `${gifts.length || 0} rewards`}</p>
        </div>

        <button
          type="button"
          className="case-showcase-open"
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
    </button>
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

function TelegramTgsAnimation({ src, className }) {
  const containerRef = useRef(null);

  useEffect(() => {
    let animation = null;
    let cancelled = false;

    async function loadAnimation() {
      try {
        const [{ default: lottie }, pakoModule] = await Promise.all([
          import('lottie-web'),
          import('pako'),
        ]);
        const pako = pakoModule.default || pakoModule;
        const response = await fetch(src, { cache: 'force-cache' });

        if (!response.ok) {
          throw new Error(`TGS download failed: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        let jsonText = '';

        try {
          jsonText = pako.ungzip(new Uint8Array(buffer), { to: 'string' });
        } catch {
          jsonText = new TextDecoder().decode(buffer);
        }

        if (cancelled || !containerRef.current) return;

        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: JSON.parse(jsonText),
        });
      } catch (error) {
        console.warn('TGS animation failed:', error?.message || error);
      }
    }

    loadAnimation();

    return () => {
      cancelled = true;
      if (animation) {
        animation.destroy();
      }
    };
  }, [src]);

  return (
    <span className={`${className} tgs-gift-media`}>
      <span ref={containerRef} className="tgs-gift-canvas" />
    </span>
  );
}

function GiftMedia({ gift, compact = false, preferStatic = false }) {
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
    return <TelegramTgsAnimation src={animationUrl} className={mediaClass} />;
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

function ReferralView({ telegramUser, profile }) {
  const [copied, setCopied] = useState(false);

  const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'GiftMystBot').replace('@', '');
  const userId = telegramUser?.id || profile?.id || '';
  const referralCode = userId ? `ref_${userId}` : 'ref';
  const referralLink = buildStartAppLink(botUsername, referralCode);
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Gift Mystga qo‘shiling va bonus oling 🎁')}`;

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
      window.setTimeout(() => setCopied(false), 1700);
    } catch (err) {
      setCopied(false);
      window.open(shareLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section className="screen-stack referral-view">
      <div className="referral-hero premium-card">
        <span className="referral-orb one" aria-hidden="true" />
        <span className="referral-orb two" aria-hidden="true" />

        <div className="referral-hero-icon">
          <AppIcon name="referral" />
        </div>

        <div className="referral-hero-copy">
          <span>Referal dasturi</span>
          <h1>Do‘stlaringizni taklif qiling</h1>
          <p>Linkingizni yuboring. Do‘stingiz shu link orqali Web App’ga kirganda referal kodingiz ulanadi.</p>
        </div>
      </div>

      <div className="referral-code-card premium-card">
        <div className="referral-code-head">
          <span>Sizning referal linkingiz</span>
          <strong>{referralCode}</strong>
        </div>

        <div className="referral-link-box">
          <span>{referralLink}</span>
        </div>

        <div className="referral-actions">
          <button type="button" className="referral-copy-btn" onClick={copyReferral}>
            <AppIcon name={copied ? 'spark' : 'box'} />
            <span>{copied ? 'Copied' : 'Copy link'}</span>
          </button>

          <button
            type="button"
            className="referral-share-btn"
            onClick={() => window.open(shareLink, '_blank', 'noopener,noreferrer')}
          >
            <AppIcon name="gift" />
            <span>Share</span>
          </button>
        </div>
      </div>

      <div className="referral-info-grid">
        <div className="referral-info-card premium-card">
          <AppIcon name="gem" />
          <strong>Bonus</strong>
          <span>Do‘stingiz faol bo‘lganda mukofot berish tizimi uchun tayyor menyu.</span>
        </div>

        <div className="referral-info-card premium-card">
          <AppIcon name="history" />
          <strong>Statistika</strong>
          <span>Takliflar statistikasi keyingi backend update’da ulanadi.</span>
        </div>
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

function InlineRaffleRoller({ opening, idleGifts, itemWidth = 84, gap = 9, targetIndex = 0 }) {
  const trackRef = useRef(null);
  const [rollerStyle, setRollerStyle] = useState({
    '--raffle-x': '0px',
    '--raffle-transition': 'none',
    '--raffle-filter': 'blur(0px)',
  });

  const isLive = Boolean(opening);
  const isResult = opening?.stage === 'result';
  const isRolling = opening?.stage === 'rolling';
  const isPreparing = opening?.stage === 'preparing';
  const reel = isLive ? opening.reel : idleGifts;
  const distance = Math.max(0, (targetIndex * (itemWidth + gap)) + (itemWidth / 2));

  useEffect(() => {
    let startTimer = null;
    let cleanTimer = null;

    const resetStyle = {
      '--raffle-x': '0px',
      '--raffle-transition': 'none',
      '--raffle-filter': 'blur(0px)',
    };

    if (!opening) {
      setRollerStyle(resetStyle);
      return undefined;
    }

    if (opening.stage === 'preparing') {
      setRollerStyle(resetStyle);
      return undefined;
    }

    if (opening.stage === 'result') {
      setRollerStyle({
        '--raffle-x': `-${distance}px`,
        '--raffle-transition': 'none',
        '--raffle-filter': 'blur(0px)',
      });
      return undefined;
    }

    if (opening.stage !== 'rolling') {
      return undefined;
    }

    setRollerStyle(resetStyle);

    startTimer = window.setTimeout(() => {
      if (trackRef.current) {
        trackRef.current.getBoundingClientRect();
      }

      setRollerStyle({
        '--raffle-x': `-${distance}px`,
        '--raffle-transition': 'transform 4.85s cubic-bezier(.08,.60,0,1), filter .55s ease',
        '--raffle-filter': 'blur(.15px)',
      });

      cleanTimer = window.setTimeout(() => {
        setRollerStyle((current) => ({
          ...current,
          '--raffle-filter': 'blur(0px)',
        }));
      }, 3920);
    }, 90);

    return () => {
      if (startTimer) window.clearTimeout(startTimer);
      if (cleanTimer) window.clearTimeout(cleanTimer);
    };
  }, [opening?.spinKey, opening?.stage, distance]);

  const idleLoopGifts = idleGifts.length
    ? Array.from({ length: Math.max(18, idleGifts.length * 5) }, (_, index) => idleGifts[index % idleGifts.length])
    : [];

  return (
    <div className={`case-page-reel-preview inline-reel-preview ${isLive ? 'is-live' : ''} ${isResult ? 'is-result' : ''}`} aria-label="Case prizes preview">
      <span className="case-page-marker top" aria-hidden="true" />
      <span className="case-page-marker bottom" aria-hidden="true" />

      {!isLive ? (
        <div className="case-page-idle-track">
          {idleLoopGifts.map((gift, index) => (
            <div
              className="case-page-idle-card"
              key={`${gift?.id || 'gift'}-idle-${index}`}
              style={{
                '--spin-gift-bg': solidGiftBackground(gift?.background_value, defaultGiftBackground(gift?.rarity)),
                '--idle-delay': `${index * 0.11}s`,
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!idleLoopGifts.length ? (
            <div className="case-page-strip-empty">
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          ref={trackRef}
          className={`case-page-spin-track js-raffle-track ${isPreparing ? 'is-preparing' : ''} ${isRolling ? 'is-rolling' : ''}`}
          style={rollerStyle}
        >
          {reel.map((gift, index) => (
            <div
              className={`case-page-spin-card ${isRolling && index === targetIndex ? 'target-win-item' : ''}`}
              key={`${gift?.id || 'gift'}-${index}-${opening?.spinKey || 'idle'}`}
              style={{
                '--spin-gift-bg': solidGiftBackground(gift?.background_value, defaultGiftBackground(gift?.rarity)),
                '--spin-delay': `${index * 0.022}s`,
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!reel.length ? (
            <div className="case-page-strip-empty">
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CaseDetailPage({ caseItem, gifts, opening, busy, onBack, onOpen, onCloseResult, onSellResult }) {
  const readyGifts = gifts.filter(eligibleGift);
  const openableGifts = readyGifts.filter(openableGift);
  const isFree = Number(caseItem.price || 0) === 0;
  const openText = isFree ? 'OPEN' : `OPEN ${formatPrice(caseItem.price)}`;
  const previewGifts = readyGifts.length ? readyGifts : gifts;
  const inlineOpening = opening && String(opening.caseItem?.id) === String(caseItem.id) ? opening : null;
  const isSpinning = inlineOpening && inlineOpening.stage !== 'result';
  const isResult = inlineOpening?.stage === 'result';
  const itemWidth = 84;
  const gap = 9;
  const targetIndex =
    typeof inlineOpening?.winningIndex === 'number'
      ? inlineOpening.winningIndex
      : getWinningIndexFromReel(inlineOpening?.reel || []);
  const stripSource = previewGifts.length ? previewGifts : [];
  const stripGifts = stripSource.length
    ? Array.from({ length: Math.min(9, Math.max(7, stripSource.length)) }, (_, index) => stripSource[index % stripSource.length])
    : [];

  return (
    <section className={`case-page-screen ${isSpinning ? 'is-inline-spinning' : ''} ${isResult ? 'has-inline-result' : ''}`}>
      <div className="case-page-top">
        <button type="button" className="case-page-back" onClick={onBack} aria-label="Back">
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
          itemWidth={itemWidth}
          gap={gap}
          targetIndex={targetIndex}
        />

        <button
          type="button"
          className="case-page-open-btn"
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
          <div className="win-screen-layer" role="dialog" aria-modal="true">
            <div
              className={`win-screen-card ${isBalanceReward(inlineOpening.gift) ? 'balance-win' : ''}`}
              style={{
                '--win-screen-bg': solidGiftBackground(inlineOpening.gift?.background_value, defaultGiftBackground(inlineOpening.gift?.rarity)),
              }}
            >
              <span className="win-screen-shine" aria-hidden="true" />
              <span className="win-screen-badge">YOU WON</span>

              <div className="win-screen-media">
                <GiftMedia gift={inlineOpening.gift} />
              </div>

              <div className="win-screen-copy">
                <strong>{inlineOpening.gift?.title || 'Reward'}</strong>
                <p>{rewardSubtitle(inlineOpening.gift)}</p>
              </div>

              <div className="win-screen-actions">
                {!isBalanceReward(inlineOpening.gift) ? (
                  <button type="button" className="sell-btn" onClick={() => onSellResult(inlineOpening)}>
                    {sellButtonText(inlineOpening.gift)}
                  </button>
                ) : (
                  <button type="button" className="sell-btn" onClick={onCloseResult}>
                    Balansga qo‘shildi
                  </button>
                )}
                <button type="button" className="close-win-btn" onClick={onCloseResult}>
                  Yopish
                </button>
              </div>
            </div>
          </div>
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
              <GiftMedia gift={opening.gift} />
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
