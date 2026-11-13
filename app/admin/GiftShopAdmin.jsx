'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Gift, Search, ShoppingBag, ToggleLeft, ToggleRight } from 'lucide-react';
import styles from './GiftShopAdmin.module.css';

const fmt = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const media = (gift) => gift?.image_url || gift?.png_url || gift?.webp_url || '/gifts/telegram-collectible.svg';

export default function GiftShopAdmin() {
  const [library, setLibrary] = useState([]);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = useCallback(async (action, values = {}) => {
    const response = await fetch('/api/admin/gift-shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...values }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'Server xatosi');
    return result;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await request('list');
      setLibrary(result.library || []);
      setItems(result.items || []);
      setError('');
    } catch (problem) {
      setError(problem.message || 'Do‘konni yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedGift = useMemo(() => library.find((gift) => gift.id === selection), [library, selection]);
  const existing = useMemo(() => items.find((item) => item.library_gift_id === selection), [items, selection]);
  const choices = useMemo(() => library.filter((gift) => (gift.title || '').toLowerCase().includes(query.toLowerCase())).slice(0, 120), [library, query]);

  function select(gift) {
    const saved = items.find((item) => item.library_gift_id === gift.id);
    setSelection(gift.id);
    setPrice(String(saved?.price ?? gift.buy_price ?? gift.price ?? 1));
    setStock(String(saved?.stock ?? 1));
    setIsActive(saved?.is_active !== false);
    setNotice('');
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    const numericPrice = Number(price);
    const numericStock = Number(stock);
    if (!selectedGift || !Number.isSafeInteger(numericPrice) || numericPrice <= 0 ||
        !Number.isSafeInteger(numericStock) || numericStock < 0 || numericStock > 100000) {
      setError('Gift, musbat butun Stars narxi va 0–100000 stock tanlang.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await request('save', {
        libraryGiftId: selectedGift.id, price: numericPrice, stock: numericStock, isActive,
      });
      setItems(result.items || []);
      setNotice('Gift Shop taklifi saqlandi.');
    } catch (problem) {
      setError(problem.message || 'Saqlab bo‘lmadi.');
    } finally { setSaving(false); }
  }

  async function toggle(item) {
    if (saving) return;
    setSaving(true);
    try {
      const result = await request('toggle', { id: item.id, isActive: !item.is_active });
      setItems(result.items || []);
      if (selection === item.library_gift_id) setIsActive(!item.is_active);
      setNotice(item.is_active ? 'Sotuv to‘xtatildi.' : 'Sotuv qayta ochildi.');
      setError('');
    } catch (problem) { setError(problem.message); }
    finally { setSaving(false); }
  }

  return (
    <section className={styles.root}>
      <div className={styles.intro}>
        <div className={styles.introIcon}><ShoppingBag size={27}/></div>
        <div><span>NEWPRO · INVENTORY STORE</span><h2>Gift Shop boshqaruvi</h2>
          <p>Gift bazasidan sovg‘ani tanlang, Stars narxi va sotuvdagi dona sonini belgilang. Case va Upgrade zaxiralariga ta’sir qilmaydi.</p></div>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.success} role="status"><Check size={16}/>{notice}</p> : null}
      {loading ? <p className={styles.message}>Giftlar yuklanmoqda…</p> : (
        <div className={styles.layout}>
          <div className={styles.editor}>
            <div className={styles.sectionHead}><h3>1. Qaysi gift sotiladi?</h3><span>{library.length} ta gift</span></div>
            <label className={styles.search}><Search size={17}/><input type="search" value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="Gift nomini qidiring" /></label>
            <div className={styles.choices}>
              {choices.map((gift) => (
                <button key={gift.id} type="button" onClick={() => select(gift)}
                  className={styles.choice + (selection === gift.id ? ' ' + styles.selected : '')}>
                  <span className={styles.choiceArt}><img loading="lazy" src={media(gift)} alt=""/></span>
                  <strong title={gift.title}>{gift.title}</strong>
                  <small>{items.some((item) => item.library_gift_id === gift.id) ? 'Do‘konda mavjud' : 'Tanlash'}</small>
                </button>
              ))}
            </div>

            <form className={styles.form} onSubmit={save}>
              <h3>2. Narx va miqdor</h3>
              {selectedGift ? (
                <div className={styles.selectedGift}><img src={media(selectedGift)} alt=""/>
                  <div><strong>{selectedGift.title}</strong><span>{existing ? 'Mavjud taklif yangilanadi' : 'Yangi taklif'}</span></div></div>
              ) : <p className={styles.message}>Yuqoridan gift tanlang.</p>}
              <div className={styles.fields}>
                <label><span>Narx (Stars) ⭐</span><input type="number" min="1" max="1000000000" step="1" required
                  value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Masalan: 150"/></label>
                <label><span>Miqdori (dona)</span><input type="number" min="0" max="100000" step="1" required
                  value={stock} onChange={(event) => setStock(event.target.value)} placeholder="Masalan: 20"/></label>
              </div>
              <label className={styles.switch}><input type="checkbox" checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}/>
                <span>Sotuv faol bo‘lsin</span></label>
              <button className={styles.save} type="submit" disabled={!selectedGift || saving}>
                <Check size={17}/>{saving ? 'Saqlanmoqda…' : existing ? 'O‘zgarishlarni saqlash' : 'Giftni sotuvga qo‘shish'}
              </button>
            </form>
          </div>

          <div className={styles.list}>
            <div className={styles.sectionHead}><h3>Sotuvdagi takliflar</h3><span>{items.length} ta</span></div>
            {!items.length ? <div className={styles.empty}><Gift size={29}/><p>Hozircha gift qo‘shilmagan.</p></div> : (
              items.map((item) => (
                <div key={item.id} className={styles.offer}>
                  <img src={media(item.gift_library)} alt=""/>
                  <div className={styles.offerText}>
                    <strong>{item.gift_library?.title || 'Gift'}</strong>
                    <span>⭐ {fmt(item.price)} · {fmt(item.stock)} dona</span>
                    <small>{item.is_active ? item.stock > 0 ? 'Sotuvda' : 'Stock tugagan' : 'Yashirilgan'}</small>
                  </div>
                  <div className={styles.offerActions}>
                    <button type="button" disabled={saving} onClick={() => {
                      const gift = library.find((row) => row.id === item.library_gift_id);
                      if (gift) select(gift);
                    }}>Tahrirlash</button>
                    <button type="button" disabled={saving} title={item.is_active ? 'Sotuvni to‘xtatish' : 'Sotuvni yoqish'}
                      aria-label={item.is_active ? 'Sotuvni to‘xtatish' : 'Sotuvni yoqish'}
                      onClick={() => toggle(item)}>{item.is_active ? <ToggleRight size={22}/> : <ToggleLeft size={22}/>}</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
