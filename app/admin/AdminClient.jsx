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

const emptyGiftForm = {
  case_id: '',
  title: '',
  type: 'gift',
  value: '',
  chance: '10',
  stock: '999',
  image_url: '',
  animation_url: '',
  background_value: '',
  rarity: 'rare',
  is_active: true,
};

function money(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
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

  const giftsByCase = useMemo(() => {
    return gifts.reduce((acc, gift) => {
      if (!acc[gift.case_id]) acc[gift.case_id] = [];
      acc[gift.case_id].push(gift);
      return acc;
    }, {});
  }, [gifts]);

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
  }

  function logout() {
    window.localStorage.removeItem('gift_myst_admin_key');
    setSaved(false);
    setAdminKey('');
    setCases([]);
    setGifts([]);
    setUsers([]);
    setWithdrawals([]);
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
          {['cases', 'gifts', 'users', 'withdrawals'].map((item) => (
            <button key={item} type="button" className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
              {item}
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
          <section className="browser-admin-grid">
            <form className="browser-admin-form" onSubmit={createGift}>
              <h2>Gift qo‘shish</h2>
              <select value={giftForm.case_id} onChange={(event) => setGiftForm({ ...giftForm, case_id: event.target.value })} required>
                <option value="">Case tanlang</option>
                {cases.map((caseItem) => (
                  <option key={caseItem.id} value={caseItem.id}>{caseItem.title}</option>
                ))}
              </select>
              <input placeholder="Title" value={giftForm.title} onChange={(event) => setGiftForm({ ...giftForm, title: event.target.value })} required />
              <select value={giftForm.type} onChange={(event) => setGiftForm({ ...giftForm, type: event.target.value })}>
                <option value="gift">Gift</option>
                <option value="balance">Balance</option>
              </select>
              <input placeholder="Value" value={giftForm.value} onChange={(event) => setGiftForm({ ...giftForm, value: event.target.value })} />
              <div className="browser-admin-two">
                <input type="number" placeholder="Chance" value={giftForm.chance} onChange={(event) => setGiftForm({ ...giftForm, chance: event.target.value })} />
                <input type="number" placeholder="Stock" value={giftForm.stock} onChange={(event) => setGiftForm({ ...giftForm, stock: event.target.value })} />
              </div>
              <input placeholder="Image URL" value={giftForm.image_url} onChange={(event) => setGiftForm({ ...giftForm, image_url: event.target.value })} />
              <input placeholder="Animation URL" value={giftForm.animation_url} onChange={(event) => setGiftForm({ ...giftForm, animation_url: event.target.value })} />
              <button type="submit" disabled={busy}>Create gift</button>
            </form>

            <div className="browser-admin-list">
              <h2>Gifts</h2>
              {gifts.map((gift) => (
                <div className="browser-admin-item" key={gift.id}>
                  {gift.image_url ? <img src={gift.image_url} alt="" /> : <span className="admin-mini-icon">🎁</span>}
                  <div>
                    <strong>{gift.title}</strong>
                    <p>{gift.type} · chance {gift.chance}% · stock {gift.stock} · {gift.is_active === false ? 'hidden' : 'active'}</p>
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
              <div className="browser-admin-item no-image" key={request.id}>
                <span className="admin-mini-icon">💸</span>
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
