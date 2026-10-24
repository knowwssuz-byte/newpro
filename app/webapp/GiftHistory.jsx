'use client';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Gift, History as HistoryIcon, RefreshCcw, XCircle } from 'lucide-react';
import { getGiftActivity } from '@/lib/inventory.mjs';
import styles from './GiftHistory.module.css';

const STATUS = {
  pending: { name: 'Jarayonda', Icon: Clock3, className: 'pending' },
  approved: { name: 'Tasdiqlandi', Icon: CheckCircle2, className: 'completed' },
  rejected: { name: 'Rad etildi', Icon: XCircle, className: 'rejected' },
  sold: { name: 'Sotilgan', Icon: CheckCircle2, className: 'completed' },
  upgraded: { name: 'Upgrade uchun ishlatilgan', Icon: CheckCircle2, className: 'completed' },
};
const money = x => new Intl.NumberFormat('uz-UZ').format(Number(x) || 0);
function timeText(value) {
  if (!value) return 'Sana belgilanmagan';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sana belgilanmagan';
  return date.toLocaleString('uz-UZ', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' });
}

export default function GiftHistory({ history = [], gifts = [], withdrawals = [], onBack, onRefresh }) {
  const [mode, setMode] = useState('pending');
  const rows = useMemo(() => getGiftActivity(history, gifts, withdrawals),[history, gifts, withdrawals]);
  const pending = rows.filter(row => row.status === 'pending');
  const done = rows.filter(row => row.status !== 'pending');
  const current = mode === 'pending' ? pending : done;
  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Orqaga"><ArrowLeft size={19}/></button>
        <div><span>ACCOUNT ACTIVITY</span><h1>Gift tarixi</h1></div>
        <button type="button" onClick={onRefresh} className={styles.refresh} aria-label="Tarixni yangilash"><RefreshCcw size={17}/></button>
      </div>
      <div className={styles.summary}>
        <span className={styles.summaryGlyph}><HistoryIcon size={25}/></span>
        <div><strong>Har bir sovg‘a nazoratda</strong><p>Yechish so‘rovlari, tasdiqlangan o‘tkazmalar va sotuvlar</p></div>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Gift holatlari">
        <button role="tab" type="button" aria-selected={mode === 'pending'} className={mode === 'pending' ? styles.selected : ''} onClick={() => setMode('pending')}>
          Jarayonda <b>{pending.length}</b>
        </button>
        <button role="tab" type="button" aria-selected={mode === 'completed'} className={mode === 'completed' ? styles.selected : ''} onClick={() => setMode('completed')}>
          Yakunlangan <b>{done.length}</b>
        </button>
      </div>
      {current.length ? (
        <div className={styles.list} role="tabpanel">
          {current.map((row) => {
            const info = STATUS[row.status] || STATUS.pending;
            const icon = info.Icon;
            return (
              <article className={styles.item} key={row.kind + row.id}>
                <div className={styles.preview}>
                  {row.gift?.image_url ? <img src={row.gift.image_url} alt="" loading="lazy" /> : <Gift size={24}/>}
                </div>
                <div className={styles.details}>
                  <strong title={row.gift?.title || ''}>{row.gift?.title || 'Gift'}</strong>
                  <span>{row.kind === 'upgrade' ? 'Upgrade urinishida sarflangan' : row.kind === 'sale' ? 'Sotuv' : 'Gift o‘tkazish'}</span>
                  <small>{timeText(row.date)}</small>
                  {row.note ? <p>{row.note}</p> : null}
                </div>
                <div className={styles.trailing}>
                  <span className={styles[info.className]}><info.Icon size={12}/>{info.name}</span>
                  {row.kind === 'sale' && row.amount > 0 ? <b>+{money(row.amount)} ★</b> : <ArrowUpRight size={16}/>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className={styles.empty}><HistoryIcon size={32}/><strong>{mode==='pending'?'Hozircha jarayondagi sovg‘a yo‘q':'Yakunlangan jarayonlar yo‘q'}</strong><p>So‘rov holati o‘zgarganda shu yerda ko‘rinadi.</p></div>}
      <div className={styles.notice}>Rad etilgan o‘tkazish so‘rovidan keyin sovg‘a Inventory bo‘limiga qaytadi. Ma’lumotlar serverdan olinadi.</div>
    </section>
  );
}
