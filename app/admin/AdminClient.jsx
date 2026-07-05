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
  title: '',
};

const emptyGiftForm = {
  case_id: '',
  library_gift_id: '',
  title: '',
  background_value: 'linear-gradient(135deg,#7c3aed 0%,#111827 100%)',
  chance: '10',
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

function GiftImage({ gift, className = 'admin-gift-media' }) {
  const url = gift?.png_url || gift?.image_url || gift?.webp_url || '';

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
  const [libraryForm, setLibraryForm] = useState(emptyLibraryForm);
  const [libraryFile, setLibraryFile] = useState(null);
  const [giftForm, setGiftForm] = useState(emptyGiftForm);

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
    setCases(data.cases || []);
    setGifts(data.gifts || []);
    setUsers(data.users || []);
    setWithdrawals(data.withdrawals || []);
    setGiftLibrary(data.giftLibrary || []);

    const firstCaseId = data.cases?.[0]?.id || '';
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

    await run(
      () =>
        callAdmin('case_create', {
          caseData: {
            ...caseForm,
            price: Number(caseForm.price || 0),
          },
        }),
      'Case qo‘shildi ✅'
    );

    setCaseForm(emptyCaseForm);
    await bootstrap();
  }

  async function updateCase(caseId, updates) {
    await run(() => callAdmin('case_update', { caseId, updates }), 'Case yangilandi ✅');
    await bootstrap();
  }

  async function deleteCase(caseId) {
    if (!window.confirm('Case o‘chirilsinmi?')) return;

    await run(() => callAdmin('case_delete', { caseId }), 'Case o‘chirildi');
    await bootstrap();
  }

  async function createLibraryGift(event) {
    event.preventDefault();

    if (!libraryFile) {
      setError('WEBP fayl tanlang.');
      return;
    }

    const formData = new FormData();
    formData.append('action', 'gift_library_create');
    formData.append('adminKey', adminKey);
    formData.append('title', libraryForm.title);
    formData.append('webp_file', libraryFile);

    const data = await run(() => callAdminForm(formData), 'Gift bazaga yuklandi ✅');

    if (!data) return;

    applyBootstrap(data);
    setLibraryForm(emptyLibraryForm);
    setLibraryFile(null);

    const input = document.getElementById('manual-webp-input');
    if (input) input.value = '';
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
      }));
      return;
    }

    setGiftForm((current) => ({
      ...current,
      library_gift_id: gift.id,
      title: gift.title || '',
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
            <form className="browser-admin-form" onSubmit={createCase}>
              <h2>Case qo‘shish</h2>
              <input placeholder="Title" value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} required />
              <input placeholder="Description" value={caseForm.description} onChange={(event) => setCaseForm({ ...caseForm, description: event.target.value })} />
              <input type="number" placeholder="Price" value={caseForm.price} onChange={(event) => setCaseForm({ ...caseForm, price: event.target.value })} />
              <input placeholder="Image URL" value={caseForm.image_url} onChange={(event) => setCaseForm({ ...caseForm, image_url: event.target.value })} />
              <button type="submit" disabled={busy}>Case qo‘shish</button>
            </form>

            <div className="browser-admin-list">
              <h2>Cases</h2>
              {cases.map((caseItem) => (
                <div className="browser-admin-item" key={caseItem.id}>
                  <div>
                    <strong>{caseItem.title}</strong>
                    <p>{money(caseItem.price)} ⭐ · {caseItem.is_active === false ? 'hidden' : 'active'}</p>
                  </div>
                  <button type="button" onClick={() => updateCase(caseItem.id, { is_active: caseItem.is_active === false })}>
                    {caseItem.is_active === false ? 'Show' : 'Hide'}
                  </button>
                  <button type="button" className="admin-danger-light" onClick={() => deleteCase(caseItem.id)}>Delete</button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'library' ? (
          <section className="browser-admin-grid manual-library-layout">
            <form className="browser-admin-form manual-upload-form" onSubmit={createLibraryGift}>
              <div className="admin-form-heading">
                <span>Manual gift database</span>
                <h2>Gift bazaga qo‘shish</h2>
                <p>Faqat gift nomi va WEBP kiriting. PNG avtomatik shu WEBP’dan olinadi.</p>
              </div>

              <label>
                <span>Gift nomi</span>
                <input value={libraryForm.title} onChange={(event) => setLibraryForm({ ...libraryForm, title: event.target.value })} placeholder="Masalan: Snoop Dogg" required />
              </label>

              <label>
                <span>WEBP fayl</span>
                <input id="manual-webp-input" type="file" accept="image/webp,.webp" onChange={(event) => setLibraryFile(event.target.files?.[0] || null)} required />
              </label>

              <button type="submit" disabled={busy}>{busy ? 'Yuklanmoqda...' : 'Gift bazaga yuklash'}</button>
            </form>

            <div className="manual-library-grid">
              {giftLibrary.length ? giftLibrary.map((gift) => (
                <div className="manual-library-card" key={gift.id}>
                  <div className="manual-library-media">
                    <GiftImage gift={gift} />
                  </div>
                  <div>
                    <strong>{gift.title}</strong>
                    <p>{gift.is_active === false ? 'hidden' : 'active'}</p>
                    <small>WEBP original + PNG preview</small>
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
                  <p>Gift nomi va WEBP yuklang.</p>
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
                <p>Bazadagi giftni tanlang, keyin fon rangini yoki gradientni kiriting.</p>
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
                    <option key={gift.id} value={gift.id}>{gift.title}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Fon rangi / gradient</span>
                <textarea
                  value={giftForm.background_value}
                  onChange={(event) => setGiftForm({ ...giftForm, background_value: event.target.value })}
                  rows={3}
                  placeholder="#7c3aed yoki linear-gradient(135deg,#7c3aed,#111827)"
                  required
                />
              </label>

              {selectedLibraryGift ? (
                <div className="selected-catalog-preview manual-selected-preview" style={{ '--telegram-gift-bg': giftForm.background_value || 'linear-gradient(135deg,#7c3aed,#111827)' }}>
                  <GiftImage gift={selectedLibraryGift} />
                  <div>
                    <strong>{giftForm.title || selectedLibraryGift.title}</strong>
                    <p>Fon preview shu yerda ko‘rinadi.</p>
                  </div>
                </div>
              ) : (
                <div className="selected-catalog-empty">
                  Avval Gift baza bo‘limida gift nomi va WEBP yuklang.
                </div>
              )}

              <label>
                <span>Nomi</span>
                <input value={giftForm.title} onChange={(event) => setGiftForm({ ...giftForm, title: event.target.value })} required />
              </label>

              <div className="browser-admin-two">
                <label>
                  <span>Stock</span>
                  <input type="number" value={giftForm.stock} onChange={(event) => setGiftForm({ ...giftForm, stock: event.target.value })} />
                </label>
                <label>
                  <span>Chance</span>
                  <input type="number" value={giftForm.chance} onChange={(event) => setGiftForm({ ...giftForm, chance: event.target.value })} />
                </label>
              </div>

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

              <button type="submit" disabled={busy || !giftForm.library_gift_id || !giftForm.background_value}>
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
                    <p>chance {gift.chance}% · stock {gift.stock} · {gift.is_active === false ? 'hidden' : 'active'}</p>
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
