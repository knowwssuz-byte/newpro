'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const emptyCaseForm = {
  title: '',
  description: '',
  price: '0',
  image_url: '',
  badge_text: '',
  badge_color: '#8b5cf6',
  accent_color: '#22c55e',
  card_style: 'default',
  is_active: true,
};

const emptyLibraryForm = {
  gift_url: '',
  price: '',
};

const emptyGiftForm = {
  case_id: '',
  library_gift_id: '',
  title: '',
  price: '',
  chance: '10',
  real_chance: '10',
  stock: '1',
  rarity: 'rare',
  is_active: true,
};

const emptyFeatureForm = { slot: 'rocket', gift_url: '' };

const featureDefaults = {
  rocket: { scale: 80, offset_x: 0, offset_y: -16 },
  pvp: { scale: 78, offset_x: 0, offset_y: -18 },
};

const emptyDepositSettings = {
  starsEnabled: true,
  starsMin: 10,
  starsMax: 10000,
  tonEnabled: true,
  tonWallet: '',
  tonStarsRate: 0,
  tonMin: 0.1,
  tonMax: 100,
  tonExpiryMinutes: 45,
  giftEnabled: true,
  giftRecipient: '',
  giftCreditPercent: 85,
};

const emptyDiceSettings = {
  enabled: true,
  minBet: 1,
  maxBet: 10000,
  minWinChance: 5,
  maxWinChance: 85,
  houseEdgePercent: 3,
  rollDurationMs: 1400,
};

const emptyBonusTaskForm = {
  id: '',
  title: '',
  subtitle: '',
  type: 'telegram_channel',
  reward: '2',
  url: '',
  chatId: '',
  waitMinutes: '30',
  accent: 'purple',
  sortOrder: '0',
  isActive: true,
};

function featureLayout(slot, setting = {}) {
  const defaults = featureDefaults[slot] || featureDefaults.rocket;
  return {
    scale: Number.isFinite(Number(setting.scale)) ? Number(setting.scale) : defaults.scale,
    offset_x: Number.isFinite(Number(setting.offset_x)) ? Number(setting.offset_x) : defaults.offset_x,
    offset_y: Number.isFinite(Number(setting.offset_y)) ? Number(setting.offset_y) : defaults.offset_y,
  };
}

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

function rocketMultiplier(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? Math.max(1, number).toFixed(2) : '1.00'}x`;
}

function rocketStatusLabel(status) {
  if (status === 'betting') return 'STAVKA OCHIQ';
  if (status === 'flying') return 'UCHMOQDA';
  if (status === 'crashed') return 'PORTLADI';
  return 'SINXRONLANMOQDA';
}

function rocketSourceLabel(source) {
  if (source === 'manual') return 'Admin belgilagan';
  if (source === 'forced') return 'Admin to‘xtatgan';
  return 'Avtomatik';
}

function smallId(value = '') {
  const text = String(value || '');
  if (text.length <= 14) return text;
  return `${text.slice(0, 7)}...${text.slice(-5)}`;
}

function depositMethodLabel(method) {
  if (method === 'stars') return 'Telegram Stars';
  if (method === 'ton') return 'TON / GRAM';
  if (method === 'gift') return 'Telegram Gift';
  return 'Deposit';
}

function depositStatusLabel(status) {
  if (status === 'completed') return 'TUSHDI';
  if (status === 'confirming') return 'CHAIN CHECK';
  if (status === 'rejected') return 'RAD ETILDI';
  if (status === 'expired') return 'VAQTI TUGADI';
  if (status === 'cancelled') return 'BEKOR';
  return 'KUTILMOQDA';
}

function bonusTypeLabel(type) {
  if (type === 'telegram_channel') return 'Telegram kanal';
  if (type === 'telegram_bot') return 'Telegram bot';
  if (type === 'mini_app') return 'Mini App';
  return 'Havolaga kirish';
}

function adminDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('uz-UZ', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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


const backgroundPresets = [
  { title: 'Purple', color: '#7c3aed' },
  { title: 'Blue', color: '#2563eb' },
  { title: 'Gold', color: '#f59e0b' },
  { title: 'Green', color: '#10b981' },
  { title: 'Rose', color: '#e11d48' },
  { title: 'Dark', color: '#111827' },
];

function gradientFromColor(color = '#7c3aed') {
  return String(color || '#7c3aed').trim() || '#7c3aed';
}

function firstGradientColor(value = '') {
  const match = String(value || '').match(/#[0-9a-fA-F]{6}/);

  return match?.[0] || '#7c3aed';
}


function CaseImage({ caseItem }) {
  const url = caseItem?.image_url || '';

  if (!url) {
    return <span className="admin-mini-icon">📦</span>;
  }

  return <img className="admin-gift-media admin-case-media" src={url} alt="" loading="lazy" draggable="false" />;
}

function GiftImage({ gift, className = 'admin-gift-media' }) {
  const url = gift?.image_url || gift?.png_url || gift?.webp_url || '';
  const animationUrl = gift?.animation_url || '';

  if (!url && animationUrl) {
    return <AdminLottie src={animationUrl} className={className} />;
  }

  if (!url) {
    return <span className="admin-mini-icon">🎁</span>;
  }

  return <img className={className} src={url} alt="" loading="lazy" draggable="false" />;
}

function AdminLottie({ src, className }) {
  const ref = useRef(null);

  useEffect(() => {
    let animation = null;
    let cancelled = false;
    (async () => {
      try {
        const { default: lottie } = await import('lottie-web');
        const response = await fetch(`/api/gift-animation?url=${encodeURIComponent(src)}`, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Animation download failed: ${response.status}`);
        const payload = await response.json();
        const animationData = payload?.animationData || payload;
        if (cancelled || !ref.current) return;
        animation = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: true, autoplay: true, animationData });
      } catch { /* preview buzilsa admin form ishlashda davom etadi */ }
    })();
    return () => { cancelled = true; animation?.destroy(); };
  }, [src]);

  return <span ref={ref} className={`${className} admin-lottie-media`} aria-hidden="true" />;
}

function FeaturePreviewCard({ slot, setting, onLayoutChange, onSave, busy }) {
  const layout = featureLayout(slot, setting);
  const isPvp = slot === 'pvp';
  const style = {
    '--feature-scale': String(layout.scale / 100),
    '--feature-x': `${layout.offset_x}px`,
    '--feature-y': `${layout.offset_y}px`,
  };

  const change = (key, value) => onLayoutChange(slot, key, Number(value));

  return (
    <article className="admin-feature-editor">
      <div className={`promo-banner promo-image-banner premium-promo ${slot} admin-feature-preview`} style={style}>
        <span className="promo-shine" aria-hidden="true" />
        <div className="promo-banner-copy">
          <span className={`promo-badge ${isPvp ? 'new' : ''}`}>{isPvp ? '✦ NEW!' : '🚀 HOT!'}</span>
          <span className="promo-banner-text"><strong>{slot.toUpperCase()}</strong><em>{isPvp ? 'Battle mode · Tez orada' : 'Mini game · Tez orada'}</em></span>
          <span className="promo-action-chip">Tez orada <b>›</b></span>
        </div>
        <div className="promo-webp-stage" aria-hidden="true">
          {setting?.animation_url ? <AdminLottie src={setting.animation_url} className="promo-webp promo-feature-animation" /> : <span className="promo-fallback-icon">{isPvp ? '🥊' : '🚀'}</span>}
        </div>
      </div>

      <div className="admin-feature-controls">
        <label><span>Hajmi</span><output>{layout.scale}%</output><input type="range" min="35" max="160" step="1" value={layout.scale} onChange={(event) => change('scale', event.target.value)} /></label>
        <label><span>Gorizontal X</span><output>{layout.offset_x}px</output><input type="range" min="-140" max="140" step="1" value={layout.offset_x} onChange={(event) => change('offset_x', event.target.value)} /></label>
        <label><span>Vertikal Y</span><output>{layout.offset_y}px</output><input type="range" min="-100" max="100" step="1" value={layout.offset_y} onChange={(event) => change('offset_y', event.target.value)} /></label>
        <div className="admin-feature-control-actions">
          <button type="button" className="admin-secondary-button" onClick={() => onLayoutChange(slot, null, featureDefaults[slot])}>Standart</button>
          <button type="button" onClick={() => onSave(slot)} disabled={busy}>{busy ? 'Saqlanmoqda...' : 'Joylashuvni saqlash'}</button>
        </div>
      </div>
    </article>
  );
}

export default function AdminClient() {
  const [adminKey, setAdminKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState('cases');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [cases, setCases] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [giftLibrary, setGiftLibrary] = useState([]);
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [featureSettings, setFeatureSettings] = useState({});
  const [featureForm, setFeatureForm] = useState(emptyFeatureForm);
  const [rocketControl, setRocketControl] = useState(null);
  const [rocketConnection, setRocketConnection] = useState('idle');
  const [rocketActionBusy, setRocketActionBusy] = useState('');
  const [rocketNextMultiplier, setRocketNextMultiplier] = useState('');
  const [deposits, setDeposits] = useState([]);
  const [depositSettings, setDepositSettings] = useState(
    emptyDepositSettings
  );
  const [diceSettings, setDiceSettings] = useState(emptyDiceSettings);
  const [depositDrafts, setDepositDrafts] = useState({});
  const [bonusTasks, setBonusTasks] = useState([]);
  const [bonusStats, setBonusStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    started: 0,
    completed: 0,
    paid: 0,
  });
  const [bonusTaskForm, setBonusTaskForm] = useState(emptyBonusTaskForm);

  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [caseFile, setCaseFile] = useState(null);
  const [libraryForm, setLibraryForm] = useState(emptyLibraryForm);
  const [giftForm, setGiftForm] = useState(emptyGiftForm);
  const [backgroundColor, setBackgroundColor] = useState('#7c3aed');

  const [balanceUserId, setBalanceUserId] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');

  const selectedLibraryGift = useMemo(() => {
    return giftLibrary.find((gift) => gift.id === giftForm.library_gift_id) || null;
  }, [giftForm.library_gift_id, giftLibrary]);

  useEffect(() => {
    const key = window.localStorage.getItem('gift_myst_admin_key') || '';
    if (key) {
      setAdminKey(key);
      setSaved(true);
      bootstrap(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  }

  async function run(callback, successText) {
    setBusy(true);
    setError('');

    try {
      const result = await callback();
      if (successText) showToast(successText);
      return result;
    } catch (err) {
      setError(err.message || 'Xatolik yuz berdi');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function applyBootstrap(data) {
    setCases(sortCasesForDisplay(data.cases || []));
    setGifts(data.gifts || []);
    setUsers(data.users || []);
    setWithdrawals(data.withdrawals || []);
    setGiftLibrary(data.giftLibrary || []);
    setFeatureSettings(data.featureSettings || {});
    setDeposits(data.deposits || []);
    setDepositSettings({
      ...emptyDepositSettings,
      ...(data.depositSettings || {}),
    });
    setDiceSettings({
      ...emptyDiceSettings,
      ...(data.diceSettings || {}),
    });
    setBonusTasks(data.bonusTasks || []);
    setBonusStats((current) => ({
      ...current,
      ...(data.bonusStats || {}),
    }));
    setDepositDrafts((current) =>
      Object.fromEntries(
        (data.deposits || []).map((deposit) => [
          deposit.id,
          current[deposit.id] || {
            credit:
              Number(deposit.credit_amount || 0) > 0
                ? String(Math.floor(Number(deposit.credit_amount)))
                : '',
            note: deposit.admin_note || '',
          },
        ])
      )
    );

    const sortedCases = sortCasesForDisplay(data.cases || []);
    const firstCaseId = sortedCases?.[0]?.id || '';
    setGiftForm((current) => ({
      ...current,
      case_id: current.case_id || firstCaseId,
    }));
  }

  async function callAdmin(action, payload = {}, keyOverride = '') {
    const key = keyOverride || adminKey;

    if (!key) {
      throw new Error('Admin kalit kiriting.');
    }

    const response = await fetch('/api/browser-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Server xatosi (${response.status})`);
    }

    return data;
  }

  async function callAdminForm(formData, keyOverride = '') {
    const key = keyOverride || adminKey;

    if (!key) {
      throw new Error('Admin kalit kiriting.');
    }

    const response = await fetch('/api/browser-admin', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `Server xatosi (${response.status})`);
    }

    return data;
  }

  async function bootstrap(keyOverride = '') {
    const data = await run(() => callAdmin('bootstrap', {}, keyOverride));
    if (!data) return;

    applyBootstrap(data);
  }

  function applyRocketControl(data) {
    const next = data?.rocket || data;

    if (!next?.currentRound) return;

    setRocketControl(next);
    setRocketConnection('live');
    setRocketNextMultiplier((current) => {
      if (document.activeElement?.id === 'rocket-next-multiplier') {
        return current;
      }

      return Number(next.nextRound?.crashMultiplier || 1).toFixed(2);
    });
  }

  useEffect(() => {
    if (!saved || tab !== 'rocket' || !adminKey) return undefined;

    let cancelled = false;
    let timer = null;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') {
        if (!cancelled) timer = window.setTimeout(poll, 650);
        return;
      }

      inFlight = true;

      try {
        const data = await callAdmin('rocket_state');
        if (!cancelled) applyRocketControl(data);
      } catch (err) {
        if (!cancelled) {
          setRocketConnection('reconnecting');
          setError(err.message || 'Rocket holatini olishda xatolik.');
        }
      } finally {
        inFlight = false;
        if (!cancelled) timer = window.setTimeout(poll, 500);
      }
    };

    setRocketConnection('connecting');
    poll();

    const wake = () => {
      if (document.visibilityState !== 'visible' || cancelled || inFlight) {
        return;
      }

      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(poll, 0);
    };

    document.addEventListener('visibilitychange', wake);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
    // callAdmin/applyRocketControl intentionally use the current admin key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, saved, tab]);

  async function runRocketAction(action, payload, successText) {
    if (rocketActionBusy) return null;

    setRocketActionBusy(action);
    setError('');

    try {
      const data = await callAdmin(action, payload);
      applyRocketControl(data);
      if (successText) showToast(successText);
      return data;
    } catch (err) {
      setError(err.message || 'Rocket boshqaruvida xatolik.');
      return null;
    } finally {
      setRocketActionBusy('');
    }
  }

  async function setRocketBias(biasMode) {
    await runRocketAction(
      'rocket_set_bias',
      { biasMode },
      'Rocket avtomatik rejimi yangilandi ✅'
    );
  }

  async function saveNextRocketMultiplier(event) {
    event.preventDefault();
    const multiplier = Number(rocketNextMultiplier);

    if (
      !Number.isFinite(multiplier) ||
      multiplier < 1 ||
      multiplier > 1000
    ) {
      setError('Koeffitsiyent 1.00x–1000.00x oralig‘ida bo‘lishi kerak.');
      return;
    }

    await runRocketAction(
      'rocket_set_next',
      { multiplier: Number(multiplier.toFixed(2)) },
      `Keyingi raund ${rocketMultiplier(multiplier)} qilib saqlandi ✅`
    );
  }

  async function resetNextRocketMultiplier() {
    await runRocketAction(
      'rocket_reset_next',
      {},
      'Keyingi raund avtomatik rejimga qaytdi ✅'
    );
  }

  async function launchRocketNow() {
    if (
      !window.confirm(
        'Stavka vaqtini hozir yakunlab, raketani darhol uchirasizmi?'
      )
    ) {
      return;
    }

    await runRocketAction(
      'rocket_launch_now',
      {},
      'Rocket hozir uchirildi 🚀'
    );
  }

  async function forceRocketCrash() {
    if (
      !window.confirm(
        'Aktiv Rocket raundini aynan hozirgi koeffitsiyentda portlatasizmi? Bu barcha ochiq stavkalarga ta’sir qiladi.'
      )
    ) {
      return;
    }

    await runRocketAction(
      'rocket_force_crash',
      {},
      'Aktiv Rocket raundi portlatildi 💥'
    );
  }

  async function login(event) {
    event.preventDefault();

    const cleanKey = adminKey.trim();
    const data = await run(() => callAdmin('bootstrap', {}, cleanKey), 'Admin panel ochildi ✅');
    if (!data) return;

    window.localStorage.setItem('gift_myst_admin_key', cleanKey);
    setSaved(true);
    applyBootstrap(data);
  }

  function logout() {
    window.localStorage.removeItem('gift_myst_admin_key');
    setSaved(false);
    setAdminKey('');
    setCases([]);
    setGifts([]);
    setUsers([]);
    setWithdrawals([]);
    setGiftLibrary([]);
    setRocketControl(null);
    setRocketConnection('idle');
    setDeposits([]);
    setDepositSettings(emptyDepositSettings);
    setDepositDrafts({});
    setBonusTasks([]);
    setBonusStats({ totalTasks: 0, activeTasks: 0, started: 0, completed: 0, paid: 0 });
    setBonusTaskForm(emptyBonusTaskForm);
  }

  async function createCase(event) {
    event.preventDefault();

    if (!caseFile) {
      setError('Case uchun PNG, JPG yoki SVG rasm tanlang.');
      return;
    }

    const formData = new FormData();
    formData.append('action', 'case_create_upload');
    formData.append('adminKey', adminKey);
    formData.append('title', caseForm.title);
    formData.append('description', caseForm.description);
    formData.append('price', caseForm.price);
    formData.append('badge_text', caseForm.badge_text);
    formData.append('badge_color', caseForm.badge_color);
    formData.append('accent_color', caseForm.accent_color);
    formData.append('card_style', caseForm.card_style);
    formData.append('is_active', String(caseForm.is_active !== false));
    formData.append('image_file', caseFile);

    const data = await run(() => callAdminForm(formData), 'Case qo‘shildi ✅');

    if (!data) return;

    applyBootstrap(data);
    setCaseForm(emptyCaseForm);
    setCaseFile(null);

    const input = document.getElementById('case-image-input');
    if (input) input.value = '';
  }

  async function updateCase(caseId, updates) {
    await run(() => callAdmin('case_update', { caseId, updates }), 'Case yangilandi ✅');
    await bootstrap();
  }

  async function togglePinCase(caseItem) {
    await run(
      () =>
        callAdmin('case_update', {
          caseId: caseItem.id,
          updates: {
            is_pinned: !caseItem.is_pinned,
          },
        }),
      caseItem.is_pinned ? 'Case pin olib tashlandi' : 'Case pin qilindi 📌'
    );

    await bootstrap();
  }

  async function moveCase(caseId, direction) {
    const sorted = sortCasesForDisplay(cases);
    const currentIndex = sorted.findIndex((item) => String(item.id) === String(caseId));

    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const next = [...sorted];
    const [item] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, item);

    setCases(next.map((caseItem, index) => ({ ...caseItem, sort_order: index + 1 })));

    const result = await run(
      () =>
        callAdmin('case_reorder', {
          caseIds: next.map((caseItem) => caseItem.id),
        }),
      'Case joylashuvi yangilandi ✅',
      { silent: true }
    );

    if (!result) {
      await bootstrap();
    }
  }

  async function deleteCase(caseId) {
    if (!window.confirm('Case o‘chirilsinmi?')) return;

    await run(() => callAdmin('case_delete', { caseId }), 'Case o‘chirildi');
    await bootstrap();
  }

  async function createLibraryGift(event) {
    event.preventDefault();

    const data = await run(
      () => callAdmin('gift_link_import', { giftUrl: libraryForm.gift_url, price: Number(libraryForm.price || 0) }),
      'Telegram gift linkdan yuklandi ✅'
    );

    if (!data) return;

    applyBootstrap(data);
    setLibraryForm(emptyLibraryForm);
  }

  async function updateLibraryGift(giftId, updates) {
    await run(() => callAdmin('gift_library_update', { giftId, updates }), 'Gift baza yangilandi ✅');
    await bootstrap();
  }

  async function deleteLibraryGift(giftId) {
    if (!window.confirm('Gift bazadan o‘chirilsinmi?')) return;

    await run(() => callAdmin('gift_library_delete', { giftId }), 'Gift bazadan o‘chirildi');
    await bootstrap();
  }

  function applyLibraryGift(giftId) {
    const gift = giftLibrary.find((item) => item.id === giftId);

    if (!gift) {
      setGiftForm((current) => ({
        ...current,
        library_gift_id: '',
        title: '',
        price: '',
      }));
      return;
    }

    setGiftForm((current) => ({
      ...current,
      library_gift_id: gift.id,
      title: gift.title || '',
      price: String(gift.price ?? ''),
      real_chance: current.real_chance || current.chance || '10',
    }));
  }

  async function createGiftFromLibrary(event) {
    event.preventDefault();

    const data = await run(
      () =>
        callAdmin('gift_create_from_library', {
          giftData: {
            ...giftForm,
            chance: Number(giftForm.chance || 0),
            real_chance: Number(giftForm.real_chance || giftForm.chance || 0),
            stock: Number(giftForm.stock || 0),
          },
        }),
      'Gift casega yuklandi ✅'
    );

    if (!data) return;

    applyBootstrap(data);
    setGiftForm((current) => ({
      ...emptyGiftForm,
      case_id: current.case_id,
      background_value: current.background_value,
    }));
  }

  async function updateFeatureAnimation(event) {
    event.preventDefault();
    const data = await run(
      () => callAdmin('feature_animation_update', { slot: featureForm.slot, giftUrl: featureForm.gift_url }),
      `${featureForm.slot.toUpperCase()} animatsiyasi yangilandi ✅`
    );
    if (!data) return;
    applyBootstrap(data);
    setFeatureForm((current) => ({ ...current, gift_url: '' }));
  }

  function changeFeatureLayout(slot, key, value) {
    setFeatureSettings((current) => {
      const settingKey = `feature_${slot}`;
      const nextLayout = key ? { [key]: value } : value;
      return { ...current, [settingKey]: { ...(current[settingKey] || {}), ...nextLayout } };
    });
  }

  async function saveFeatureLayout(slot) {
    const layout = featureLayout(slot, featureSettings[`feature_${slot}`]);
    const data = await run(
      () => callAdmin('feature_layout_update', { slot, ...layout }),
      `${slot.toUpperCase()} joylashuvi saqlandi ✅`
    );
    if (data) applyBootstrap(data);
  }

  async function updateGift(giftId, updates) {
    await run(() => callAdmin('gift_update', { giftId, updates }), 'Gift yangilandi ✅');
    await bootstrap();
  }

  async function deleteGift(giftId) {
    if (!window.confirm('Gift case ichidan o‘chirilsinmi?')) return;

    await run(() => callAdmin('gift_delete', { giftId }), 'Gift o‘chirildi');
    await bootstrap();
  }

  async function addBalance(event) {
    event.preventDefault();

    await run(
      () =>
        callAdmin('user_add_balance', {
          userId: balanceUserId,
          amount: balanceAmount,
        }),
      'Balance yangilandi ✅'
    );

    setBalanceAmount('');
    await bootstrap();
  }

  async function toggleBan(user) {
    await run(
      () =>
        callAdmin('user_ban', {
          userId: user.id,
          is_banned: !user.is_banned,
        }),
      user.is_banned ? 'Ban olib tashlandi' : 'User ban qilindi'
    );

    await bootstrap();
  }

  async function updateWithdrawal(requestId, status) {
    await run(() => callAdmin('withdraw_update', { requestId, status }), 'Withdraw yangilandi ✅');
    await bootstrap();
  }

  async function saveDepositSettings(event) {
    event.preventDefault();

    const data = await run(
      () =>
        callAdmin('deposit_settings_update', {
          settings: {
            ...depositSettings,
            starsMin: Number(depositSettings.starsMin),
            starsMax: Number(depositSettings.starsMax),
            tonStarsRate: Number(depositSettings.tonStarsRate),
            tonMin: Number(depositSettings.tonMin),
            tonMax: Number(depositSettings.tonMax),
            tonExpiryMinutes: Number(depositSettings.tonExpiryMinutes),
            giftCreditPercent: Number(depositSettings.giftCreditPercent),
          },
        }),
      'Deposit sozlamalari saqlandi ✅'
    );

    if (data?.depositSettings) {
      setDepositSettings({
        ...emptyDepositSettings,
        ...data.depositSettings,
      });
    }
  }

  async function saveDiceSettings(event) {
    event.preventDefault();

    const data = await run(
      () =>
        callAdmin('dice_settings_update', {
          settings: {
            ...diceSettings,
            minBet: Number(diceSettings.minBet),
            maxBet: Number(diceSettings.maxBet),
            minWinChance: Number(diceSettings.minWinChance),
            maxWinChance: Number(diceSettings.maxWinChance),
            houseEdgePercent: Number(diceSettings.houseEdgePercent),
            rollDurationMs: Number(diceSettings.rollDurationMs),
          },
        }),
      'Dice sozlamalari saqlandi ✅'
    );

    if (data?.diceSettings) {
      setDiceSettings({
        ...emptyDiceSettings,
        ...data.diceSettings,
      });
    }
  }

  async function saveBonusTask(event) {
    event.preventDefault();

    const data = await run(
      () => callAdmin('bonus_task_save', {
        taskData: {
          ...bonusTaskForm,
          reward: Number(bonusTaskForm.reward),
          waitMinutes: Number(bonusTaskForm.waitMinutes),
          sortOrder: Number(bonusTaskForm.sortOrder),
        },
      }),
      bonusTaskForm.id ? 'Task yangilandi ✅' : 'Yangi bonus task qo‘shildi ✅'
    );

    if (!data) return;
    applyBootstrap(data);
    setBonusTaskForm(emptyBonusTaskForm);
  }

  function editBonusTask(task) {
    setBonusTaskForm({
      id: task.id || '',
      title: task.title || '',
      subtitle: task.subtitle || '',
      type: task.type || 'external_link',
      reward: String(task.reward ?? 2),
      url: task.url || '',
      chatId: task.chatId || '',
      waitMinutes: String(task.waitMinutes ?? 30),
      accent: task.accent || 'purple',
      sortOrder: String(task.sortOrder ?? 0),
      isActive: task.isActive !== false,
    });
    setTab('bonuses');
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  async function toggleBonusTask(task) {
    const data = await run(
      () => callAdmin('bonus_task_save', {
        taskData: { ...task, isActive: task.isActive === false },
      }),
      task.isActive === false ? 'Task yoqildi ✅' : 'Task vaqtincha o‘chirildi'
    );
    if (data) applyBootstrap(data);
  }

  async function deleteBonusTask(task) {
    if (!window.confirm(`“${task.title}” taski o‘chirilsinmi?`)) return;

    const data = await run(
      () => callAdmin('bonus_task_delete', { taskId: task.id }),
      'Task o‘chirildi'
    );
    if (data) {
      applyBootstrap(data);
      if (bonusTaskForm.id === task.id) setBonusTaskForm(emptyBonusTaskForm);
    }
  }

  function changeDepositDraft(depositId, key, value) {
    setDepositDrafts((current) => ({
      ...current,
      [depositId]: {
        credit: current[depositId]?.credit || '',
        note: current[depositId]?.note || '',
        [key]: value,
      },
    }));
  }

  async function resolveDeposit(deposit, status) {
    const draft = depositDrafts[deposit.id] || {};
    const creditAmount = Number(draft.credit);
    const verb = status === 'approved' ? 'tasdiqlansinmi' : 'rad etilsinmi';

    if (
      status === 'approved' &&
      (!Number.isFinite(creditAmount) || creditAmount <= 0)
    ) {
      setError('Tasdiqlashdan oldin tushadigan Stars miqdorini kiriting.');
      return;
    }

    if (
      !window.confirm(
        `${depositMethodLabel(deposit.method)} deposit ${verb}`
      )
    ) {
      return;
    }

    const data = await run(
      () =>
        callAdmin('deposit_resolve', {
          depositId: deposit.id,
          status,
          creditAmount: status === 'approved' ? creditAmount : null,
          note: draft.note || '',
        }),
      status === 'approved'
        ? 'Deposit balansga tushirildi ✅'
        : 'Deposit rad etildi'
    );

    if (data) await bootstrap();
  }

  const currentRocketRound = rocketControl?.currentRound || null;
  const nextRocketRound = rocketControl?.nextRound || null;
  const rocketBiasMode = rocketControl?.biasMode || 'standard';
  const pendingDepositCount = deposits.filter((deposit) =>
    ['pending', 'confirming'].includes(deposit.status)
  ).length;
  const completedDepositTotal = deposits
    .filter((deposit) => deposit.status === 'completed')
    .reduce((sum, deposit) => sum + Number(deposit.credit_amount || 0), 0);

  if (!saved) {
    return (
      <main className="browser-admin-page">
        <form className="browser-admin-login" onSubmit={login}>
          <span>Secure browser panel</span>
          <h1>Gift Myst Admin</h1>
          <p>ADMIN_PANEL_KEY kiriting.</p>
          <input value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Admin key" type="password" />
          <button type="submit" disabled={busy}>{busy ? 'Tekshirilmoqda...' : 'Kirish'}</button>
          {error ? <div className="browser-admin-error">{error}</div> : null}
        </form>
      </main>
    );
  }

  return (
    <main className="browser-admin-page manual-admin-page">
      {toast ? <div className="browser-admin-toast">{toast}</div> : null}

      <section className="browser-admin-shell">
        <header className="browser-admin-header">
          <div>
            <span>Secure browser panel</span>
            <h1>Gift Myst Admin</h1>
          </div>
          <div className="browser-admin-header-actions">
            <button type="button" onClick={() => bootstrap()} disabled={busy}>Refresh</button>
            <button type="button" className="admin-danger" onClick={logout}>Logout</button>
          </div>
        </header>

        {error ? <div className="browser-admin-error">{error}</div> : null}

        <nav className="browser-admin-tabs simple-manual-tabs">
          {[
            ['cases', 'Cases'],
            ['library', 'Gift baza'],
            ['gifts', 'Casega gift'],
            ['features', 'PVP / Rocket'],
            ['rocket', 'Rocket control'],
            ['dice', 'Dice settings'],
            ['bonuses', 'Bonus tasks'],
            [
              'deposits',
              pendingDepositCount
                ? `Deposits (${pendingDepositCount})`
                : 'Deposits',
            ],
            ['users', 'Users'],
            ['withdrawals', 'Withdrawals'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>

        {tab === 'cases' ? (
          <section className="browser-admin-grid">
            <form className="browser-admin-form case-upload-form" onSubmit={createCase}>
              <div className="admin-form-heading">
                <span>Case image upload</span>
                <h2>Case qo‘shish</h2>
                <p>Endi case rasmi URL emas, fayl sifatida yuklanadi. PNG, JPG yoki SVG ishlaydi. Pastdagi ro‘yxatda Pin va ↑↓ bilan joylashuvni boshqarasiz.</p>
              </div>

              <label>
                <span>Case nomi</span>
                <input placeholder="Title" value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} required />
              </label>

              <label>
                <span>Izoh</span>
                <input placeholder="Description" value={caseForm.description} onChange={(event) => setCaseForm({ ...caseForm, description: event.target.value })} />
              </label>

              <label>
                <span>Ochish narxi</span>
                <input type="number" placeholder="Price" value={caseForm.price} onChange={(event) => setCaseForm({ ...caseForm, price: event.target.value })} />
              </label>

              <label>
                <span>Case rasmi</span>
                <input
                  id="case-image-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,.png,.jpg,.jpeg,.svg"
                  onChange={(event) => setCaseFile(event.target.files?.[0] || null)}
                  required
                />
                <small className="manual-field-note">PNG tavsiya qilinadi. JPG va SVG ham qo‘shildi.</small>
              </label>

              <div className="browser-admin-two">
                <label>
                  <span>Badge rangi</span>
                  <input type="color" value={caseForm.badge_color} onChange={(event) => setCaseForm({ ...caseForm, badge_color: event.target.value })} />
                </label>
                <label>
                  <span>Accent rangi</span>
                  <input type="color" value={caseForm.accent_color} onChange={(event) => setCaseForm({ ...caseForm, accent_color: event.target.value })} />
                </label>
              </div>

              <button type="submit" disabled={busy}>{busy ? 'Yuklanmoqda...' : 'Case qo‘shish'}</button>
            </form>

            <div className="browser-admin-list">
              <h2>Cases</h2>
              {sortCasesForDisplay(cases).map((caseItem, index) => (
                <div className={`browser-admin-item admin-case-order-item ${caseItem.is_pinned ? 'is-pinned' : ''}`} key={caseItem.id}>
                  <CaseImage caseItem={caseItem} />
                  <div>
                    <strong>{caseItem.is_pinned ? '📌 ' : ''}{caseItem.title}</strong>
                    <p>
                      #{Number(caseItem.sort_order || index + 1)} · {money(caseItem.price)} ⭐ · {caseItem.is_active === false ? 'hidden' : 'active'}
                    </p>
                  </div>

                  <div className="case-order-actions">
                    <button type="button" onClick={() => togglePinCase(caseItem)}>
                      {caseItem.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => moveCase(caseItem.id, 'up')}>↑</button>
                    <button type="button" disabled={index === cases.length - 1} onClick={() => moveCase(caseItem.id, 'down')}>↓</button>
                    <button type="button" onClick={() => updateCase(caseItem.id, { is_active: caseItem.is_active === false })}>
                      {caseItem.is_active === false ? 'Show' : 'Hide'}
                    </button>
                    <button type="button" className="admin-danger-light" onClick={() => deleteCase(caseItem.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'features' ? (
          <section className="feature-admin-layout">
            <form className="browser-admin-form" onSubmit={updateFeatureAnimation}>
              <div className="admin-form-heading">
                <span>Home animations</span>
                <h2>PVP / Rocket animatsiyasi</h2>
                <p>Eski WEBP o‘rniga Telegram NFT link kiriting. Animatsiya avtomatik olinadi va Home kartasiga qo‘yiladi.</p>
              </div>
              <label><span>Bo‘lim</span><select value={featureForm.slot} onChange={(event) => setFeatureForm({ ...featureForm, slot: event.target.value })}><option value="rocket">Rocket</option><option value="pvp">PVP</option></select></label>
              <label><span>Telegram NFT link</span><input type="url" value={featureForm.gift_url} onChange={(event) => setFeatureForm({ ...featureForm, gift_url: event.target.value })} placeholder="https://t.me/nft/InputKey-45302" required /></label>
              <button type="submit" disabled={busy || !featureForm.gift_url}>{busy ? 'Yuklanmoqda...' : 'Animatsiyani qo‘yish'}</button>
            </form>
            <div className="feature-admin-previews">
              {['rocket', 'pvp'].map((slot) => <FeaturePreviewCard key={slot} slot={slot} setting={featureSettings[`feature_${slot}`] || {}} onLayoutChange={changeFeatureLayout} onSave={saveFeatureLayout} busy={busy} />)}
            </div>
          </section>
        ) : null}

        {tab === 'rocket' ? (
          <section className="rocket-admin-console">
            <div className="rocket-admin-hero">
              <div>
                <span>LIVE OPERATOR CONSOLE</span>
                <h2>Rocket boshqaruvi</h2>
                <p>
                  Aktiv va keyingi koeffitsiyent admin uchun oldindan
                  ko‘rinadi. O‘yinchilar natijani faqat portlagandan keyin
                  ko‘radi.
                </p>
              </div>
              <span
                className={`rocket-admin-live ${
                  rocketConnection === 'live' ? 'is-live' : ''
                }`}
              >
                <i />
                {rocketConnection === 'live'
                  ? 'REAL-TIME'
                  : 'SYNCING'}
              </span>
            </div>

            {currentRocketRound ? (
              <>
                <div className="rocket-admin-stats">
                  <article className="rocket-admin-stat rocket-admin-stat-primary">
                    <span>HOZIRGI KOEFFITSIYENT</span>
                    <strong>
                      {rocketMultiplier(
                        currentRocketRound.currentMultiplier
                      )}
                    </strong>
                    <small>
                      Round #{currentRocketRound.number || '—'}
                    </small>
                  </article>

                  <article className="rocket-admin-stat rocket-admin-stat-secret">
                    <span>PORTLASH NUQTASI</span>
                    <strong>
                      {rocketMultiplier(
                        currentRocketRound.crashMultiplier
                      )}
                    </strong>
                    <small>
                      {rocketSourceLabel(
                        currentRocketRound.outcomeSource
                      )}
                    </small>
                  </article>

                  <article className="rocket-admin-stat">
                    <span>ANIQ QATNASHCHILAR</span>
                    <strong>
                      {money(rocketControl.participantCount)}
                    </strong>
                    <small>Database exact count</small>
                  </article>

                  <article className="rocket-admin-stat">
                    <span>JAMI STAVKA</span>
                    <strong>{money(rocketControl.totalBet)} ⭐</strong>
                    <small>
                      {money(rocketControl.activeBetCount)} aktiv ·{' '}
                      {money(rocketControl.cashedOutCount)} cash
                    </small>
                  </article>
                </div>

                <div className="rocket-admin-grid">
                  <section className="rocket-admin-panel">
                    <div className="rocket-admin-panel-head">
                      <div>
                        <span>ACTIVE ROUND</span>
                        <h3>Jonli raund</h3>
                      </div>
                      <span
                        className={`rocket-admin-status is-${
                          currentRocketRound.status || 'syncing'
                        }`}
                      >
                        {rocketStatusLabel(
                          currentRocketRound.status
                        )}
                      </span>
                    </div>

                    <div className="rocket-admin-round-line">
                      <span>
                        Natija
                        <b>
                          {rocketMultiplier(
                            currentRocketRound.crashMultiplier
                          )}
                        </b>
                      </span>
                      <span>
                        Rejim
                        <b>{currentRocketRound.biasMode || 'standard'}</b>
                      </span>
                      <span>
                        Manba
                        <b>
                          {rocketSourceLabel(
                            currentRocketRound.outcomeSource
                          )}
                        </b>
                      </span>
                    </div>

                    <div className="rocket-admin-actions">
                      <button
                        type="button"
                        className="rocket-admin-launch"
                        onClick={launchRocketNow}
                        disabled={
                          currentRocketRound.status !== 'betting' ||
                          Boolean(rocketActionBusy)
                        }
                      >
                        {rocketActionBusy === 'rocket_launch_now'
                          ? 'Uchirilmoqda...'
                          : 'Hozir uchirish'}
                      </button>
                      <button
                        type="button"
                        className="rocket-admin-crash"
                        onClick={forceRocketCrash}
                        disabled={
                          currentRocketRound.status !== 'flying' ||
                          Boolean(rocketActionBusy)
                        }
                      >
                        {rocketActionBusy === 'rocket_force_crash'
                          ? 'Portlatilmoqda...'
                          : 'Hozir portlatish'}
                      </button>
                    </div>
                  </section>

                  <form
                    className="rocket-admin-panel"
                    onSubmit={saveNextRocketMultiplier}
                  >
                    <div className="rocket-admin-panel-head">
                      <div>
                        <span>NEXT ROUND</span>
                        <h3>Keyingi koeffitsiyent</h3>
                      </div>
                      <span className="rocket-admin-next-value">
                        {rocketMultiplier(
                          nextRocketRound?.crashMultiplier
                        )}
                      </span>
                    </div>

                    <label className="rocket-admin-input">
                      <span>1.00x–1000.00x</span>
                      <div>
                        <input
                          id="rocket-next-multiplier"
                          type="number"
                          min="1"
                          max="1000"
                          step="0.01"
                          inputMode="decimal"
                          value={rocketNextMultiplier}
                          onChange={(event) =>
                            setRocketNextMultiplier(event.target.value)
                          }
                          required
                        />
                        <b>x</b>
                      </div>
                    </label>

                    <p className="rocket-admin-plan-note">
                      Hozirgi reja:{' '}
                      <strong>
                        {rocketSourceLabel(
                          nextRocketRound?.outcomeSource
                        )}
                      </strong>{' '}
                      · {nextRocketRound?.biasMode || rocketBiasMode}
                    </p>

                    <div className="rocket-admin-actions">
                      <button
                        type="submit"
                        disabled={Boolean(rocketActionBusy)}
                      >
                        {rocketActionBusy === 'rocket_set_next'
                          ? 'Saqlanmoqda...'
                          : 'Keyingi natijani saqlash'}
                      </button>
                      <button
                        type="button"
                        className="rocket-admin-secondary"
                        onClick={resetNextRocketMultiplier}
                        disabled={Boolean(rocketActionBusy)}
                      >
                        Avtomatik qilish
                      </button>
                    </div>
                  </form>
                </div>

                <section className="rocket-admin-panel rocket-admin-bias">
                  <div className="rocket-admin-panel-head">
                    <div>
                      <span>AUTOMATIC DISTRIBUTION</span>
                      <h3>Koeffitsiyentlar yo‘nalishi</h3>
                    </div>
                    <span className="rocket-admin-next-value">
                      {rocketBiasMode.toUpperCase()}
                    </span>
                  </div>

                  <div className="rocket-admin-bias-options">
                    {[
                      [
                        'low',
                        'Pastroq',
                        'Past koeffitsiyentlar ko‘proq chiqadi.',
                      ],
                      [
                        'standard',
                        'Standart',
                        '2% edge bilan tabiiy inverse taqsimot.',
                      ],
                      [
                        'high',
                        'Yuqoriroq',
                        'Yuqori koeffitsiyentlar ko‘proq chiqadi.',
                      ],
                    ].map(([id, title, description]) => (
                      <button
                        type="button"
                        key={id}
                        className={
                          rocketBiasMode === id ? 'is-active' : ''
                        }
                        onClick={() => setRocketBias(id)}
                        disabled={Boolean(rocketActionBusy)}
                      >
                        <i />
                        <strong>{title}</strong>
                        <span>{description}</span>
                      </button>
                    ))}
                  </div>

                  <p className="rocket-admin-warning">
                    Rejim o‘zgarsa, faqat avtomatik keyingi reja qayta
                    hisoblanadi. Qo‘lda belgilangan keyingi koeffitsiyent
                    o‘zgarmaydi.
                  </p>
                </section>
              </>
            ) : (
              <div className="rocket-admin-loading">
                <i />
                <strong>Rocket server holati olinmoqda</strong>
                <span>Jonli raund va keyingi reja sinxronlanmoqda.</span>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'dice' ? (
          <section className="dice-admin-console">
            <div className="dice-admin-hero">
              <div>
                <span>DICE RISK CONTROL</span>
                <h2>Dice boshqaruvi</h2>
                <p>
                  Yashil zona limiti, stavka oralig‘i, platforma edge’i va
                  natija animatsiyasini bir joydan boshqaring. Barcha limitlar
                  serverda majburiy tekshiriladi.
                </p>
              </div>
              <label className="dice-admin-master-toggle">
                <span><i />{diceSettings.enabled ? 'GAME LIVE' : 'GAME OFF'}</span>
                <input
                  type="checkbox"
                  checked={Boolean(diceSettings.enabled)}
                  onChange={(event) => setDiceSettings({ ...diceSettings, enabled: event.target.checked })}
                />
                <b />
              </label>
            </div>

            <div className="dice-admin-stats">
              <article><span>MAX YASHIL ZONA</span><strong>{Number(diceSettings.maxWinChance)}%</strong><small>Kamida {100 - Number(diceSettings.maxWinChance)}% xavf zonasi qoladi</small></article>
              <article><span>HOUSE EDGE</span><strong>{Number(diceSettings.houseEdgePercent).toFixed(1)}%</strong><small>Multiplier hisobiga qo‘llanadi</small></article>
              <article><span>STAVKA ORALIG‘I</span><strong>{money(diceSettings.minBet)}–{money(diceSettings.maxBet)}</strong><small>Telegram Stars</small></article>
              <article><span>TO‘XTASH VAQTI</span><strong>{Number(diceSettings.rollDurationMs) / 1000}s</strong><small>Sekinlashib natijada to‘xtaydi</small></article>
            </div>

            <div className="dice-admin-grid">
              <div className="dice-admin-preview">
                <div className="dice-admin-preview-head">
                  <div><span>LIVE LIMIT PREVIEW</span><h3>Yashil zona himoyasi</h3></div>
                  <b>MAX {Number(diceSettings.maxWinChance)}%</b>
                </div>
                <div className="dice-admin-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
                <div className="dice-admin-track" style={{ '--safe-zone': `${Number(diceSettings.maxWinChance)}%` }}>
                  <span className="dice-admin-track-green" />
                  <span className="dice-admin-track-red" />
                  <i style={{ left: `${Number(diceSettings.maxWinChance)}%` }} />
                </div>
                <div className="dice-admin-zone-labels">
                  <span>ENG KATTA YUTISH ZONASI</span>
                  <span>DOIM QOLADIGAN XAVF</span>
                </div>
                <p>
                  Admin limiti 90% dan yuqoriga chiqmaydi. Foydalanuvchi
                  requestni qo‘lda o‘zgartirsa ham server yuqori chance’ni rad etadi.
                </p>
              </div>

              <form className="browser-admin-form dice-admin-settings" onSubmit={saveDiceSettings}>
                <div className="admin-form-heading">
                  <span>SERVER SETTINGS</span>
                  <h2>Risk va o‘yin sozlamalari</h2>
                  <p>Saqlangandan keyin yangi Dice raundlariga darhol qo‘llanadi.</p>
                </div>

                <div className="browser-admin-two">
                  <label><span>Minimal stavka</span><input type="number" min="1" max="100000" value={diceSettings.minBet} onChange={(event) => setDiceSettings({ ...diceSettings, minBet: event.target.value })} /></label>
                  <label><span>Maksimal stavka</span><input type="number" min="1" max="1000000" value={diceSettings.maxBet} onChange={(event) => setDiceSettings({ ...diceSettings, maxBet: event.target.value })} /></label>
                </div>

                <div className="browser-admin-two">
                  <label><span>Minimal yutish ehtimoli %</span><input type="number" min="2" max="30" value={diceSettings.minWinChance} onChange={(event) => setDiceSettings({ ...diceSettings, minWinChance: event.target.value })} /></label>
                  <label><span>Maksimal yashil zona %</span><input type="number" min="50" max="90" value={diceSettings.maxWinChance} onChange={(event) => setDiceSettings({ ...diceSettings, maxWinChance: event.target.value })} /><small className="manual-field-note">90% — qattiq maksimal limit.</small></label>
                </div>

                <label className="dice-admin-range">
                  <span>House edge <output>{Number(diceSettings.houseEdgePercent).toFixed(1)}%</output></span>
                  <input type="range" min="0.5" max="10" step="0.1" value={diceSettings.houseEdgePercent} onChange={(event) => setDiceSettings({ ...diceSettings, houseEdgePercent: event.target.value })} />
                </label>

                <label className="dice-admin-range">
                  <span>Sekinlashish davomiyligi <output>{Number(diceSettings.rollDurationMs)} ms</output></span>
                  <input type="range" min="800" max="2400" step="100" value={diceSettings.rollDurationMs} onChange={(event) => setDiceSettings({ ...diceSettings, rollDurationMs: event.target.value })} />
                </label>

                <button type="submit" disabled={busy}>{busy ? 'Saqlanmoqda...' : 'Dice sozlamalarini saqlash'}</button>
              </form>
            </div>
          </section>
        ) : null}

        {tab === 'bonuses' ? (
          <section className="bonus-admin-console">
            <div className="bonus-admin-hero">
              <div>
                <span>BONUS MISSION CONTROL</span>
                <h2>Task va mukofotlar</h2>
                <p>
                  Telegram kanal, bot, tashqi havola yoki Mini App tasklarini
                  yarating. Kanal taski botning getChatMember tekshiruvidan
                  o‘tadi, barcha tasklarda kutish vaqti serverda hisoblanadi.
                </p>
              </div>
              <div className="bonus-admin-security">
                <i /> SERVER VERIFIED
              </div>
            </div>

            <div className="bonus-admin-stats">
              <article><span>JAMI TASK</span><strong>{money(bonusStats.totalTasks)}</strong><small>{money(bonusStats.activeTasks)} tasi aktiv</small></article>
              <article><span>BOSHLANGAN</span><strong>{money(bonusStats.started)}</strong><small>Foydalanuvchi progressi</small></article>
              <article><span>YAKUNLANGAN</span><strong>{money(bonusStats.completed)}</strong><small>Bir martalik claim</small></article>
              <article><span>BERILGAN BONUS</span><strong>{money(bonusStats.paid)} ⭐</strong><small>Jami Stars</small></article>
            </div>

            <div className="bonus-admin-grid">
              <form className="browser-admin-form bonus-admin-form" onSubmit={saveBonusTask}>
                <div className="admin-form-heading">
                  <span>{bonusTaskForm.id ? 'EDIT MISSION' : 'NEW MISSION'}</span>
                  <h2>{bonusTaskForm.id ? 'Taskni tahrirlash' : 'Yangi task qo‘shish'}</h2>
                  <p>30 daqiqa standart. Istasangiz har bir task uchun alohida vaqt belgilang.</p>
                </div>

                <label><span>Task nomi</span><input value={bonusTaskForm.title} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, title: event.target.value })} placeholder="Masalan: Gift Myst News" required /></label>
                <label><span>Qisqa izoh</span><input value={bonusTaskForm.subtitle} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, subtitle: event.target.value })} placeholder="Kanalga qo‘shiling va bonus oling" /></label>

                <div className="browser-admin-two">
                  <label>
                    <span>Task turi</span>
                    <select value={bonusTaskForm.type} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, type: event.target.value })}>
                      <option value="telegram_channel">Telegram kanal — bot tekshiradi</option>
                      <option value="external_link">Tashqi havola — timer</option>
                      <option value="telegram_bot">Telegram bot — timer</option>
                      <option value="mini_app">Mini App — timer</option>
                    </select>
                  </label>
                  <label><span>Mukofot, Stars</span><input type="number" min="1" max="100000" value={bonusTaskForm.reward} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, reward: event.target.value })} required /></label>
                </div>

                <label><span>Ochilganda o‘tiladigan havola</span><input type="url" value={bonusTaskForm.url} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, url: event.target.value })} placeholder="https://t.me/giftmyst" required /></label>

                {bonusTaskForm.type === 'telegram_channel' ? (
                  <label>
                    <span>Kanal username yoki chat ID</span>
                    <input value={bonusTaskForm.chatId} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, chatId: event.target.value })} placeholder="@giftmyst yoki -1001234567890" required />
                    <small className="manual-field-note">Muhim: Gift Myst botini shu kanalga admin qiling. Aks holda a’zolikni tekshirib bo‘lmaydi.</small>
                  </label>
                ) : null}

                <div className="browser-admin-two">
                  <label><span>Kutish, daqiqa</span><input type="number" min="0" max="10080" value={bonusTaskForm.waitMinutes} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, waitMinutes: event.target.value })} required /></label>
                  <label><span>Tartib raqami</span><input type="number" min="0" max="100000" value={bonusTaskForm.sortOrder} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, sortOrder: event.target.value })} /></label>
                </div>

                <div className="browser-admin-two">
                  <label><span>Rang</span><select value={bonusTaskForm.accent} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, accent: event.target.value })}><option value="purple">Purple</option><option value="blue">Blue</option><option value="green">Green</option><option value="gold">Gold</option><option value="rose">Rose</option></select></label>
                  <label className="manual-check"><input type="checkbox" checked={Boolean(bonusTaskForm.isActive)} onChange={(event) => setBonusTaskForm({ ...bonusTaskForm, isActive: event.target.checked })} /><span>Darhol aktiv qilish</span></label>
                </div>

                <div className="bonus-admin-form-actions">
                  <button type="submit" disabled={busy}>{busy ? 'Saqlanmoqda...' : bonusTaskForm.id ? 'O‘zgarishlarni saqlash' : 'Taskni yaratish'}</button>
                  {bonusTaskForm.id ? <button type="button" className="admin-secondary-button" onClick={() => setBonusTaskForm(emptyBonusTaskForm)}>Bekor qilish</button> : null}
                </div>
              </form>

              <div className="browser-admin-list bonus-admin-list">
                <div className="bonus-admin-list-head"><div><span>LIVE MISSIONS</span><h2>Tasklar</h2></div><b>{bonusTasks.length}</b></div>
                {bonusTasks.length ? bonusTasks.map((task) => (
                  <article className={`bonus-admin-task is-${task.accent} ${task.isActive === false ? 'is-disabled' : ''}`} key={task.id}>
                    <span className="bonus-admin-task-icon">{task.type === 'telegram_channel' ? '✈' : task.type === 'telegram_bot' ? '🤖' : task.type === 'mini_app' ? '◆' : '↗'}</span>
                    <div className="bonus-admin-task-copy">
                      <span>{bonusTypeLabel(task.type)} · {task.waitMinutes} daqiqa</span>
                      <strong>{task.title}</strong>
                      <small>{task.subtitle || task.url}</small>
                    </div>
                    <b className="bonus-admin-reward">+{money(task.reward)} ⭐</b>
                    <div className="bonus-admin-task-actions">
                      <button type="button" onClick={() => editBonusTask(task)}>Edit</button>
                      <button type="button" onClick={() => toggleBonusTask(task)}>{task.isActive === false ? 'Enable' : 'Disable'}</button>
                      <button type="button" className="admin-danger-light" onClick={() => deleteBonusTask(task)}>Delete</button>
                    </div>
                  </article>
                )) : <div className="bonus-admin-empty"><strong>Task hali yo‘q</strong><span>Chapdagi forma orqali birinchi bonus taskni yarating.</span></div>}
              </div>
            </div>
          </section>
        ) : null}

        {tab === 'library' ? (
          <section className="browser-admin-grid manual-library-layout">
            <form className="browser-admin-form manual-upload-form" onSubmit={createLibraryGift}>
              <div className="admin-form-heading">
                <span>Telegram NFT importer</span>
                <h2>Gift linkdan qo‘shish</h2>
                <p>Telegram NFT havolasini kiriting. Nomi, raqami, model, symbol, fon va animatsiya avtomatik olinadi.</p>
              </div>

              <label>
                <span>Telegram gift havolasi</span>
                <input type="url" value={libraryForm.gift_url} onChange={(event) => setLibraryForm({ ...libraryForm, gift_url: event.target.value })} placeholder="https://t.me/nft/ViceCream-134506" required />
                <small className="manual-field-note">Faqat t.me/nft/GiftName-123 formatidagi link.</small>
              </label>

              <label>
                <span>Buy price / Sotish narxi</span>
                <input type="number" value={libraryForm.price} onChange={(event) => setLibraryForm({ ...libraryForm, price: event.target.value })} placeholder="0" required />
              </label>

              <button type="submit" disabled={busy || !libraryForm.gift_url}>{busy ? 'Telegramdan olinmoqda...' : 'Linkdan giftni olish'}</button>
            </form>

            <div className="manual-library-grid">
              {giftLibrary.length ? giftLibrary.map((gift) => (
                <div className="manual-library-card image-only-library-card" key={gift.id} style={{ '--manual-card-bg': gift.background_value || 'linear-gradient(135deg,#7c3aed,#111827)' }}>
                  <div className="manual-library-media">
                    <GiftImage gift={gift} />
                  </div>
                  <div>
                    <strong>{gift.title}</strong>
                    <p>{money(gift.price)} ⭐ · {gift.slug || 'Telegram NFT'} · {gift.is_active === false ? 'hidden' : 'active'}</p>
                    <small>{gift.model_name || 'Animated model'} · {gift.symbol_name || 'symbol'} · #{gift.gift_number || '?'}</small>
                  </div>
                  <div className="manual-card-actions">
                    <button type="button" onClick={() => updateLibraryGift(gift.id, { is_active: gift.is_active === false })}>
                      {gift.is_active === false ? 'Show' : 'Hide'}
                    </button>
                    <button type="button" className="admin-danger-light" onClick={() => deleteLibraryGift(gift.id)}>Delete</button>
                  </div>
                </div>
              )) : (
                <div className="telegram-import-empty manual-empty">
                  <span>🎁</span>
                  <h3>Gift baza bo‘sh</h3>
                  <p>Telegram NFT linkini kiriting. Gift animatsiyasi va metadata avtomatik olinadi.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {tab === 'gifts' ? (
          <section className="browser-admin-grid catalog-gift-layout">
            <form className="browser-admin-form catalog-gift-form" onSubmit={createGiftFromLibrary}>
              <div className="admin-form-heading">
                <span>Case gift</span>
                <h2>Casega gift qo‘shish</h2>
                <p>Bazadan gift tanlang. Narx va fon avtomatik olinadi, ko‘rinadigan chance, haqiqiy chance va stock sozlanadi.</p>
              </div>

              <label>
                <span>Case</span>
                <select value={giftForm.case_id} onChange={(event) => setGiftForm({ ...giftForm, case_id: event.target.value })} required>
                  <option value="">Case tanlang</option>
                  {cases.map((caseItem) => (
                    <option key={caseItem.id} value={caseItem.id}>{caseItem.title}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Gift baza</span>
                <select value={giftForm.library_gift_id} onChange={(event) => applyLibraryGift(event.target.value)} required>
                  <option value="">Gift tanlang</option>
                  {giftLibrary.filter((gift) => gift.is_active !== false).map((gift) => (
                    <option key={gift.id} value={gift.id}>{gift.title} · {money(gift.price)} ⭐</option>
                  ))}
                </select>
              </label>

                            {selectedLibraryGift ? (
                <div className="selected-catalog-preview manual-selected-preview" style={{ '--telegram-gift-bg': selectedLibraryGift.background_value || 'linear-gradient(135deg,#7c3aed,#111827)' }}>
                  <GiftImage gift={selectedLibraryGift} />
                  <div>
                    <strong>{giftForm.title || selectedLibraryGift.title}</strong>
                    <p>Sotish narxi: {money(giftForm.price || selectedLibraryGift.price)} ⭐ · fon bazadan olinadi.</p>
                  </div>
                </div>
              ) : (
                <div className="selected-catalog-empty">
                  Avval Gift baza bo‘limida gift nomi, narxi, fon va PNG/SVG rasm yuklang.
                </div>
              )}

              <label>
                <span>Nomi</span>
                <input value={giftForm.title} onChange={(event) => setGiftForm({ ...giftForm, title: event.target.value })} required />
              </label>

              <label>
                <span>Sotish narxi</span>
                <input type="number" value={giftForm.price} onChange={(event) => setGiftForm({ ...giftForm, price: event.target.value })} />
              </label>

              <div className="browser-admin-two">
                <label>
                  <span>Stock</span>
                  <input type="number" value={giftForm.stock} onChange={(event) => setGiftForm({ ...giftForm, stock: event.target.value })} />
                </label>
                <label>
                  <span>Ko‘rinadigan chance %</span>
                  <input type="number" value={giftForm.chance} onChange={(event) => setGiftForm({ ...giftForm, chance: event.target.value })} />
                </label>
              </div>

              <label>
                <span>Haqiqiy tushish chance %</span>
                <input type="number" value={giftForm.real_chance} onChange={(event) => setGiftForm({ ...giftForm, real_chance: event.target.value })} />
                <small className="manual-field-note">0 bo‘lsa gift case ichida ko‘rinadi, lekin umuman tushmaydi.</small>
              </label>

              <label>
                <span>Rarity</span>
                <select value={giftForm.rarity} onChange={(event) => setGiftForm({ ...giftForm, rarity: event.target.value })}>
                  <option value="common">common</option>
                  <option value="rare">rare</option>
                  <option value="epic">epic</option>
                  <option value="legendary">legendary</option>
                  <option value="mythic">mythic</option>
                </select>
              </label>

              <button type="submit" disabled={busy || !giftForm.library_gift_id}>
                {busy ? 'Yuklanmoqda...' : 'Yuklash'}
              </button>
            </form>

            <div className="browser-admin-list">
              <h2>Case giftlari</h2>
              {gifts.map((gift) => (
                <div className="browser-admin-item" key={gift.id}>
                  <GiftImage gift={gift} />
                  <div>
                    <strong>{gift.title}</strong>
                    <p>{money(gift.floor_price || gift.value)} ⭐ · visible {gift.chance}% · real {gift.real_chance ?? gift.chance}% · stock {gift.stock}</p>
                  </div>
                  <button type="button" onClick={() => updateGift(gift.id, { is_active: gift.is_active === false })}>
                    {gift.is_active === false ? 'Show' : 'Hide'}
                  </button>
                  <button type="button" className="admin-danger-light" onClick={() => deleteGift(gift.id)}>Delete</button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'deposits' ? (
          <section className="deposit-admin-console">
            <div className="deposit-admin-hero">
              <div>
                <span>PAYMENT CONTROL CENTER</span>
                <h2>Deposit boshqaruvi</h2>
                <p>
                  Telegram Stars avtomatik tushadi, TON / GRAM TON Connect
                  va noyob memo orqali tekshiriladi, Gift esa qiymati
                  tasdiqlangandan keyin balansga qo‘shiladi.
                </p>
              </div>

              <div className="deposit-admin-hero-status">
                <i />
                LIVE LEDGER
              </div>
            </div>

            <div className="deposit-admin-stats">
              <article>
                <span>KUTILAYOTGAN</span>
                <strong>{money(pendingDepositCount)}</strong>
                <small>Admin e’tibori kerak bo‘lishi mumkin</small>
              </article>
              <article>
                <span>TUSHGAN BALANS</span>
                <strong>{money(completedDepositTotal)} ⭐</strong>
                <small>Oxirgi {deposits.length} tranzaksiya bo‘yicha</small>
              </article>
              <article>
                <span>STARS AUTO</span>
                <strong>{depositSettings.starsEnabled ? 'ON' : 'OFF'}</strong>
                <small>
                  {money(depositSettings.starsMin)}–
                  {money(depositSettings.starsMax)} Stars
                </small>
              </article>
              <article>
                <span>TON / GRAM AUTO</span>
                <strong>
                  {depositSettings.tonEnabled &&
                  depositSettings.tonWallet &&
                  Number(depositSettings.tonStarsRate) > 0
                    ? 'READY'
                    : 'SETUP'}
                </strong>
                <small>
                  1 TON / GRAM = {money(depositSettings.tonStarsRate)} Stars
                </small>
              </article>
            </div>

            <div className="deposit-admin-grid">
              <form
                className="browser-admin-form deposit-admin-settings"
                onSubmit={saveDepositSettings}
              >
                <div className="admin-form-heading">
                  <span>METHOD SETTINGS</span>
                  <h2>To‘ldirish usullari</h2>
                  <p>
                    O‘zgartirishlar yangi depositlarga darhol qo‘llanadi.
                    Aktiv invoice’lar o‘z eski summa va kursida tugaydi.
                  </p>
                </div>

                <section className="deposit-setting-card is-stars">
                  <label className="deposit-admin-toggle">
                    <span>
                      <b>Telegram Stars</b>
                      <small>Invoice to‘langanda avtomatik balans</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(depositSettings.starsEnabled)}
                      onChange={(event) =>
                        setDepositSettings({
                          ...depositSettings,
                          starsEnabled: event.target.checked,
                        })
                      }
                    />
                    <i />
                  </label>

                  <div className="browser-admin-two">
                    <label>
                      <span>Minimum Stars</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={depositSettings.starsMin}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            starsMin: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Maksimum Stars</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={depositSettings.starsMax}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            starsMax: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                </section>

                <section className="deposit-setting-card is-ton">
                  <label className="deposit-admin-toggle">
                    <span>
                      <b>TON / GRAM Auto</b>
                      <small>TON Connect, tranzaksiya va memo bo‘yicha</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(depositSettings.tonEnabled)}
                      onChange={(event) =>
                        setDepositSettings({
                          ...depositSettings,
                          tonEnabled: event.target.checked,
                        })
                      }
                    />
                    <i />
                  </label>

                  <label>
                    <span>Qabul qiluvchi TON / GRAM wallet</span>
                    <input
                      value={depositSettings.tonWallet}
                      onChange={(event) =>
                        setDepositSettings({
                          ...depositSettings,
                          tonWallet: event.target.value.trim(),
                        })
                      }
                      placeholder="UQ... yoki EQ..."
                    />
                  </label>

                  <div className="browser-admin-two">
                    <label>
                      <span>1 TON / GRAM uchun Stars</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={depositSettings.tonStarsRate}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            tonStarsRate: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Invoice vaqti, daqiqa</span>
                      <input
                        type="number"
                        min="5"
                        max="240"
                        step="1"
                        value={depositSettings.tonExpiryMinutes}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            tonExpiryMinutes: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>

                  <div className="browser-admin-two">
                    <label>
                      <span>Minimum TON / GRAM</span>
                      <input
                        type="number"
                        min="0.000000001"
                        step="0.000000001"
                        value={depositSettings.tonMin}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            tonMin: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      <span>Maksimum TON / GRAM</span>
                      <input
                        type="number"
                        min="0.000000001"
                        step="0.000000001"
                        value={depositSettings.tonMax}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            tonMax: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                </section>

                <section className="deposit-setting-card is-gift">
                  <label className="deposit-admin-toggle">
                    <span>
                      <b>Telegram Gift</b>
                      <small>Kelgan giftni tekshirib balansga o‘tkazish</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(depositSettings.giftEnabled)}
                      onChange={(event) =>
                        setDepositSettings({
                          ...depositSettings,
                          giftEnabled: event.target.checked,
                        })
                      }
                    />
                    <i />
                  </label>

                  <div className="browser-admin-two">
                    <label>
                      <span>Qabul qiluvchi username</span>
                      <input
                        value={depositSettings.giftRecipient}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            giftRecipient: event.target.value,
                          })
                        }
                        placeholder="@GiftMystBot"
                      />
                    </label>
                    <label>
                      <span>Taklif qiymati, %</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={depositSettings.giftCreditPercent}
                        onChange={(event) =>
                          setDepositSettings({
                            ...depositSettings,
                            giftCreditPercent: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                </section>

                <button type="submit" disabled={busy}>
                  {busy ? 'Saqlanmoqda...' : 'Deposit sozlamalarini saqlash'}
                </button>
              </form>

              <section className="deposit-admin-ledger">
                <div className="deposit-admin-ledger-head">
                  <div>
                    <span>TRANSACTION LEDGER</span>
                    <h2>Depositlar</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => bootstrap()}
                    disabled={busy}
                  >
                    Yangilash
                  </button>
                </div>

                <p className="deposit-admin-ledger-note">
                  TON / GRAM’ni qo‘lda tasdiqlashdan oldin walletda aynan
                  summa va memo kelganini tekshiring. Stars faqat Telegram
                  webhook orqali avtomatik tasdiqlanadi.
                </p>

                <div className="deposit-admin-list">
                  {deposits.length ? (
                    deposits.map((deposit) => {
                      const user = users.find(
                        (item) => Number(item.id) === Number(deposit.user_id)
                      );
                      const draft = depositDrafts[deposit.id] || {};
                      const isPending = ['pending', 'confirming'].includes(
                        deposit.status
                      );
                      const canApprove =
                        isPending && deposit.method !== 'stars';

                      return (
                        <article
                          className={`deposit-admin-item is-${deposit.method}`}
                          key={deposit.id}
                        >
                          <div className="deposit-admin-item-top">
                            <div className="deposit-admin-method">
                              <i>{deposit.method === 'ton' ? 'T' : deposit.method === 'gift' ? 'G' : '★'}</i>
                              <div>
                                <strong>
                                  {depositMethodLabel(deposit.method)}
                                </strong>
                                <span>
                                  {user?.first_name ||
                                    user?.username ||
                                    `User ${deposit.user_id}`}
                                  {' · '}
                                  {smallId(deposit.id)}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`deposit-admin-state is-${deposit.status}`}
                            >
                              {depositStatusLabel(deposit.status)}
                            </span>
                          </div>

                          <div className="deposit-admin-item-values">
                            <span>
                              To‘lov
                              <b>
                                {deposit.method === 'ton'
                                  ? Number(deposit.pay_amount || 0).toLocaleString(
                                      'en-US',
                                      { maximumFractionDigits: 9 }
                                    )
                                  : money(deposit.pay_amount)}
                                {' '}
                                {deposit.pay_currency}
                              </b>
                            </span>
                            <span>
                              Balans
                              <b>{money(deposit.credit_amount)} ⭐</b>
                            </span>
                            <span>
                              Sana
                              <b>{adminDate(deposit.created_at)}</b>
                            </span>
                          </div>

                          {deposit.method === 'ton' ? (
                            <div className="deposit-admin-details">
                              <span>
                                Wallet
                                <b title={deposit.ton_wallet}>
                                  {smallId(deposit.ton_wallet)}
                                </b>
                              </span>
                              <span>
                                Memo
                                <b>{deposit.ton_memo || '—'}</b>
                              </span>
                            </div>
                          ) : null}

                          {deposit.method === 'gift' ? (
                            <div className="deposit-admin-details">
                              <span>
                                Gift
                                {deposit.gift_url ? (
                                  <a
                                    href={deposit.gift_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Telegramda ochish ↗
                                  </a>
                                ) : (
                                  <b>Webhookdan kelgan gift</b>
                                )}
                              </span>
                              <span>
                                Tavsiya
                                <b>
                                  {money(
                                    deposit.metadata?.suggestedCredit ||
                                      deposit.credit_amount
                                  )}{' '}
                                  ⭐
                                </b>
                              </span>
                            </div>
                          ) : null}

                          {deposit.admin_note ? (
                            <p className="deposit-admin-note">
                              {deposit.admin_note}
                            </p>
                          ) : null}

                          {isPending ? (
                            <div className="deposit-admin-resolve">
                              {canApprove ? (
                                <label>
                                  <span>Tushadigan Stars</span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={draft.credit || ''}
                                    onChange={(event) =>
                                      changeDepositDraft(
                                        deposit.id,
                                        'credit',
                                        event.target.value
                                      )
                                    }
                                    placeholder="Masalan: 500"
                                  />
                                </label>
                              ) : (
                                <div className="deposit-admin-auto-wait">
                                  Telegram to‘lov tasdig‘i kutilmoqda
                                </div>
                              )}

                              {deposit.method !== 'stars' ? (
                                <>
                                  <label className="deposit-admin-note-input">
                                    <span>Izoh — userga ko‘rinadi</span>
                                    <input
                                      value={draft.note || ''}
                                      onChange={(event) =>
                                        changeDepositDraft(
                                          deposit.id,
                                          'note',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Ixtiyoriy izoh"
                                    />
                                  </label>

                                  <div className="deposit-admin-resolve-actions">
                                    {canApprove ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          resolveDeposit(deposit, 'approved')
                                        }
                                        disabled={busy}
                                      >
                                        Balansga tushirish
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="admin-danger-light"
                                      onClick={() =>
                                        resolveDeposit(deposit, 'rejected')
                                      }
                                      disabled={busy}
                                    >
                                      Rad etish
                                    </button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <div className="deposit-admin-empty">
                      <span>◌</span>
                      <strong>Hali deposit yo‘q</strong>
                      <p>Birinchi tranzaksiya shu yerda ko‘rinadi.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {tab === 'users' ? (
          <section className="browser-admin-grid">
            <form className="browser-admin-form" onSubmit={addBalance}>
              <h2>Balance qo‘shish</h2>
              <input placeholder="Telegram user ID" value={balanceUserId} onChange={(event) => setBalanceUserId(event.target.value)} required />
              <input type="number" placeholder="Amount" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} required />
              <button type="submit" disabled={busy}>Balance qo‘shish</button>
            </form>

            <div className="browser-admin-list">
              <h2>Users</h2>
              {users.map((user) => (
                <div className="browser-admin-item" key={user.id}>
                  <div>
                    <strong>{user.first_name || user.username || user.id}</strong>
                    <p>ID: {user.id} · Balance: {money(user.balance)} · {user.is_banned ? 'banned' : 'active'}</p>
                  </div>
                  <button type="button" onClick={() => toggleBan(user)}>{user.is_banned ? 'Unban' : 'Ban'}</button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'withdrawals' ? (
          <section className="browser-admin-list">
            <h2>Withdrawals</h2>
            {withdrawals.map((request) => (
              <div className="browser-admin-item" key={request.id}>
                <GiftImage gift={request.gifts || {}} />
                <div>
                  <strong>{request.gifts?.title || request.gift_title || 'Gift'}</strong>
                  <p>User: {request.user_id} · Status: {request.status} · ID: {smallId(request.id)}</p>
                </div>
                <button type="button" disabled={request.status !== 'pending'} onClick={() => updateWithdrawal(request.id, 'approved')}>Approve</button>
                <button type="button" disabled={request.status !== 'pending'} className="admin-danger-light" onClick={() => updateWithdrawal(request.id, 'rejected')}>Reject</button>
              </div>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
