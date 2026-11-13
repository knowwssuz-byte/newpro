'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Gift, Package, RefreshCw, ShoppingBag, Sparkles, X } from 'lucide-react';
import StarIcon from './StarIcon';
import styles from './GiftShop.module.css';

function stars(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function mediaUrl(offer) {
  return offer?.image_url || '/gifts/telegram-collectible.svg';
}

export default function GiftShop({ apiPost, balance, onBack, onBought }) {
  const [offers, setOffers] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(Number(balance || 0));
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [buying, setBuying] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await apiPost('/api/gift-shop', { action: 'list' });
      setOffers(Array.isArray(result.offers) ? result.offers : []);
      setCurrentBalance(Number(result.balance || 0));
      setProblem('');
    } catch (error) {
      setProblem(error.message || 'Giftlarni yuklab bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  }, [apiPost]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setCurrentBalance(Number(balance || 0)); }, [balance]);

  function choose(offer) {
    if (buying || Number(offer.stock) <= 0) return;
    setProblem('');
    setConfirmation({ offer, requestId: crypto.randomUUID() });
  }

  async function buy() {
    if (!confirmation || inFlight.current) return;
    inFlight.current = true;
    setBuying(true);
    setProblem('');
    const selected = confirmation;
    try {
      const result = await apiPost('/api/gift-shop', {
        action: 'buy',
        shopItemId: selected.offer.id,
        expectedPrice: Number(selected.offer.price),
        requestId: selected.requestId,
      });
      if (result?.purchase) {
        setCurrentBalance(Number(result.purchase.balance));
        setConfirmation(null);
        // Reconcile server history and the inventory before leaving the shop.
        await onBought?.(result.purchase);
        await refresh({ quiet: true });
      }
    } catch (error) {
      // Keep the request ID on uncertain network failures. Retrying won't
      // charge twice, even if the first response was lost.
      setProblem(error.message || 'Xaridni tugatib bo‘lmadi.');
      if (/narx o‘zgardi|tugagan|sotuvda emas/i.test(error.message || '')) {
        setConfirmation(null);
        void refresh({ quiet: true });
      }
    } finally {
      inFlight.current = false;
      setBuying(false);
    }
  }

  return (
    <section className={styles.page} aria-label="Gift Shop">
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Inventoryga qaytish">
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerText}>
          <span className={styles.kicker}><Sparkles size={13} /> NEWPRO EXCLUSIVE</span>
          <h1>Gift Shop</h1>
          <p>Gift tanlang, Stars bilan sotib oling va inventaringizda saqlang.</p>
        </div>
        <div className={styles.balance} aria-label={'Balans '+stars(currentBalance)+' Stars'}>
          <StarIcon variant="badge" size={20} />
          <strong>{stars(currentBalance)}</strong>
        </div>
      </header>

      <div className={styles.banner}>
        <div className={styles.bannerIcon}><ShoppingBag size={30} strokeWidth={1.8} /></div>
        <div><span className={styles.bannerLabel}>LIMITED COLLECTION</span>
          <h2>O‘zingiz yoqtirgan giftni tanlang</h2>
          <p>Gift xarid qilinganda inventarga qo‘shiladi. Miqdor cheklangan.</p></div>
      </div>

      <div className={styles.listHeading}>
        <div><h2>Sotuvdagi giftlar</h2><span>{offers.length} ta taklif</span></div>
        <button className={styles.refresh} type="button" disabled={loading || buying}
          onClick={() => refresh()} aria-label="Do‘konni yangilash"><RefreshCw size={17}/></button>
      </div>
      {problem ? <div className={styles.error} role="alert">{problem}</div> : null}
      {loading ? (
        <div className={styles.grid} aria-label="Giftlar yuklanmoqda">
          {[1,2,3,4].map((id) => <div className={styles.skeleton} key={id}/>)}
        </div>
      ) : offers.length === 0 ? (
        <div className={styles.empty}><Package size={34}/><strong>Hozircha giftlar yo‘q</strong>
          <span>Admin yangi gift qo‘shganda shu yerda paydo bo‘ladi.</span></div>
      ) : (
        <div className={styles.grid}>
          {offers.map((offer) => {
            const soldOut = Number(offer.stock) <= 0;
            const canAfford = currentBalance >= Number(offer.price);
            return (
              <article className={styles.card} key={offer.id}>
                <div className={styles.art} style={{ background: offer.background_value || undefined }}>
                  <img src={mediaUrl(offer)} loading="lazy" alt={offer.title} draggable="false"/>
                  <span className={styles.stock}>{soldOut ? 'Tugagan' : offer.stock+' dona qoldi'}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3 title={offer.title}>{offer.title}</h3>
                  <span className={styles.price}><StarIcon variant="badge" size={20}/>{stars(offer.price)} <small>Stars</small></span>
                  <button type="button" className={styles.buy} disabled={soldOut || buying}
                    onClick={() => choose(offer)}>
                    {soldOut ? 'Sotuvda yo‘q' : canAfford ? 'Sotib olish' : 'Balansni tekshirish'}
                    {!soldOut ? <ShoppingBag size={16}/> : null}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirmation ? (
        <div className={styles.overlay} onClick={() => { if (!buying) setConfirmation(null); }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="shop-buy-title"
            onClick={(event) => event.stopPropagation()}>
            <button type="button" className={styles.close} aria-label="Yopish"
              disabled={buying} onClick={() => setConfirmation(null)}><X size={20}/></button>
            <div className={styles.modalArt}><img src={mediaUrl(confirmation.offer)} alt=""/></div>
            <span className={styles.modalKicker}><Gift size={16}/> GIFT XARIDI</span>
            <h2 id="shop-buy-title">{confirmation.offer.title}</h2>
            <p>Gift inventaringizga qo‘shiladi. Xaridni tasdiqlaysizmi?</p>
            <div className={styles.summary}>
              <span>Narxi</span><strong><StarIcon variant="badge" size={18}/>{stars(confirmation.offer.price)}</strong>
              <span>Balansingiz</span><strong>{stars(currentBalance)} Stars</strong>
              <span>Qoladigan balans</span><strong>{stars(Math.max(0, currentBalance - confirmation.offer.price))} Stars</strong>
            </div>
            {problem ? <div className={styles.error} role="alert">{problem}</div> : null}
            {currentBalance < Number(confirmation.offer.price) ? (
              <div className={styles.insufficient}>Stars yetarli emas. Balansingizni to‘ldiring.</div>
            ) : null}
            <button type="button" className={styles.confirm} disabled={buying || currentBalance < Number(confirmation.offer.price)}
              onClick={buy}>{buying ? 'Xarid tekshirilmoqda…' : <><Check size={18}/> {stars(confirmation.offer.price)} Stars bilan sotib olish</>}</button>
            <button type="button" className={styles.cancel} disabled={buying} onClick={() => setConfirmation(null)}>Bekor qilish</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
