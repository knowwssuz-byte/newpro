'use client';

import { useEffect, useMemo, useState } from 'react';

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

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

function smallId(value = '') {
  const text = String(value || '');
  if (text.length <= 14) return text;
  return `${text.slice(0, 7)}...${text.slice(-5)}`;
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

  if (!url) {
    return <span className="admin-mini-icon">🎁</span>;
  }

  return <img className={className} src={url} alt="" loading="lazy" draggable="false" />;
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
