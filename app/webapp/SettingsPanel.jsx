'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw, Settings2, Volume2, Smartphone, Sparkles, X, UserRound } from 'lucide-react';
import styles from './SettingsPanel.module.css';
import StarIcon from './StarIcon';

const format = (value) => new Intl.NumberFormat('uz-UZ').format(Number(value || 0));

function Setting({ icon: Icon, title, subtitle, checked, onChange }) {
  return (
    <label className={styles.option}>
      <span className={styles.optionIcon}><Icon size={20} strokeWidth={1.8} /></span>
      <span className={styles.optionText}><strong>{title}</strong><small>{subtitle}</small></span>
      <input
        type="checkbox"
        className={styles.switchInput}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={title}
      />
      <span className={styles.track} aria-hidden="true"><span /></span>
    </label>
  );
}

export default function SettingsPanel({ onClose, settings, onChange, telegramUser, profile, onRefresh }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    function escape(event) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  const update = (key) => (value) => onChange((current) => ({ ...current, [key]: value }));

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="giftmyst-settings-title">
        <header className={styles.header}>
          <span className={styles.headerIcon}><Settings2 size={22} aria-hidden="true" /></span>
          <span className={styles.heading}>
            <strong id="giftmyst-settings-title">Sozlamalar</strong>
            <small>Gift Myst · Shaxsiy parametrlar</small>
          </span>
          <button ref={closeRef} className={styles.close} type="button" onClick={onClose} aria-label="Sozlamalarni yopish"><X size={19} /></button>
        </header>
        <div className={styles.body}>
          <div className={styles.account}>
            <span className={styles.avatar}><UserRound size={21} /></span>
            <div className={styles.accountCopy}>
              <strong>{telegramUser?.first_name || 'Telegram user'}</strong>
              <small>{telegramUser?.username ? '@' + telegramUser.username : 'Telegram ID: ' + String(telegramUser?.id || '')}</small>
            </div>
            <div className={styles.accountBalance}><StarIcon variant="gold" size={21} /><strong>{format(profile?.balance)}</strong></div>
          </div>

          <h2 className={styles.sectionLabel}>INTERFEYS</h2>
          <div className={styles.options}>
            <Setting
              icon={Volume2}
              title="Navigatsiya ovozi"
              subtitle="Bo‘limga o‘tganda qisqa ovoz"
              checked={Boolean(settings.sound)}
              onChange={update('sound')}
            />
            <Setting
              icon={Smartphone}
              title="Navigatsiya vibratsiyasi"
              subtitle="Telefon tugma bosishni sezdiradi"
              checked={Boolean(settings.haptic)}
              onChange={update('haptic')}
            />
            <Setting
              icon={Sparkles}
              title="Kartochka effektlari"
              subtitle="Yengil harakat va dekorativ animatsiya"
              checked={Boolean(settings.effects)}
              onChange={update('effects')}
            />
          </div>

          <div className={styles.footer}>
            <span>Sozlamalar ushbu qurilmada saqlanadi.</span>
            <button type="button" className={styles.refresh} onClick={onRefresh}><RefreshCw size={16} /> Ma’lumotni yangilash</button>
          </div>
        </div>
      </section>
    </div>
  );
}
