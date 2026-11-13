'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, RefreshCw, Send, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { normalizeTelegramUsername } from '@/lib/withdrawRecipient.mjs';
import styles from './WithdrawalRecipientFields.module.css';

export default function WithdrawalRecipientFields({
  mode, onMode, username, onUsername, telegramUsername, apiPost, busy,
}) {
  const verified = normalizeTelegramUsername(telegramUsername);
  const [promptState, setPromptState] = useState('idle');
  const [promptError, setPromptError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (verified || promptedRef.current) return;
    promptedRef.current = true;
    let disposed = false;
    setPromptState('sending');
    apiPost('/api/withdraw', { action: 'prompt_username' })
      .then(() => { if (!disposed) setPromptState('sent'); })
      .catch((error) => {
        if (!disposed) {
          setPromptState('unavailable');
          setPromptError(error?.message || 'Botga xabar yuborilmadi.');
        }
      });
    return () => { disposed = true; };
  }, [verified, apiPost]);

  async function retrieveBotUsername() {
    if (busy || refreshing) return;
    setRefreshing(true);
    setPromptError('');
    try {
      const data = await apiPost('/api/withdraw', { action: 'draft' });
      const result = normalizeTelegramUsername(data.username);
      if (result) {
        onUsername('@' + result);
        setPromptState('received');
      } else {
        setPromptError('Botga @username yuboring, so‘ng qayta tekshiring.');
      }
    } catch (error) {
      setPromptError(error?.message || 'Botdan olishda xatolik.');
    } finally {
      setRefreshing(false);
    }
  }

  const manuallyEntered = normalizeTelegramUsername(username);
  const recipient = mode === 'self' && verified ? verified : manuallyEntered;

  return (
    <div className={styles.root}>
      <strong className={styles.label}>Gift kimga yuborilsin?</strong>
      <div className={styles.modes} role="radiogroup" aria-label="Gift qabul qiluvchi">
        <button type="button" role="radio" aria-checked={mode === 'self'}
          className={styles.mode + (mode === 'self' ? ' ' + styles.selected : '')}
          disabled={busy} onClick={() => onMode('self')}>
          <UserRound size={19}/><span><b>O‘zimga</b><small>Shaxsiy Telegram akkauntimga</small></span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'other'}
          className={styles.mode + (mode === 'other' ? ' ' + styles.selected : '')}
          disabled={busy} onClick={() => onMode('other')}>
          <UsersRound size={19}/><span><b>Boshqaga</b><small>Do‘stim yoki boshqa akkauntga</small></span>
        </button>
      </div>

      {mode === 'self' && verified ? (
        <div className={styles.recipient}>
          <ShieldCheck size={20}/>
          <div><small>Telegram profilingizdan olindi</small><strong>@{verified}</strong></div>
          <CheckCircle2 size={19}/>
        </div>
      ) : (
        <div className={styles.manual}>
          {mode === 'self' ? (
            <p className={styles.hint}>Sizning Telegram profilingizda @username yo‘q. Bot sizdan gift qabul qiladigan username-ni so‘raydi. Uni botda yoki shu yerda kiriting.</p>
          ) : (
            <p className={styles.hint}>Gift qabul qiladigan insonning Telegram @username-ini kiriting. Xato yozsangiz gift boshqa odamga ketishi mumkin.</p>
          )}
          <label htmlFor="withdraw-recipient-input">Qabul qiluvchi Telegram username</label>
          <div className={styles.inputBox}>
            <span>@</span>
            <input id="withdraw-recipient-input" type="text" inputMode="text"
              autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={33}
              placeholder="username123" disabled={busy}
              value={username.startsWith('@') ? username.slice(1) : username}
              onChange={(event) => onUsername(event.target.value)} />
          </div>
          {username && !manuallyEntered ? (
            <span className={styles.invalid}>5–32 belgi, lotin harfi bilan boshlansin; raqam va _ mumkin.</span>
          ) : null}
          {mode === 'self' ? (
            <div className={styles.bot}>
              <span><Send size={15}/>{promptState === 'sent' ? 'Bot username-ni so‘rab xabar yubordi' :
                promptState === 'received' ? 'Botdagi username olindi' :
                promptState === 'sending' ? 'Botga xabar yuborilmoqda…' :
                'Bot xabari olinmasa, username-ni shu yerga kiriting'}</span>
              <button type="button" disabled={busy || refreshing} onClick={retrieveBotUsername}>
                <RefreshCw size={15}/>{refreshing ? 'Tekshirilmoqda…' : 'Botdan olish'}
              </button>
              {promptError ? <small className={styles.botError}>{promptError}</small> : null}
            </div>
          ) : null}
          {manuallyEntered ? <p className={styles.preview}>Qabul qiluvchi: <b>@{manuallyEntered}</b></p> : null}
        </div>
      )}
      {recipient ? (
        <p className={styles.disclaimer}>Admin giftni faqat <b>@{recipient}</b> akkauntiga yuborish uchun ko‘rib chiqadi. Qo‘lda kiritilgan username alohida tekshiriladi.</p>
      ) : null}
    </div>
  );
}
