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

const emptyGiftForm = {
  case_id: '',
  catalog_gift_id: '',
  telegram_gift_id: '',
  title: '',
  type: 'gift',
  value: '',
  floor_price: '',
  star_count: '',
  chance: '10',
  stock: '1',
  image_url: '',
  animation_url: '',
  background_value: '',
  rarity: 'legendary',
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


function isTgsAnimationUrl(url = '') {
  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.tgs') || cleanUrl.includes('/telegram/animations/');
}

function AdminTgsAnimation({ src }) {
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

        if (!response.ok) throw new Error(`TGS download failed: ${response.status}`);

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
        console.warn('Admin TGS animation failed:', error?.message || error);
      }
    }

    loadAnimation();

    return () => {
      cancelled = true;
      if (animation) animation.destroy();
    };
  }, [src]);

  return <span className="admin-gift-media admin-tgs-media"><span ref={containerRef} /></span>;
}

function AdminGiftMedia({ gift }) {
  const animationUrl = gift?.animation_url || '';
  const imageUrl = gift?.image_url || '';

  if (animationUrl) {
    if (isTgsAnimationUrl(animationUrl)) {
      return <AdminTgsAnimation src={animationUrl} />;
    }

    return <video className="admin-gift-media" src={animationUrl} autoPlay loop muted playsInline />;
  }

  if (imageUrl) {
    return <img className="admin-gift-media" src={imageUrl} alt="" />;
  }

  return <span className="admin-mini-icon">🎁</span>;
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
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  const [caseForm, setCaseForm] = useState(emptyCaseForm);
  const [giftForm, setGiftForm] = useState(emptyGiftForm);
  const [balanceUserId, setBalanceUserId] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('');

  const [telegramCatalog, setTelegramCatalog] = useState([]);
  const [telegramSyncLimit, setTelegramSyncLimit] = useState('160');
  const [telegramSyncResult, setTelegramSyncResult] = useState(null);

  const giftsByCase = useMemo(() => {
    return gifts.reduce((acc, gift) => {
      if (!acc[gift.case_id]) acc[gift.case_id] = [];
      acc[gift.case_id].push(gift);
      return acc;
    }, {});
  }, [gifts]);

  const selectedCatalogGift = useMemo(() => {
    return telegramCatalog.find((gift) => gift.id === giftForm.catalog_gift_id) || null;
  }, [giftForm.catalog_gift_id, telegramCatalog]);

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

  async function bootstrap(keyOverride = '') {
    const data = await run(() => callAdmin('bootstrap', {}, keyOverride));
    if (!data) return;

    setCases(data.cases || []);
    setGifts(data.gifts || []);
    setUsers(data.users || []);
    setWithdrawals(data.withdrawals || []);
    setTelegramCatalog(data.telegramCatalog || []);

    const firstCaseId = data.cases?.[0]?.id || '';
    setGiftForm((current) => (current.case_id ? current : { ...current, case_id: firstCaseId }));
  }

  async function login(event) {
    event.preventDefault();

    const cleanKey = adminKey.trim();
    const data = await run(() => callAdmin('bootstrap', {}, cleanKey), 'Admin panel ochildi ✅');
    if (!data) return;

    window.localStorage.setItem('gift_myst_admin_key', cleanKey);
    setSaved(true);
    setCases(data.cases || []);
    setGifts(data.gifts || []);
    setUsers(data.users || []);
    setWithdrawals(data.withdrawals || []);
    setTelegramCatalog(data.telegramCatalog || []);

    const firstCaseId = data.cases?.[0]?.id || '';
    setGiftForm((current) => ({ ...current, case_id: current.case_id || firstCaseId }));
  }

  function logout() {
    window.localStorage.removeItem('gift_myst_admin_key');
    setSaved(false);
    setAdminKey('');
    setCases([]);
    setGifts([]);
    setUsers([]);
    setWithdrawals([]);
    setTelegramCatalog([]);
    setTelegramSyncResult(null);
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
    if (!window.confirm('Case o‘chirilsinmi? Ichidagi giftlar ham o‘chishi mumkin.')) return;

    await run(() => callAdmin('case_delete', { caseId }), 'Case o‘chirildi');
    await bootstrap();
  }

  async function createGift(event) {
    event.preventDefault();

    const selectedCatalog = giftForm.catalog_gift_id;

    if (selectedCatalog) {
      const data = await run(
        () =>
          callAdmin('gift_create_from_catalog', {
            giftData: {
              caseId: giftForm.case_id,
              catalogGiftId: giftForm.catalog_gift_id,
              title: giftForm.title,
              floorPrice: Number(giftForm.floor_price || 0),
              chance: Number(giftForm.chance || 0),
              stock: Number(giftForm.stock || 0),
              rarity: giftForm.rarity,
              isActive: giftForm.is_active,
            },
          }),
        'Telegram catalog gift casega yuklandi ✅'
      );

      if (!data) return;

      setCases(data.cases || []);
      setGifts(data.gifts || []);
      setUsers(data.users || []);
      setWithdrawals(data.withdrawals || []);
      setTelegramCatalog(data.telegramCatalog || []);
      setGiftForm((current) => ({ ...emptyGiftForm, case_id: current.case_id }));
      return;
    }

    await run(
      () =>
        callAdmin('gift_create', {
          giftData: {
            ...giftForm,
            chance: Number(giftForm.chance || 0),
            stock: Number(giftForm.stock || 0),
          },
        }),
      'Gift qo‘shildi ✅'
    );

    setGiftForm((current) => ({ ...emptyGiftForm, case_id: current.case_id }));
    await bootstrap();
  }

  async function updateGift(giftId, updates) {
    await run(() => callAdmin('gift_update', { giftId, updates }), 'Gift yangilandi ✅');
    await bootstrap();
  }

  async function deleteGift(giftId) {
    if (!window.confirm('Gift o‘chirilsinmi?')) return;

    await run(() => callAdmin('gift_delete', { giftId }), 'Gift o‘chirildi');
    await bootstrap();
  }

  async function addBalance(event) {
    event.preventDefault();

    await run(
      () =>
        callAdmin('user_add_balance', {
          userId: balanceUserId,
          amount: Number(balanceAmount || 0),
        }),
      'Balans qo‘shildi ✅'
    );

    setBalanceUserId('');
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
      'User holati o‘zgardi ✅'
    );

    await bootstrap();
  }

  async function updateWithdrawal(requestId, status) {
    await run(() => callAdmin('withdraw_update', { requestId, status }), 'So‘rov yangilandi ✅');
    await bootstrap();
  }

  function applyCatalogGift(catalogId) {
    const catalogGift = telegramCatalog.find((gift) => gift.id === catalogId);

    if (!catalogGift) {
      setGiftForm((current) => ({
        ...current,
        catalog_gift_id: '',
        telegram_gift_id: '',
        title: '',
        value: '',
        floor_price: '',
        star_count: '',
        image_url: '',
        animation_url: '',
        background_value: '',
        rarity: 'legendary',
      }));
      return;
    }

    setGiftForm((current) => ({
      ...current,
      catalog_gift_id: catalogGift.id,
      telegram_gift_id: catalogGift.telegram_gift_id || '',
      title: catalogGift.title || '',
      type: 'gift',
      value: catalogGift.telegram_gift_id || '',
      floor_price: String(catalogGift.floor_price ?? catalogGift.star_count ?? ''),
      star_count: String(catalogGift.star_count ?? ''),
      image_url: catalogGift.image_url || '',
      animation_url: catalogGift.animation_url || '',
      background_value: catalogGift.background_value || '',
      rarity: catalogGift.rarity || current.rarity || 'legendary',
    }));
  }

  async function syncTelegramCatalog() {
    const data = await run(
      () =>
        callAdmin('telegram_gifts_sync', {
          limit: Number(telegramSyncLimit || 160),
          downloadAssets: true,
        }),
      'Telegram gifts catalog yangilandi ✅'
    );

    if (!data) return;

    setCases(data.cases || []);
    setGifts(data.gifts || []);
    setUsers(data.users || []);
    setWithdrawals(data.withdrawals || []);
    setTelegramCatalog(data.telegramCatalog || []);
    setTelegramSyncResult(data.syncResult || null);
  }

  async function reloadTelegramCatalog() {
    const data = await run(() => callAdmin('telegram_catalog_list', { limit: 500 }), 'Catalog yangilandi ✅');

    if (!data) return;

    setTelegramCatalog(data.telegramCatalog || []);
  }

  if (!saved) {
    return (
      <main className="browser-admin-page">
        <section className="admin-login-card">
          <span className="admin-lock-icon">🔐</span>
          <h1>Gift Myst Admin</h1>
          <p>Admin panel brauzerda xavfsiz ochilishi uchun Vercel ENV’dagi maxfiy kalitni kiriting.</p>

          <form onSubmit={login}>
            <input
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder="ADMIN_PANEL_KEY"
              autoComplete="current-password"
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? 'Tekshirilmoqda...' : 'Kirish'}
            </button>
          </form>

          {error ? <div className="admin-error">{error}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="browser-admin-page dashboard">
      {toast ? <div className="admin-toast">{toast}</div> : null}

      <section className="browser-admin-shell">
        <header className="browser-admin-header">
          <div>
            <span>Secure browser panel</span>
            <h1>Gift Myst Admin</h1>
          </div>

          <div className="admin-header-actions">
            <button type="button" onClick={() => bootstrap()} disabled={busy}>
              Refresh
            </button>
            <button type="button" onClick={logout} className="admin-danger-light">
              Logout
            </button>
          </div>
        </header>

        {error ? <div className="admin-error wide">{error}</div> : null}

        <nav className="browser-admin-tabs">
          {['cases', 'gifts', 'telegram', 'users', 'withdrawals'].map((item) => (
            <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {item === 'telegram' ? 'telegram gifts' : item}
            </button>
          ))}
        </nav>

        {tab === 'cases' ? (
          <section className="browser-admin-grid">
            <form className="browser-admin-form" onSubmit={createCase}>
              <h2>Case qo‘shish</h2>
              <input placeholder="Title" value={caseForm.title} onChange={(event) => setCaseForm({ ...caseForm, title: event.target.value })} required />
              <textarea placeholder="Description" value={caseForm.description} onChange={(event) => setCaseForm({ ...caseForm, description: event.target.value })} />
              <input type="number" placeholder="Price" value={caseForm.price} onChange={(event) => setCaseForm({ ...caseForm, price: event.target.value })} />
              <input placeholder="Image URL" value={caseForm.image_url} onChange={(event) => setCaseForm({ ...caseForm, image_url: event.target.value })} />
              <input placeholder="Badge text" value={caseForm.badge_text} onChange={(event) => setCaseForm({ ...caseForm, badge_text: event.target.value })} />
              <div className="browser-admin-two">
                <input type="color" value={caseForm.badge_color} onChange={(event) => setCaseForm({ ...caseForm, badge_color: event.target.value })} />
                <input type="color" value={caseForm.accent_color} onChange={(event) => setCaseForm({ ...caseForm, accent_color: event.target.value })} />
              </div>
              <button type="submit" disabled={busy}>Create case</button>
            </form>

            <div className="browser-admin-list">
              <h2>Cases</h2>
              {cases.map((caseItem) => (
                <div className="browser-admin-item" key={caseItem.id}>
                  {caseItem.image_url ? <img src={caseItem.image_url} alt="" /> : <span className="admin-mini-icon">📦</span>}
                  <div>
                    <strong>{caseItem.title}</strong>
                    <p>{money(caseItem.price)} · {(giftsByCase[caseItem.id] || []).length} gifts · {caseItem.is_active === false ? 'hidden' : 'active'}</p>
                  </div>
                  <button type="button" onClick={() => updateCase(caseItem.id, { is_active: caseItem.is_active === false })}>
                    {caseItem.is_active === false ? 'Show' : 'Hide'}
                  </button>
                  <button type="button" className="admin-danger-light" onClick={() => deleteCase(caseItem.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'gifts' ? (
          <section className="browser-admin-grid catalog-gift-layout">
            <form className="browser-admin-form catalog-gift-form" onSubmit={createGift}>
              <div className="admin-form-heading">
                <span>Telegram catalogdan</span>
                <h2>Gift qo‘shish</h2>
                <p>Avval Telegram Gifts bo‘limida hammasini 1 marta yuklab olasiz. Keyin shu yerdan case tanlab, catalogdagi giftni casega qo‘shasiz.</p>
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
                <span>Qo‘shiladigan Telegram gift</span>
                <select value={giftForm.catalog_gift_id} onChange={(event) => applyCatalogGift(event.target.value)} required>
                  <option value="">Catalogdan gift tanlang</option>
                  {telegramCatalog.map((gift) => (
                    <option key={gift.id} value={gift.id}>
                      {gift.title} · floor {money(gift.floor_price || gift.star_count)} ⭐
                    </option>
                  ))}
                </select>
              </label>

              {selectedCatalogGift ? (
                <div className="selected-catalog-preview" style={{ '--telegram-gift-bg': selectedCatalogGift.background_value || 'linear-gradient(135deg,#7c3aed,#111827)' }}>
                  <AdminGiftMedia gift={selectedCatalogGift} />
                  <div>
                    <strong>{selectedCatalogGift.title}</strong>
                    <p>ID: {smallId(selectedCatalogGift.telegram_gift_id)} · Stars: {money(selectedCatalogGift.star_count)} · Floor: {money(selectedCatalogGift.floor_price)} ⭐</p>
                  </div>
                </div>
              ) : (
                <div className="selected-catalog-empty">
                  Telegram Gifts bo‘limida avval catalogni yuklab oling, keyin bu yerdan gift tanlang.
                </div>
              )}

              <label>
                <span>Nomi</span>
                <input placeholder="Gift title" value={giftForm.title} onChange={(event) => setGiftForm({ ...giftForm, title: event.target.value })} required />
              </label>

              <div className="browser-admin-two">
                <label>
                  <span>Floor narxi</span>
                  <input type="number" placeholder="Floor price" value={giftForm.floor_price} onChange={(event) => setGiftForm({ ...giftForm, floor_price: event.target.value })} required />
                </label>

                <label>
                  <span>Stock</span>
                  <input type="number" placeholder="Stock" value={giftForm.stock} onChange={(event) => setGiftForm({ ...giftForm, stock: event.target.value })} />
                </label>
              </div>

              <div className="browser-admin-two">
                <label>
                  <span>Chance</span>
                  <input type="number" placeholder="Chance" value={giftForm.chance} onChange={(event) => setGiftForm({ ...giftForm, chance: event.target.value })} />
                </label>

                <label>
                  <span>Rarity</span>
                  <select value={giftForm.rarity} onChange={(event) => setGiftForm({ ...giftForm, rarity: event.target.value })}>
                    <option value="rare">rare</option>
                    <option value="epic">epic</option>
                    <option value="legendary">legendary</option>
                    <option value="mythic">mythic</option>
                  </select>
                </label>
              </div>

              <button type="submit" disabled={busy || !giftForm.catalog_gift_id}>
                {busy ? 'Yuklanmoqda...' : 'Yuklash'}
              </button>
            </form>

            <div className="browser-admin-list">
              <h2>Case giftlari</h2>
              {gifts.map((gift) => (
                <div className="browser-admin-item" key={gift.id}>
                  <AdminGiftMedia gift={gift} />
                  <div>
                    <strong>{gift.title}</strong>
                    <p>
                      floor {gift.floor_price ? `${money(gift.floor_price)} ⭐` : '—'}
                      {' '}· chance {gift.chance}% · stock {gift.stock} · {gift.is_active === false ? 'hidden' : 'active'}
                    </p>
                  </div>
                  <button type="button" onClick={() => updateGift(gift.id, { is_active: gift.is_active === false })}>
                    {gift.is_active === false ? 'Show' : 'Hide'}
                  </button>
                  <button type="button" className="admin-danger-light" onClick={() => deleteGift(gift.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'telegram' ? (
          <section className="telegram-import-panel telegram-catalog-panel">
            <div className="telegram-import-controls">
              <div>
                <span>MTProto catalog sync</span>
                <h2>Telegram Gifts</h2>
                <p>Bu yerda Telegram akkaunt orqali giftlar 1 marta yuklab olinadi: nomi, floor narxi, image, animation va orqa fon catalogga saqlanadi. Keyin Gifts bo‘limidan casega qo‘shasiz.</p>
              </div>

              <div className="telegram-import-form-grid">
                <label>
                  <span>Limit</span>
                  <input type="number" value={telegramSyncLimit} onChange={(event) => setTelegramSyncLimit(event.target.value)} />
                </label>

                <label>
                  <span>Catalog</span>
                  <input value={`${telegramCatalog.length} gift`} readOnly />
                </label>

                <label>
                  <span>Last sync</span>
                  <input value={telegramSyncResult ? `${telegramSyncResult.total || 0} synced` : 'not synced'} readOnly />
                </label>
              </div>

              <div className="telegram-import-actions">
                <button type="button" onClick={syncTelegramCatalog} disabled={busy}>
                  {busy ? 'Yuklanmoqda...' : '1 marta hammasini yuklab olish'}
                </button>

                <button type="button" onClick={reloadTelegramCatalog} disabled={busy}>
                  Catalogni refresh qilish
                </button>
              </div>

              {telegramSyncResult ? (
                <div className="telegram-sync-summary">
                  <strong>{telegramSyncResult.total || 0}</strong> synced · <strong>{telegramSyncResult.downloaded || 0}</strong> assets downloaded · <strong>{telegramSyncResult.reused || 0}</strong> reused
                </div>
              ) : null}
            </div>

            {telegramCatalog.length ? (
              <div className="telegram-catalog-grid">
                {telegramCatalog.map((gift) => (
                  <div
                    className={`telegram-catalog-card ${gift.status === 'pending' ? 'pending' : ''}`}
                    key={gift.id}
                    style={{ '--telegram-gift-bg': gift.background_value || 'linear-gradient(135deg,#7c3aed,#111827)' }}
                  >
                    <AdminGiftMedia gift={gift} />
                    <div>
                      <strong>{gift.title}</strong>
                      <small>ID: {smallId(gift.telegram_gift_id)}</small>
                      <p>Floor: {money(gift.floor_price || gift.star_count)} ⭐ · Stars: {money(gift.star_count)}</p>
                      <em>{gift.status || 'ready'}</em>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="telegram-import-empty">
                <span>⭐</span>
                <h3>Catalog hali bo‘sh</h3>
                <p>“1 marta hammasini yuklab olish” tugmasini bosing. ENV’da TG_API_ID, TG_API_HASH va TG_STRING_SESSION bo‘lishi kerak.</p>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'users' ? (
          <section className="browser-admin-grid">
            <form className="browser-admin-form" onSubmit={addBalance}>
              <h2>Balans qo‘shish</h2>
              <input placeholder="Telegram user ID" value={balanceUserId} onChange={(event) => setBalanceUserId(event.target.value)} required />
              <input type="number" placeholder="Amount" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} required />
              <button type="submit" disabled={busy}>Add balance</button>
            </form>

            <div className="browser-admin-list">
              <h2>Users</h2>
              {users.map((user) => (
                <div className="browser-admin-item no-image" key={user.id}>
                  <span className="admin-mini-icon">{user.first_name?.[0] || 'U'}</span>
                  <div>
                    <strong>{user.first_name || user.username || user.id}</strong>
                    <p>ID: {user.id} · {money(user.balance)} · {user.is_banned ? 'banned' : 'active'}</p>
                  </div>
                  <button type="button" onClick={() => toggleBan(user)}>
                    {user.is_banned ? 'Unban' : 'Ban'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'withdrawals' ? (
          <section className="browser-admin-list solo">
            <h2>Withdraw requests</h2>
            {withdrawals.map((request) => (
              <div className="browser-admin-item" key={request.id}>
                <AdminGiftMedia gift={request.gifts} />
                <div>
                  <strong>{request.gifts?.title || request.gift_id || 'Gift request'}</strong>
                  <p>User: {request.user_id} · status: {request.status}</p>
                </div>
                <button type="button" disabled={request.status !== 'pending'} onClick={() => updateWithdrawal(request.id, 'approved')}>
                  Approve
                </button>
                <button type="button" disabled={request.status !== 'pending'} className="admin-danger-light" onClick={() => updateWithdrawal(request.id, 'rejected')}>
                  Reject
                </button>
              </div>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
