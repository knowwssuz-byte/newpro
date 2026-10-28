'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import AppIcon from './AppIcon';
import BootLoader from './BootLoader';
import WelcomeTour from './WelcomeTour';
import caseOpeningStyles from './CaseOpening.module.css';
import liquidNavStyles from './LiquidGlassNav.module.css';
import gameCardStyles from './PremiumGameCards.module.css';

import RouteSkeleton from './RouteSkeleton';
import { prepareFirstView, warmNearViewport, preloadDecodedImage } from '@/lib/mystAssetReadiness.mjs';
import DiceGame, { DiceLobbyCard } from './DiceGame';
import PvpHub, { PvpEntryCard } from './PvpHub';
import StarIcon from './StarIcon';
import SettingsPanel from './SettingsPanel';
import settingsStyles from './SettingsPanel.module.css';
import inventoryStyles from './Inventory.module.css';
import { getInventoryRows } from '@/lib/inventory.mjs';
import GiftHistory from './GiftHistory';


const RocketGame = dynamic(() => import('./RocketGame'), { ssr: false, loading: () => <RouteSkeleton title="Rocket tayyorlanmoqda" /> });
const UpgradeLab = dynamic(() => import('./UpgradeLab'), { ssr: false, loading: () => <RouteSkeleton title="Upgrade tayyorlanmoqda" /> });
const DepositView = dynamic(() => import('./DepositView'), { ssr: false, loading: () => <RouteSkeleton title="Balans sahifasi ochilmoqda" /> });
const CaseDetailPage = dynamic(() => import('./CaseDetailExperience'), { ssr: false, loading: () => <RouteSkeleton title="Case ochilmoqda" /> });
const CASE_ROLL_DURATION_MS = 4600;
const CASE_ROLL_FALLBACK_MS = CASE_ROLL_DURATION_MS + 1200;
const UI_SETTINGS_KEY = 'giftmyst_ui_preferences_v2';
const DEFAULT_UI_SETTINGS = { sound: true, haptic: true, effects: true, giftAnimations: true };
const GiftAnimationContext = createContext(true);

// Pass existing, proven gift/media/rarity helpers into case-only bundle. None
// of the opening animations execute during authentication or Home boot.
const caseDetailHelpers = {
  GiftMedia, eligibleGift, openableGift, formatPrice, getWinningIndexFromReel,
  caseAccent, caseBadgeColor, solidGiftBackground, defaultGiftBackground,
  visibleChance, isBalanceReward, rewardSubtitle, sellButtonText,
};

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
  warmNearViewport(groups.flat().filter(Boolean).map((item) =>
    typeof item === 'string' ? item : imageUrlOf(item)
  ), window.navigator?.connection);
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

  const rawValue = gift.sell_price ?? gift.buy_price ?? gift.floor_price ?? 0;
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

function getOrCreateDeviceToken() {
  if (typeof window === 'undefined') return '';

  const key = 'gift_myst_device_v1';

  try {
    const existing = window.localStorage.getItem(key) || '';
    if (/^[a-zA-Z0-9._:-]{16,160}$/.test(existing)) return existing;

    const random = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const token = `gm-${random}`;
    window.localStorage.setItem(key, token);
    return token;
  } catch {
    return `gm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

function getDeviceInfo() {
  if (typeof window === 'undefined') return {};

  const nav = window.navigator || {};
  const screen = window.screen || {};

  return {
    platform: nav.userAgentData?.platform || nav.platform || '',
    language: nav.language || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen: `${screen.width || 0}x${screen.height || 0}@${window.devicePixelRatio || 1}`,
    colorDepth: screen.colorDepth || 0,
    cores: nav.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
  };
}

// Live server validation is required on launch. Optimistic private snapshots
// are not restored: stale large sessionStorage data can crash old WebViews.

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

function coinIcon(variant = 'gold') {
  return (
    <span className="coin-icon stars-currency-icon" aria-hidden="true">
      <StarIcon variant={variant} size={31} />
    </span>
  );
}

function playNavFeedback(app, settings = DEFAULT_UI_SETTINGS) {
  if (settings.haptic) {
    try {
      app?.HapticFeedback?.impactOccurred?.('light');
      window.setTimeout(() => app?.HapticFeedback?.selectionChanged?.(), 34);
    } catch {}
  }
  if (!settings.sound) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const now = context.currentTime;
    const gain = context.createGain();
    const low = context.createOscillator();
    const high = context.createOscillator();

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.016, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.048);

    low.type = 'sine';
    low.frequency.setValueAtTime(520, now);
    low.frequency.exponentialRampToValueAtTime(410, now + 0.045);

    high.type = 'triangle';
    high.frequency.setValueAtTime(1040, now);
    high.frequency.exponentialRampToValueAtTime(820, now + 0.032);

    low.connect(gain);
    high.connect(gain);
    gain.connect(context.destination);

    low.start(now);
    high.start(now);
    low.stop(now + 0.05);
    high.stop(now + 0.038);

    window.setTimeout(() => context.close?.().catch?.(() => {}), 120);
  } catch {
    // Audio is a progressive enhancement; navigation must never depend on it.
  }
}

export default function WebAppClient() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Gift Myst';

  const [tg, setTg] = useState(null);
  const [initData, setInitData] = useState('');
  const [startParam, setStartParam] = useState('');
  const [tab, setTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [uiSettings, setUiSettings] = useState(DEFAULT_UI_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [adminTab, setAdminTab] = useState('cases');
  const [loading, setLoading] = useState(true);
  const [bootStatus, setBootStatus] = useState('connecting');
  const [bootError, setBootError] = useState('');
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [opening, setOpening] = useState(null);
  const [rocketRoundActive, setRocketRoundActive] = useState(false);
  const [diceRoundActive, setDiceRoundActive] = useState(false);

  const [profile, setProfile] = useState(null);
  const [telegramUser, setTelegramUser] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [cases, setCases] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [inventoryGifts, setInventoryGifts] = useState([]);
  const [history, setHistory] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [upgradeRounds, setUpgradeRounds] = useState([]);
  const [upgradeCatalog, setUpgradeCatalog] = useState([]);
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
  const diceReturnTabRef = useRef('games');
  const pvpReturnTabRef = useRef('home');
  const depositReturnTabRef = useRef('home');
  const hasBootstrappedRef = useRef(false);
  const tourOpenedRef = useRef(false);
  const referralTrackedRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        setUiSettings({
          sound: stored.sound !== false,
          haptic: stored.haptic !== false,
          effects: stored.effects !== false,
          giftAnimations: stored.giftAnimations !== false,
        });
      }
    } catch {}
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    try { window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings)); } catch {}
  }, [uiSettings, settingsLoaded]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const giftsByCase = useMemo(() => groupGiftsByCase(gifts), [gifts]);
  const activeCases = useMemo(() => sortCasesForDisplay(cases.filter((item) => item.is_active !== false)), [cases]);

  const navItems = useMemo(
    () => [
      { id: 'games', icon: 'games', label: 'Games', navArt: true },
      { id: 'inventory', icon: 'inventory', label: 'Inventory', navArt: true },
      { id: 'home', icon: 'home', label: 'Home', navArt: true },
      { id: 'bonus', icon: 'bonus', label: 'Bonus', navArt: true },
      { id: 'referral', icon: 'referral', label: 'Referral', navArt: true },
    ],
    []
  );

  useEffect(() => {
    // Prime visible assets during Telegram startup.
    void prepareFirstView();
  }, []);

  useEffect(() => {
    // The two homepage banners use next/image's optimized URLs, so do not
    // prefetch the original uncompressed images in parallel.
    warmImageCacheFromData(
      activeCases.slice(0, 3),
      selectedCase ? (giftsByCase[selectedCase.id] || []).slice(0, 6) : []
    );
  }, [activeCases, giftsByCase, selectedCase]);

  // Welcome is chosen during bootstrap (before loader removal), preventing
  // a one-frame flash of Home underneath the first-visit modal.
  const finishWelcomeTour = useCallback(() => {
    setShowWelcomeTour(false);
  }, []);

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
          const requestError = new Error(data?.error || `Server xatosi (${response.status})`);
          requestError.status = response.status;
          throw requestError;
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

  const applyBootstrapData = useCallback((data) => {
    if (!data) return;

    setProfile(data.user || null);
    setTelegramUser(data.telegramUser || null);
    setIsAdmin(Boolean(data.isAdmin));
    // Old cached snapshots (or an unexpected server payload) may contain
    // incompatible field types; never crash the first React render.
    const safeGifts = Array.isArray(data.gifts) ? data.gifts : [];
    setCases(Array.isArray(data.cases) ? data.cases : []);
    setGifts(safeGifts);
    setInventoryGifts(Array.isArray(data.inventoryGifts) ? data.inventoryGifts : safeGifts);
    setHistory(Array.isArray(data.history) ? data.history : []);
    setWithdrawals(Array.isArray(data.withdrawals) ? data.withdrawals : []);
    setUpgradeRounds(Array.isArray(data.upgradeRounds) ? data.upgradeRounds : []);
    setUpgradeCatalog(Array.isArray(data.upgradeCatalog) ? data.upgradeCatalog : []);
    setFeatureSettings(data.featureSettings || {});

    if (Array.isArray(data.cases) && data.cases[0]?.id) {
      setGiftForm((current) => (
        current.case_id ? current : { ...current, case_id: data.cases[0].id }
      ));
    }

    hasBootstrappedRef.current = true;
    if (!tourOpenedRef.current && (data.telegramUser?.id || data.user?.id)) {
      tourOpenedRef.current = true;
      setShowWelcomeTour(true);
    }

  }, []);

  const loadApp = useCallback(
    async ({ silent = false } = {}) => {
      if (!initData) return false;
      const wasReady = hasBootstrappedRef.current;
      if (!silent && !wasReady) {
        setBootError('');
        setBootStatus('syncing');
        setLoading(true);
      }
      setError('');
      try {
        const data = await apiPost('/api/bootstrap', {}, { timeoutMs: 15000 });
        if (!mountedRef.current) return false;
        applyBootstrapData(data);
        if (!silent && !wasReady) {
          setBootStatus('visuals');
          await prepareFirstView().catch(() => ({ ready: false, timedOut: true }));
        }
        return true;
      } catch (err) {
        if (mountedRef.current) {
          const message = err?.message || 'Ma’lumot yuklashda xatolik';
          setError(message);
          if (err?.status === 401 || err?.status === 403) {
            hasBootstrappedRef.current = false;
            setProfile(null);
            setShowWelcomeTour(false);
            setBootError(message);
          } else if (!hasBootstrappedRef.current) {
            setBootError(message);
          }
        }
        return false;
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [apiPost, applyBootstrapData, initData]
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

        // Telegram's external script may arrive late on slow mobile networks.
        // Do not interpret script latency as a crash after only four seconds.
        if (attempts < 120) {
          telegramTimer = window.setTimeout(initTelegram, 100);
          return;
        }

        setBootError("Telegram WebApp yuklanmadi. Ilovani botdagi tugma orqali qayta oching.");
        setLoading(false);
        return;
      }

      try {
        // Telegram host UI helpers can throw independently on older versions.
        // None should prevent authenticated bootstrap when initData exists.
        for (const prepareHost of [
          () => app.ready?.(),
          () => app.expand?.(),
          () => app.MainButton?.hide?.(),
          () => app.BackButton?.hide?.(),
        ]) {
          try { prepareHost(); } catch { /* continue with valid Telegram session */ }
        }

        setTg(app);
        setStartParam(getTelegramStartParam(app));
        const telegramIdentity = app.initDataUnsafe?.user || null;
        setTelegramUser(telegramIdentity);
        if (!app.initData) {
          setBootError("Telegram sessiyasi topilmadi. Ilovani bot orqali qayta oching.");
          setLoading(false);
          return;
        }
        setBootError('');
        setBootStatus('syncing');
        setInitData(app.initData);
      } catch (err) {
        setBootError(err.message || "Telegram WebApp ishga tushmadi.");
        setLoading(false);
      }
    };

    initTelegram();

    return cleanup;
  }, []);

  useEffect(() => {
    loadApp();
  }, [loadApp]);


  useEffect(() => {
    if (!initData || referralTrackedRef.current) return;

    referralTrackedRef.current = true;
    const cleanStartParam = String(startParam || '').trim();

    apiPost('/api/referral/startapp', {
      startParam: cleanStartParam,
      deviceToken: getOrCreateDeviceToken(),
      deviceInfo: getDeviceInfo(),
    })
      .then((data) => {
        if (data?.blocked) {
          showToast('Bu qurilmada referal bonusi mavjud akkaunt sabab bloklandi.');
          tg?.HapticFeedback?.notificationOccurred?.('warning');
        }
      })
      .catch((err) => {
        console.warn('Referral device check failed:', err?.message || err);
      });
  }, [apiPost, initData, showToast, startParam, tg]);

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
    const preparationStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
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
      // A real server-authorized reward always wins. Decode only that media
      // (bounded to 850 ms) before revealing the reel; no global boot loader.
      const readyArtwork = imageUrlOf(result.gift);
      await Promise.allSettled([
        preloadDecodedImage(readyArtwork, { priority: 'high', timeoutMs: 850 }),
        new Promise((resolve) => window.setTimeout(resolve,
          Math.max(0, 420 - ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - preparationStarted)))),
      ]);

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
    const result = await runAction(
      () => apiPost('/api/withdraw', { historyId }),
      'O‘tkazish so‘rovi yuborildi ✅'
    );
    if (!result) return null;
    if (result.request) {
      setWithdrawals((current) => [result.request, ...current.filter((request) => request.id !== result.request.id)]);
    }
    await loadApp({ silent: true });
    return result;
  }

  async function sellInventoryReward(historyId) {
    const result = await runAction(() => apiPost('/api/sell-gift', { historyId }));
    if (!result) return null;
    // Remove the exact sold copy immediately; a bootstrap refresh then reconciles state.
    setHistory((current) => current.filter((item) => String(item.id) !== String(historyId)));
    setProfile((current) => {
      if (!current) return current;
      const balance = Number(result.balance);
      return { ...current, ...(result.user || {}), balance: Number.isFinite(balance) ? balance : current.balance };
    });
    showToast('Sotildi: ' + formatPrice(result.salePrice) + ' ⭐');
    await loadApp({ silent: true });
    return result;
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

  const openDiceGame = useCallback((returnTab = 'games') => {
    diceReturnTabRef.current = returnTab === 'home' ? 'home' : 'games';
    setError('');
    setOpening(null);
    setSelectedCase(null);
    setTab('dice');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const closeDiceGame = useCallback(() => {
    setDiceRoundActive(false);
    setTab(diceReturnTabRef.current || 'games');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const openUpgradeLab = useCallback(() => { setError(''); setOpening(null); setSelectedCase(null); setTab('upgrade'); window.scrollTo({top:0,behavior:'auto'}); }, []);

  const openPvpHub = useCallback((returnTab = 'home') => {
    pvpReturnTabRef.current = returnTab === 'games' ? 'games' : 'home';
    setError('');
    setOpening(null);
    setSelectedCase(null);
    setTab('pvp');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const closePvpHub = useCallback(() => {
    setTab(pvpReturnTabRef.current || 'home');
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
      'bonus',
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

  if (loading || (bootError && !hasBootstrappedRef.current)) {
    return <BootLoader status={bootStatus} error={bootError}
      onRetry={() => window.location.reload()} />;
  }
  // Onboarding is an actual full-screen stage, not a modal layered over Home.
  // No app header, balance panel, main UI or bottom navigation is mounted.
  if (showWelcomeTour) return <WelcomeTour onFinish={finishWelcomeTour} />;

  const isCaseOpening =
    opening?.stage === 'preparing' || opening?.stage === 'rolling';
  const bottomNavActiveId = !selectedCase
    ? tab === 'rocket' || tab === 'dice' || tab === 'pvp'
      ? 'games'
      : navItems.some((item) => item.id === tab)
        ? tab
        : 'none'
    : 'none';

  return (
    <GiftAnimationContext.Provider value={uiSettings.giftAnimations !== false}>
    <div className="app-frame myst-ready-reveal" data-ui-effects={uiSettings.effects ? 'on' : 'off'}>
      <div className="app-shell" style={tab === 'upgrade' ? { width: 'min(100%, 1130px)' } : undefined}>
        {settingsOpen ? (
          <SettingsPanel
            onClose={closeSettings}
            settings={uiSettings}
            onChange={setUiSettings}
            onHistory={() => { setSettingsOpen(false); setOpening(null); setSelectedCase(null); setTab('history'); window.scrollTo({top:0,behavior:'auto'}); }}
            telegramUser={telegramUser}
            profile={profile}
            onRefresh={async () => {
              const refreshed = await loadApp({ silent: true });
              showToast(refreshed ? 'Ma’lumotlar yangilandi' : 'Ma’lumotlarni yangilab bo‘lmadi');
            }}
          />
        ) : null}


        {toast ? <div className="toast" role="status">{toast}</div> : null}
        {error ? (
          <div className="global-alert" role="alert">
            <strong>Xatolik</strong>
            <span>{error}</span>
            <button type="button" aria-label="Xabarni yopish" onClick={() => setError('')}>
              <AppIcon name="close" />
            </button>
          </div>
        ) : null}
        {busy ? <div className="busy-indicator">Amal bajarilmoqda...</div> : null}

        {tab !== 'rocket' && tab !== 'dice' && tab !== 'deposit' ? (
          <GlobalBalanceBar
            telegramUser={telegramUser}
            profile={profile}
            profilePhotoUrl={profilePhotoUrl}
            onDeposit={() => openDeposit(tab)}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : null}

        <main
          className={`app-main ${
            selectedCase ? 'case-page-main' : ''
          } ${tab === 'rocket' ? 'rocket-game-main' : ''} ${
            tab === 'dice' ? 'dice-game-main' : ''
          } ${
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
              onInventory={() => { setOpening(null); setSelectedCase(null); setTab('inventory'); }}
              onAgain={() => openCase(selectedCase)}
              soundEnabled={uiSettings.sound}
              onRollComplete={finalizeCaseOpening}
              helpers={caseDetailHelpers}
            />
          ) : (
            <>
              {tab === 'home' ? (
                <HomeView
                  telegramUser={telegramUser}
                  profile={profile}
                  cases={activeCases}
                  giftsByCase={giftsByCase}
                  onGoCases={() => document.getElementById('case-collection')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}
                  onGoInventory={() => setTab('inventory')}
                  onGoUpgrade={openUpgradeLab}
                  onOpenCase={openCase}
                  onSelectCase={(caseItem) => {
                    setOpening(null); setSelectedCase(caseItem);
                    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                  }}
                  onOpenRocket={() => openRocketGame('home')}
                  onOpenPvp={() => openPvpHub('home')}
                  busy={busy}
                  featureSettings={featureSettings}
                />
              ) : null}

              {tab === 'games' ? (
                <CasesView
                  onGoHome={() => setTab('home')}
                  onOpenRocket={() => openRocketGame('games')}
                  onOpenDice={() => openDiceGame('games')}
                  onOpenPvp={() => openPvpHub('games')}
                  featureSettings={featureSettings}
                />
              ) : null}

              {tab === 'history' ? <GiftHistory history={history} gifts={inventoryGifts} withdrawals={withdrawals} onBack={() => setTab('home')} onRefresh={() => loadApp({silent:true})}/> : null}
              {tab === 'upgrade' ? <UpgradeLab history={history} inventoryGifts={inventoryGifts} catalogGifts={upgradeCatalog} cases={cases} withdrawals={withdrawals} upgradeRounds={upgradeRounds} apiPost={apiPost} onRefresh={() => loadApp({silent:true})} onToast={showToast} tg={tg} onBack={() => setTab('home')}/> : null}
              {tab === 'pvp' ? <PvpHub onBack={closePvpHub} /> : null}

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

              {tab === 'dice' ? (
                <DiceGame
                  apiPost={apiPost}
                  profile={profile}
                  tg={tg}
                  onBack={closeDiceGame}
                  onBalanceChange={updateRocketBalance}
                  onRoundStateChange={setDiceRoundActive}
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
                  gifts={inventoryGifts}
                  cases={cases}
                  withdrawals={withdrawals}
                  busy={busy}
                  onSell={sellInventoryReward}
                  onWithdraw={createWithdraw}
                />
              ) : null}

              {tab === 'bonus' ? (
                <BonusView
                  apiPost={apiPost}
                  tg={tg}
                  onToast={showToast}
                  onBalanceChange={updateRocketBalance}
                  userId={telegramUser?.id || profile?.id}
                />
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
                  active={!selectedCase && (tab === item.id || tab === 'rocket' || tab === 'dice' || tab === 'pvp')}
                  disabled={isCaseOpening || rocketRoundActive || diceRoundActive}
                  onClick={() => {
                    if (isCaseOpening || rocketRoundActive || diceRoundActive) return;
                    playNavFeedback(tg, uiSettings);
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
                  disabled={isCaseOpening || rocketRoundActive || diceRoundActive}
                  onClick={() => {
                    if (isCaseOpening || rocketRoundActive || diceRoundActive) return;
                    playNavFeedback(tg);
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
    </GiftAnimationContext.Provider>
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
      {coinIcon('gold')}
      <strong>{formatPrice(balance)}</strong>
    </div>
  );
}


function GlobalBalanceBar({
  telegramUser,
  profile,
  profilePhotoUrl,
  onDeposit,
  onSettings,
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
                  loading="eager"
                  fetchPriority="high"
                  unoptimized
                  draggable={false}
                />
              ) : (
                telegramUser?.first_name?.[0] || 'U'
              )}
            </div>
          </div>

          <button type="button" className={settingsStyles.gear} onClick={onSettings} aria-label="Sozlamalarni ochish" title="Sozlamalar">
            <AppIcon name="settings" />
          </button>

          <div className="home-balance-copy" aria-label="Balance">
            <strong>
              {coinIcon('gold')}
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
        {item.navArt ? (
          <Image className={iconClassName} src={`/feature/nav/pro/${item.id}-${active ? 'filled' : 'outline'}.svg`}
            alt="" width={28} height={28} priority unoptimized draggable={false} aria-hidden="true" />
        ) : item.image ? (
          <Image className={iconClassName} src={item.image} alt="" width={32} height={32}
            priority unoptimized draggable={false} aria-hidden="true" />
        ) : <AppIcon name={item.icon} />}
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
          loading="lazy"
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

function HomeGameBanner({
  variant,
  badge,
  title,
  description,
  actionText,
  image,
  onClick,
}) {
  const isPvp = variant === 'pvp';

  return (
    <button
      type="button"
      className={`${gameCardStyles.gameBanner} ${gameCardStyles[`${variant}Banner`]}`}
      onClick={onClick}
      aria-label={`${title}, ${badge}, ${actionText}`}
    >
      <Image
        src={image}
        alt=""
        className={gameCardStyles.bannerImage}
        width={1600}
        height={800}
        sizes="(max-width: 590px) 100vw, 560px"
        priority={!isPvp}
        loading="eager"
        fetchPriority={isPvp ? 'auto' : 'high'}
        unoptimized
        draggable={false}
      />

      <span className={gameCardStyles.bannerShade} aria-hidden="true" />

      <span className={gameCardStyles.bannerCopy}>
        <span className={gameCardStyles.bannerBadge}>
          <AppIcon name={isPvp ? 'swords' : 'rocket'} />
          {badge}
        </span>
        <span className={gameCardStyles.bannerTitle}>
          <strong>{title}</strong>
        </span>
        <small>{description}</small>
        <span className={gameCardStyles.bannerAction}>
          {actionText}
          <AppIcon name="chevronRight" />
        </span>
      </span>
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
  onGoUpgrade,
  onOpenCase,
  onSelectCase,
  onOpenRocket,
  onOpenPvp,
  busy,
}) {
  const featuredCases = cases || [];

  return (
    <section className="home-view premium-home">
      <section className={gameCardStyles.showcase} aria-labelledby="game-modes-title">
        <div className={gameCardStyles.showcaseHeader}>
          <div>
            <span className={gameCardStyles.showcaseKicker}>GAME MODES</span>
            <h2 id="game-modes-title" className={gameCardStyles.showcaseTitle}>Play. Win. Repeat.</h2>
          </div>
          <span className={gameCardStyles.showcaseStatus}>
            <i aria-hidden="true" />
            LIVE
          </span>
        </div>

        <div className={gameCardStyles.bannerStack}>
          <HomeGameBanner
            variant="rocket"
            badge="HOT!"
            title="ROCKET"
            description="Fly high. Cash out in time."
            actionText="Play now"
            image="/feature/game-banners/rocket-v41.webp"
            onClick={onOpenRocket}
          />

          <HomeGameBanner
            variant="pvp"
            badge="NEW!"
            title="PVP"
            description="Challenge rivals. Own the arena."
            actionText="Arena ochiq"
            image="/feature/game-banners/pvp-v41.webp"
            onClick={onOpenPvp}
          />
        </div>
      </section>

      <div className={gameCardStyles.actionsGrid}>
        <button type="button" className={`${gameCardStyles.actionCard} ${gameCardStyles.contracts}`} onClick={onGoCases}>
          <span className={gameCardStyles.actionIcon}>
            <AppIcon name="cases" />
          </span>
          <span className={gameCardStyles.actionCopy}>
            <strong>CASES</strong>
            <small>Browse &amp; open</small>
          </span>
          <span className={gameCardStyles.actionChevron}><AppIcon name="chevronRight" /></span>
        </button>

        <button type="button" className={`${gameCardStyles.actionCard} ${gameCardStyles.upgrade}`} onClick={onGoUpgrade}>
          <span className={gameCardStyles.actionIcon}>
            <AppIcon name="spark" />
          </span>
          <span className={gameCardStyles.actionCopy}>
            <strong>UPGRADE</strong>
            <small>Gift Upgrade Lab</small>
          </span>
          <span className={gameCardStyles.actionChevron}><AppIcon name="chevronRight" /></span>
        </button>
      </div>

      <div className="cases-section" id="case-collection">
        <div className="section-title-row cases-title-only">
          <div>
            <AppIcon name="cases" />
            <h2>Cases</h2>
          </div>
        </div>

        {featuredCases.length === 0 ? (
          <EmptyState
            icon="box"
            title="Hozircha case yo‘q"
            text="Yangi caselar shu yerda ko‘rinadi."
          />
        ) : (
          <div className="cases-grid premium-cases-grid">
            {featuredCases.map((caseItem, index) => (
              <CaseCard
                key={caseItem.id}
                eager={index < 2}
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

function CasesView({ onGoHome, onOpenDice, onOpenPvp }) {
  return (
    <section className="screen-stack">
      <div className="page-header premium-card games-page-header">
        <button type="button" className="ghost-back" onClick={onGoHome} aria-label="Bosh sahifaga qaytish">
          <AppIcon name="chevronLeft" />
        </button>
        <h1>Games</h1>
      </div>

      <div className={`${gameCardStyles.stack} ${gameCardStyles.gamesStack}`}>
        <DiceLobbyCard onClick={onOpenDice} />
        <PvpEntryCard onClick={onOpenPvp} />
      </div>
    </section>
  );
}

function CaseCard({ caseItem, gifts, busy, onOpen, onDetails, eager = false }) {
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  useEffect(() => {
    setImageReady(false);
    setImageFailed(false);
    setImageAttempt(0);
  }, [caseItem.image_url]);
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
        {caseItem.image_url && !imageFailed ? (
          <img className={caseOpeningStyles.caseTileBackdrop} src={caseItem.image_url}
            alt="" aria-hidden="true" loading={eager ? 'eager' : 'lazy'} decoding="async" />
        ) : null}
        <span className={caseOpeningStyles.caseTileHalo} aria-hidden="true" />

        {caseItem.image_url && !imageFailed ? (
          <img
            key={imageAttempt}
            className={caseOpeningStyles.caseTileImage}
            data-ready={imageReady}
            src={caseItem.image_url}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={eager ? 'auto' : 'low'}
            onLoad={() => setImageReady(true)}
            onError={() => { setImageFailed(true); setImageReady(false); }}
          />
        ) : null}
        {!caseItem.image_url || !imageReady || imageFailed ? (
          <span className={caseOpeningStyles.caseTileFallback} aria-hidden="true">
            <AppIcon name="box" />
          </span>
        ) : null}
        {imageFailed ? (
          <button type="button" className={caseOpeningStyles.caseTileRetry}
            onClick={(event) => { event.stopPropagation(); setImageReady(false); setImageFailed(false); setImageAttempt((attempt) => attempt + 1); }}
            aria-label="Case rasmini qayta yuklash">↻</button>
        ) : null}

        {badge ? (
          <span className={caseOpeningStyles.caseTileBadge}>{badge}</span>
        ) : null}
      </div>

      <div className={caseOpeningStyles.caseTileFooter}>
        <div className={caseOpeningStyles.caseTileCopy}>
          <h3>{caseItem.title}</h3>
          <p>{readyCount || gifts.length || 0} {(readyCount || gifts.length) === 1 ? 'reward' : 'rewards'}</p>
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

function TelegramTgsAnimation({ src, className, animate = false, fallbackUrl = '' }) {
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
          if (fallbackUrl) return;
          const url = await createTgsPreview(src);
          if (!cancelled) setPreviewUrl(url);
          return;
        }
        const [{ default: lottie }, animationData] = await Promise.all([import('lottie-web'), loadTgsData(src)]);

        if (cancelled || !containerRef.current) return;

        animation = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: false,
          autoplay: true,
          animationData,
        });
        animation.addEventListener('complete', () => {
          if (!cancelled && animation) {
            animation.goToAndStop(Math.max(0, animation.totalFrames - 1), true);
          }
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
  }, [src, animate, fallbackUrl]);

  return (
    <span className={`${className} tgs-gift-media`}>
      {!animate && (fallbackUrl || previewUrl) ? <img src={fallbackUrl || previewUrl} className="tgs-static-preview" alt="" draggable="false" /> : null}
      {animate ? <span ref={containerRef} className="tgs-gift-canvas" /> : null}
      {failed && fallbackUrl ? <img src={fallbackUrl} className="tgs-static-preview" alt="" draggable="false" /> : null}
      {failed && !fallbackUrl ? <AppIcon name="gift" /> : null}
    </span>
  );
}

// Image formats do not expose a reliable end-of-loop event across WebViews.
// Show the motion on entry and settle to the still thumbnail after a limited
// preview window. TGS/Lottie uses its actual complete event (above).
function OneShotImageGift({ src, still, className, play = true }) {
  const [loaded, setLoaded] = useState(false);
  const [ended, setEnded] = useState(false);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  useEffect(() => { setLoaded(false); setEnded(false); }, [src, play]);
  useEffect(() => {
    if (!loaded) return undefined;
    // GIF/WebP do not expose a finished event; freeze the preview after
    // an eight-second presentation window. With animations OFF, freeze at
    // the first loaded frame without starting another motion cycle.
    const timer = window.setTimeout(() => {
      if (!still && imageRef.current && canvasRef.current) {
        const img = imageRef.current;
        const canvas = canvasRef.current;
        if (!img.naturalWidth || !img.naturalHeight) return;
        const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        try { canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height); } catch { return; }
      }
      setEnded(true);
    }, play ? 8000 : 0);
    return () => window.clearTimeout(timer);
  }, [src, still, play, loaded]);
  return (
    <span className={`${className} gift-once-media`}>
      <img ref={imageRef} src={src} alt="" decoding="async" draggable={false}
        onLoad={() => setLoaded(true)}
        className="gift-once-img" style={{ display: ended ? 'none' : undefined }} />
      {ended && still ? <img className="gift-once-img" src={still} alt="" draggable={false}/> : null}
      <canvas ref={canvasRef} className="gift-once-img" style={{ display: ended && !still ? 'block' : 'none' }} aria-hidden="true" />
    </span>
  );
}

function OneShotVideoGift({ src, still, className }) {
  const [finished, setFinished] = useState(false);
  useEffect(() => { setFinished(false); }, [src]);
  return finished && still
    ? <img className={`${className} gift-media-visual`} src={still} alt="" draggable={false}/>
    : <video className={`${className} gift-media-visual`} src={src} muted playsInline autoPlay
        onEnded={() => setFinished(true)} onError={() => setFinished(true)}
        preload="auto" poster={still || undefined} aria-hidden="true" />;
}

function GiftMedia({ gift, compact = false, preferStatic = false, animate = false, animateOnEnter = false, viewportLazy = false }) {
  const giftAnimationsEnabled = useContext(GiftAnimationContext);
  const [brokenImageUrl, setBrokenImageUrl] = useState('');
  const mediaClass = compact ? 'gift-media compact' : 'gift-media';
  const [nearViewport, setNearViewport] = useState(!viewportLazy);
  const visibilityRef = useRef(null);

  useEffect(() => {
    if (!viewportLazy || nearViewport) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px 0px' });
    if (visibilityRef.current) observer.observe(visibilityRef.current);
    return () => observer.disconnect();
  }, [nearViewport, viewportLazy]);

  // Do not instantiate distant TGS/Lottie previews and animated image decoders.
  if (!nearViewport) {
    return <span ref={visibilityRef} className={mediaClass} aria-hidden="true"><AppIcon name="gift" /></span>;
  }

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
        {coinIcon('prism')}
      </span>
    );
  }

  const imageUrl = gift.image_url || gift.png_url || gift.webp_url || '';
  const animationUrl = gift.animation_url || '';
  const playOnce = giftAnimationsEnabled && !preferStatic && (animate || animateOnEnter);
  if (animationUrl && isTgsAnimationUrl(animationUrl)) {
    return <TelegramTgsAnimation src={animationUrl} className={mediaClass} animate={playOnce} fallbackUrl={imageUrl} />;
  }
  if (playOnce && /\\.(mp4|webm|mov)(?:[?#]|$)/i.test(animationUrl)) {
    return <OneShotVideoGift src={animationUrl} still={imageUrl} className={mediaClass} />;
  }
  if (playOnce && animationUrl && isImageAnimationUrl(animationUrl)) {
    return <OneShotImageGift src={animationUrl} still={imageUrl && imageUrl !== animationUrl ? imageUrl : ''} className={mediaClass} />;
  }

  if (imageUrl && brokenImageUrl !== imageUrl) {
    return (
      <img
        className={`${mediaClass} gift-media-visual`}
        src={imageUrl}
        alt=""
        loading={preferStatic ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={preferStatic ? 'high' : 'auto'}
        onError={() => setBrokenImageUrl(imageUrl)}
        draggable="false"
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        aria-hidden="true"
      />
    );
  }

  if (animationUrl && isImageAnimationUrl(animationUrl)) {
    return <OneShotImageGift src={animationUrl} still="" className={mediaClass} play={false} />;
  }

  return (
    <span className={mediaClass}>
      <AppIcon name="gift" />
    </span>
  );
}

function InventoryView({ history, gifts, cases, withdrawals, busy, onSell, onWithdraw }) {
  const [dialog, setDialog] = useState(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const rows = useMemo(
    () => getInventoryRows(history, gifts, cases, withdrawals),
    [history, gifts, cases, withdrawals]
  );

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) setDialog(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, busy]);

  async function confirmAction() {
    if (!dialog || busy) return;
    const result = dialog.kind === 'sell'
      ? await onSell(dialog.item.id)
      : await onWithdraw(dialog.item.id);
    if (result) setDialog(null);
  }

  return (
    <section className={'screen-stack inventory-view ' + inventoryStyles.section}>
      <div className={inventoryStyles.heading}>
        <div className={inventoryStyles.headingText}>
          <span className={inventoryStyles.eyebrow}>YOUR COLLECTION</span>
          <h1>Inventory</h1>
          <p>Yutgan Telegram giftlaringiz shu yerda saqlanadi.</p>
        </div>
        <span className={inventoryStyles.counter} aria-label={'Inventarda ' + rows.length + ' ta gift'}>
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className={inventoryStyles.empty}>
          <div>
            <strong>Inventaringiz hozircha bo‘sh</strong>
            <p>Case ochib qo‘lga kiritgan giftlaringiz shu yerda paydo bo‘ladi. Stars esa to‘g‘ridan-to‘g‘ri balansga qo‘shiladi.</p>
          </div>
        </div>
      ) : (
        <div className={inventoryStyles.grid}>
          {rows.slice(0, visibleCount).map(({ item, gift, caseItem, request }, index) => {
            const price = giftSellPrice(gift);
            const requested = Boolean(request);
            const requestStatus = String(request?.status || '');
            const statusText = !requested ? 'INVENTORY'
              : requestStatus === 'approved' ? 'TASDIQLANGAN'
              : requestStatus === 'rejected' ? 'RAD ETILGAN' : 'SO‘ROV YUBORILGAN';
            return (
              <article className={inventoryStyles.card} key={item.id}>
                <div className={inventoryStyles.artwork}>
                  <span className={inventoryStyles.state + (requested ? ' ' + inventoryStyles.statePending : '')}>
                    {statusText}
                  </span>
                  <GiftMedia gift={gift} animateOnEnter={index < 24} viewportLazy />
                </div>
                <div className={inventoryStyles.cardBody}>
                  <h3 className={inventoryStyles.title} title={gift?.title || ''}>{gift?.title || 'Collectible Gift'}</h3>
                  <p className={inventoryStyles.subtitle} title={caseItem?.title || ''}>{caseItem?.title || 'Mystery case'}</p>
                  <div className={inventoryStyles.priceRow}>
                    <StarIcon variant="badge" size={17} />
                    <span>{price > 0 ? formatPrice(price) : '—'}</span>
                    <span className={inventoryStyles.priceLabel}>sotish narxi</span>
                  </div>
                </div>
                <div className={inventoryStyles.actions}>
                  <button
                    type="button"
                    className={inventoryStyles.action + ' ' + inventoryStyles.sell}
                    disabled={busy || requested || price <= 0}
                    title={requested ? 'Bu gift bo‘yicha o‘tkazish so‘rovi bor' : price <= 0 ? 'Narx belgilanmagan' : 'Giftni Starsga sotish'}
                    onClick={() => setDialog({ kind: 'sell', item, gift, price })}
                  >
                    <AppIcon name="gift" /> Sotish
                  </button>
                  <button
                    type="button"
                    className={inventoryStyles.action + ' ' + inventoryStyles.transfer}
                    disabled={busy || requested}
                    title={requested ? 'O‘tkazish so‘rovi ko‘rib chiqilmoqda' : 'Admin orqali giftni o‘tkazish'}
                    onClick={() => setDialog({ kind: 'transfer', item, gift, price })}
                  >
                    <AppIcon name="withdraw" /> {requested ? 'So‘rov bor' : 'O‘tkazish'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rows.length > visibleCount ? (
        <button
          type="button"
          className={inventoryStyles.loadMore}
          onClick={() => setVisibleCount((count) => count + 24)}
        >
          Yana giftlarni ko‘rsatish · {rows.length - visibleCount} ta qolgan
        </button>
      ) : null}

      {dialog ? (
        <div className={inventoryStyles.dialogOverlay}>
          <div className={inventoryStyles.dialog} role="dialog" aria-modal="true" aria-labelledby="inventory-confirm-title" aria-describedby="inventory-confirm-details">
            <span className={inventoryStyles.dialogTag}>
              {dialog.kind === 'sell' ? 'Gift savdosi' : 'Gift o‘tkazish'}
            </span>
            <h2 id="inventory-confirm-title">
              {dialog.kind === 'sell' ? 'Giftni sotishni tasdiqlang' : 'O‘tkazish so‘rovi'}
            </h2>
            <p id="inventory-confirm-details">
              <strong>{dialog.gift?.title || 'Gift'}</strong>
              {dialog.kind === 'sell'
                ? ' sotiladi va tasdiqlangach inventardan olib tashlanadi. Stars balansingizga qo‘shiladi.'
                : ' uchun admin panelga o‘tkazish so‘rovi yuboriladi. Bu avtomatik Telegram transferi emas.'}
            </p>
            {dialog.kind === 'sell' ? (
              <div className={inventoryStyles.dialogAmount}>
                <StarIcon variant="royal" size={22} />
                {formatPrice(dialog.price)} Stars
              </div>
            ) : null}
            <small className={inventoryStyles.dialogNote}>
              {dialog.kind === 'sell'
                ? 'Yakuniy sotish narxini server tekshiradi. Sotish amalga oshgach uni qaytarib bo‘lmaydi.'
                : 'Admin so‘rovni tekshiradi. Tasdiqlash Telegramda yuborilganini anglatmaydi.'}
            </small>
            <div className={inventoryStyles.dialogActions}>
              <button type="button" className={inventoryStyles.cancel} disabled={busy} onClick={() => setDialog(null)}>Bekor qilish</button>
              <button type="button" className={inventoryStyles.confirm} disabled={busy} onClick={confirmAction}>
                {busy ? 'Bajarilmoqda...' : dialog.kind === 'sell' ? 'Ha, sotish' : 'So‘rov yuborish'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function bonusTaskIcon(type) {
  if (type === 'telegram_channel') return 'channel';
  if (type === 'telegram_bot') return 'bot';
  if (type === 'mini_app') return 'games';
  return 'globe';
}

function bonusRemaining(eligibleAt, now = Date.now()) {
  const remaining = Math.max(0, new Date(eligibleAt || 0).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function readBonusCache(userId) {
  if (typeof window === 'undefined' || !userId) return null;

  try {
    const cached = JSON.parse(window.sessionStorage.getItem(`gift_myst_bonus_v1_${userId}`) || 'null');
    if (!cached?.data || Date.now() - Number(cached.savedAt || 0) > 30_000) return null;
    return cached.data;
  } catch {
    return null;
  }
}

function writeBonusCache(userId, data) {
  if (typeof window === 'undefined' || !userId || !data) return;
  try {
    window.sessionStorage.setItem(
      `gift_myst_bonus_v1_${userId}`,
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    // Cache to‘lsa live so‘rov ishlashda davom etadi.
  }
}

function BonusView({ apiPost, tg, onToast, onBalanceChange, userId }) {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, earned: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionTaskId, setActionTaskId] = useState('');
  const [viewError, setViewError] = useState('');
  const [now, setNow] = useState(0);
  const [filter, setFilter] = useState('active');

  const applyData = useCallback((data) => {
    setTasks(data?.tasks || []);
    setStats(data?.stats || { total: 0, completed: 0, earned: 0 });
    setNow(Date.now());
    if (Number.isFinite(Number(data?.balance))) onBalanceChange?.(Number(data.balance));
    writeBonusCache(userId, data);
  }, [onBalanceChange, userId]);

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await apiPost('/api/bonus', { action: 'list' }, { timeoutMs: 6_000 });
      applyData(data);
      setViewError('');
    } catch (error) {
      setViewError(error?.message || 'Bonus tasklar yuklanmadi.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiPost, applyData]);

  useEffect(() => {
    const cached = readBonusCache(userId);
    if (cached) {
      applyData(cached);
      setLoading(false);
    }
    loadTasks({ silent: Boolean(cached) });
  }, [applyData, loadTasks, userId]);

  useEffect(() => {
    if (!tasks.some((task) => task.status === 'waiting')) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [tasks]);

  const replaceTask = (nextTask) => {
    if (!nextTask?.id) return;
    setTasks((current) => current.map((task) => task.id === nextTask.id ? nextTask : task));
  };

  const openTaskLink = (task) => {
    const url = String(task?.url || '');
    if (!url) return;

    if (/^https:\/\/(?:t\.me|telegram\.me)\//i.test(url) && typeof tg?.openTelegramLink === 'function') {
      tg.openTelegramLink(url);
    } else if (typeof tg?.openLink === 'function') {
      tg.openLink(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const startTask = async (task) => {
    if (actionTaskId) return;
    setActionTaskId(task.id);
    setViewError('');

    const request = apiPost('/api/bonus', { action: 'start', taskId: task.id });
    openTaskLink(task);

    try {
      const data = await request;
      replaceTask(data.task);
      onToast?.(task.waitMinutes > 0 ? `Task boshlandi. ${task.waitMinutes} daqiqadan keyin tekshiring.` : 'Task ochildi. Endi tekshirishingiz mumkin.');
      tg?.HapticFeedback?.impactOccurred?.('light');
    } catch (error) {
      setViewError(error?.message || 'Taskni boshlab bo‘lmadi.');
    } finally {
      setActionTaskId('');
    }
  };

  const claimTask = async (task) => {
    if (actionTaskId) return;
    setActionTaskId(task.id);
    setViewError('');

    try {
      const data = await apiPost('/api/bonus', { action: 'claim', taskId: task.id });
      replaceTask(data.task);
      if (Number.isFinite(Number(data.balance))) onBalanceChange?.(Number(data.balance));
      setStats((current) => ({
        ...current,
        completed: Math.min(Number(current.total || 0), Number(current.completed || 0) + 1),
        earned: Number(current.earned || 0) + Number(data.reward || 0),
      }));
      onToast?.(`+${formatPrice(data.reward || task.reward)} Stars bonus olindi ✨`);
      tg?.HapticFeedback?.notificationOccurred?.('success');
    } catch (error) {
      const message = error?.message || 'Task tekshiruvidan o‘tmadi.';
      setViewError(message);
      onToast?.(message);
      tg?.HapticFeedback?.notificationOccurred?.('warning');
    } finally {
      setActionTaskId('');
    }
  };

  const completedPercent = stats.total > 0
    ? Math.min(100, Math.round((Number(stats.completed || 0) / Number(stats.total)) * 100))
    : 0;
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const activeTasks = tasks.filter((task) => task.status !== 'completed');
  const pendingReward = activeTasks.reduce((sum, task) => sum + Number(task.reward || 0), 0);
  const visibleTasks = filter === 'all'
    ? tasks
    : filter === 'done'
      ? completedTasks
      : activeTasks;

  return (
    <section className="bonus-view bonus-v20">
      <header className="bonus-page-head">
        <div className="bonus-title-lockup">
          <span className="bonus-title-icon"><AppIcon name="bonus" /></span>
          <div>
            <h1>Bonus</h1>
            <small>Rewards center</small>
          </div>
        </div>
        <button
          className="bonus-refresh-button"
          type="button"
          aria-label="Yangilash"
          onClick={() => loadTasks({ silent: true })}
          disabled={refreshing}
        >
          <AppIcon name="refresh" className={refreshing ? 'is-spinning' : ''} />
        </button>
      </header>

      <section className="bonus-dashboard-card">
        <div className="bonus-dashboard-main">
          <span>Earned</span>
          <strong>
            <StarIcon variant="prism" size={28} />
            {formatPrice(stats.earned)}
          </strong>
          <small>Stars</small>
        </div>

        <div className="bonus-dashboard-progress">
          <div className="bonus-dashboard-progress-head">
            <span>Progress</span>
            <strong>{completedPercent}%</strong>
          </div>
          <div className="bonus-dashboard-track" role="progressbar" aria-label="Bonus progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completedPercent}>
            <i style={{ width: `${completedPercent}%` }} />
          </div>
          <div className="bonus-dashboard-meta">
            <span><b>{activeTasks.length}</b> active</span>
            <span><b>{completedTasks.length}</b> done</span>
          </div>
        </div>
      </section>

      <section className="bonus-mini-stats" aria-label="Bonus summary">
        <article>
          <span className="bonus-mini-icon"><AppIcon name="tasks" /></span>
          <div><small>Available</small><strong>{activeTasks.length}</strong></div>
        </article>
        <article>
          <span className="bonus-mini-icon"><StarIcon variant="mono" size={20} /></span>
          <div><small>Up next</small><strong>{formatPrice(pendingReward)}</strong></div>
        </article>
      </section>

      <div className="bonus-toolbar">
        <div className="bonus-filter-tabs" role="group" aria-label="Bonus filter">
          <button type="button" aria-pressed={filter === 'active'} className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>
            Active <span>{activeTasks.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'all'} className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>
            All <span>{tasks.length}</span>
          </button>
          <button type="button" aria-pressed={filter === 'done'} className={filter === 'done' ? 'is-active' : ''} onClick={() => setFilter('done')}>
            Done <span>{completedTasks.length}</span>
          </button>
        </div>
      </div>

      {viewError ? (
        <div className="bonus-inline-error" role="alert">
          <AppIcon name="warning" />
          <span>{viewError}</span>
          <button type="button" onClick={() => loadTasks()}>Retry</button>
        </div>
      ) : null}

      {loading ? (
        <div className="bonus-skeleton-list is-modern" aria-label="Bonus tasklar yuklanmoqda">
          {[1, 2, 3].map((item) => <span key={item} />)}
        </div>
      ) : visibleTasks.length ? (
        <div className="bonus-task-list is-modern">
          {visibleTasks.map((task) => {
            const remainingMs = Math.max(0, new Date(task.eligibleAt || 0).getTime() - now);
            const waiting = task.status === 'waiting' && remainingMs > 0;
            const ready = task.status === 'ready' || (task.status === 'waiting' && !waiting);
            const completed = task.status === 'completed';
            const acting = actionTaskId === task.id;

            return (
              <article
                className={`bonus-task-card is-modern is-${task.accent} is-${completed ? 'completed' : waiting ? 'waiting' : ready ? 'ready' : 'available'}`}
                key={task.id}
              >
                <div className="bonus-task-top">
                  <span className="bonus-task-icon"><AppIcon name={bonusTaskIcon(task.type)} /></span>
                  <div className="bonus-task-copy">
                    <span>{task.typeLabel || 'TASK'}</span>
                    <strong>{task.title}</strong>
                    <small>{completed ? 'Reward claimed' : task.subtitle || 'Complete the task to unlock the reward'}</small>
                  </div>
                  <span className="bonus-task-reward">
                    <StarIcon variant="reward" size={17} />
                    +{formatPrice(task.reward)}
                  </span>
                </div>

                <div className="bonus-task-footer">
                  <span className={`bonus-task-state is-${completed ? 'done' : waiting ? 'waiting' : ready ? 'ready' : 'new'}`}>
                    {completed ? <><AppIcon name="check" /> Done</> :
                      waiting ? <><AppIcon name="clock" /> {bonusRemaining(task.eligibleAt, now)}</> :
                      ready ? <><AppIcon name="ready" /> Ready</> :
                      <>New task</>}
                  </span>

                  {completed ? (
                    <button type="button" className="bonus-task-cta is-complete" disabled>
                      Claimed
                    </button>
                  ) : ready ? (
                    <button
                      type="button"
                      className="bonus-task-cta is-primary"
                      disabled={Boolean(actionTaskId)}
                      onClick={() => claimTask(task)}
                    >
                      {acting ? '...' : 'Claim'}
                    </button>
                  ) : waiting ? (
                    <button
                      type="button"
                      className="bonus-task-cta"
                      disabled={Boolean(actionTaskId)}
                      onClick={() => openTaskLink(task)}
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bonus-task-cta is-primary"
                      disabled={Boolean(actionTaskId)}
                      onClick={() => startTask(task)}
                    >
                      {acting ? 'Opening…' : 'Start'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bonus-empty-state is-modern">
          <span><AppIcon name={filter === 'done' ? 'tasks' : 'ready'} /></span>
          <strong>{filter === 'done' ? 'No completed tasks yet' : 'You’re all caught up'}</strong>
          <p>{filter === 'done' ? 'Completed rewards will appear here.' : 'New bonus tasks will appear here.'}</p>
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

const REFERRAL_CACHE_TTL_MS = 2 * 60_000;

function readReferralCache(userId) {
  if (typeof window === 'undefined' || !userId) return null;

  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(`gift_myst_referral_v2_${userId}`) || 'null'
    );
    if (!value?.overview || Date.now() - Number(value.savedAt || 0) > REFERRAL_CACHE_TTL_MS) return null;
    return value.overview;
  } catch {
    return null;
  }
}

function writeReferralCache(userId, overview) {
  if (typeof window === 'undefined' || !userId || !overview) return;

  try {
    window.sessionStorage.setItem(
      `gift_myst_referral_v2_${userId}`,
      JSON.stringify({ savedAt: Date.now(), overview })
    );
  } catch {
    // Cache yordamchi optimizatsiya, quota to‘lsa live API ishlashda davom etadi.
  }
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
  const [overview, setOverview] = useState(() => readReferralCache(telegramUser?.id || profile?.id));
  const [loadingOverview, setLoadingOverview] = useState(() => !readReferralCache(telegramUser?.id || profile?.id));
  const [refreshingOverview, setRefreshingOverview] = useState(false);
  const loadInFlightRef = useRef(false);
  const [overviewError, setOverviewError] = useState('');

  const botUsername = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'GiftMystBot').replace('@', '');
  const userId = telegramUser?.id || profile?.id || '';
  const referralCode = userId ? `ref_${userId}` : 'ref';
  const referralLink = buildStartAppLink(botUsername, referralCode);
  const inviterReward = Number(overview?.settings?.inviterReward || 0);
  const inviteeReward = Number(overview?.settings?.inviteeReward || 0);
  const shareText = inviteeReward > 0
    ? `Gift Mystga qo‘shiling — taskni bajarsangiz ${formatPrice(inviteeReward)} Stars bonus olasiz 🎁`
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
      if (!apiPost || loadInFlightRef.current) return;
      loadInFlightRef.current = true;

      if (silent) {
        setRefreshingOverview(true);
      } else {
        setLoadingOverview(true);
      }

      try {
        const data = await apiPost('/api/referral/overview', {}, { timeoutMs: 5_000 });
        setOverview(data.referral || null);
        writeReferralCache(userId, data.referral || null);
        onBalanceChange?.(data.referral?.balance);
        setOverviewError('');
      } catch (error) {
        setOverviewError(error?.message || 'Referal statistikasi yuklanmadi.');
      } finally {
        loadInFlightRef.current = false;
        setLoadingOverview(false);
        setRefreshingOverview(false);
      }
    },
    [apiPost, onBalanceChange, userId]
  );

  useEffect(() => {
    let cancelled = false;

    const cachedOverview = readReferralCache(userId);
    if (cachedOverview) {
      setOverview(cachedOverview);
      setLoadingOverview(false);
    }

    const initialLoad = async () => {
      if (cancelled) return;
      await loadOverview({ silent: Boolean(cachedOverview) });
    };

    initialLoad();

    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) loadOverview({ silent: true });
    }, 120_000);

    const handleVisibility = () => {
      if (!document.hidden && !readReferralCache(userId)) loadOverview({ silent: true });
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadOverview, userId]);

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
        <div className="page-title-lockup">
          <span className="page-title-icon"><AppIcon name="referral" /></span>
          <h1>Referral</h1>
        </div>
      </header>

      <article className="referral-reward-card premium-card">
        <div className="referral-reward-top">
          <div className="referral-reward-copy">
            <h2>Do‘st taklif qiling</h2>
            <strong className="referral-reward-amount">
              {loadingOverview ? '—' : `+${formatPrice(inviterReward)}`}
              <span>Stars</span>
            </strong>
            <span className="referral-invitee-chip">
              {coinIcon('reward')}
              <span>
                Do‘stingizga <strong>{loadingOverview ? '—' : `+${formatPrice(inviteeReward)} Stars`}</strong>
              </span>
            </span>
          </div>

          <div className="referral-reward-art" aria-hidden="true">
            <span className="referral-art-orbit" />
            <span className="referral-art-avatar is-main"><AppIcon name="referral" /></span>
            <span className="referral-art-avatar is-friend"><AppIcon name="userPlus" /></span>
            <span className="referral-art-star is-one">{coinIcon('mono')}</span>
            <span className="referral-art-star is-two"><AppIcon name="spark" /></span>
            <span className="referral-art-star is-three"><AppIcon name="check" /></span>
          </div>
        </div>

        <p style={{ margin: '3px 0 14px', color: '#b6bad7', fontSize: 12, lineHeight: 1.6 }}>
          Do‘stingiz birinchi taskni yakunlagach, Stars avtomatik hisoblanadi.
          Har bir referal uchun mukofot bir martalik.
        </p>
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
          <div>{coinIcon('prism')}<strong>{loadingOverview ? '—' : formatPrice(stats.earned)}</strong></div>
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
          <p>{telegramUser?.username ? `@${telegramUser.username}` : 'Telegram account'}</p>
          <strong>{money(profile?.balance)} Stars</strong>
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
              <span><AppIcon name="shield" /> Secure result</span>
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
