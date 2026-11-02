"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Gift,
  LoaderCircle,
  RefreshCcw,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import {
  eventState,
  formatStars as fmt,
  sameJoinTerms,
  serverClock,
  splitGiveaways,
  stakeError,
  timeLeft,
} from "@/lib/giveawayUi.mjs";
import GiveawayDialog from "./GiveawayDialog";
import GiveawayEventCard from "./GiveawayEventCard";
import GiveawayGiftMedia from "./GiveawayGiftMedia";
import styles from "./GiveawayHub.module.css";

function CompactCard({ item, now, onOpen }) {
  const state = eventState(item, now);
  return (
    <article className={styles.compact}>
      <GiveawayGiftMedia
        prize={item.prizes?.[0]}
        className={styles.compactArt}
      />
      <div className={styles.compactCopy}>
        <span className={styles.smallMode}>
          {item.mode === "weighted" ? "Stars vaznli" : "Teng imkoniyat"}
        </span>
        <h3>{item.title}</h3>
        <p>
          <Clock3 size={14} />
          {state === "completed"
            ? "Yakunlangan"
            : state === "drawing"
              ? "Natija kutilmoqda"
              : timeLeft(item.endsAt, now)}
        </p>
        <p>
          <Users size={14} />
          {fmt(item.participants)} qatnashchi ·{" "}
          {Number(item.price)
            ? `${item.mode === "weighted" ? "Min. " : ""}${fmt(item.price)} Stars`
            : "Bepul"}
        </p>
      </div>
      <button type="button" className={styles.secondary} onClick={onOpen}>
        Batafsil
        <ArrowRight size={16} />
      </button>
    </article>
  );
}
const pendingOperations = new Map();
const uuidPattern = /^[0-9a-f-]{36}$/i;
export default function GiveawayHub({
  apiPost,
  onBack,
  onBalanceChange,
  onToast,
  userId,
}) {
  const [data, setData] = useState({ giveaways: [], balance: null });
  const [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("main"),
    [selected, setSelected] = useState(null);
  const [joining, setJoining] = useState(""),
    [pending, setPending] = useState(null),
    [recovery, setRecovery] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const clock = useRef(null),
    epoch = useRef(0),
    locked = useRef(false),
    reading = useRef(false);
  const retry = useRef(null),
    scroll = useRef(0),
    opener = useRef(null),
    detail = useRef(null);
  const storageKey = userId ? `newpro.giveaway.operation.${userId}` : null;
  const remember = (operation) => {
    retry.current = operation;
    setRecovery(operation);
    if (storageKey) {
      if (operation) pendingOperations.set(storageKey, operation);
      else pendingOperations.delete(storageKey);
    }
    try {
      if (storageKey) {
        if (operation)
          sessionStorage.setItem(storageKey, JSON.stringify(operation));
        else sessionStorage.removeItem(storageKey);
      }
    } catch {
      /* In-memory retries remain available. */
    }
  };
  useEffect(() => {
    if (!storageKey) return;
    retry.current = null;
    setRecovery(null);
    let saved = pendingOperations.get(storageKey);
    try {
      saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") || saved;
    } catch {}
    try {
      if (
        saved &&
        uuidPattern.test(saved.id) &&
        uuidPattern.test(saved.requestId) &&
        Number.isSafeInteger(saved.stars) &&
        saved.stars >= 0 &&
        saved.stars <= 10000
      ) {
        retry.current = saved;
        setRecovery(saved);
      }
    } catch {
      /* A corrupt local operation cannot be submitted. */
    }
  }, [storageKey]);
  const refresh = useCallback(
    async (silent = false) => {
      if (reading.current || locked.current) return;
      const token = ++epoch.current;
      reading.current = token;
      setRefreshing(true);
      try {
        const result = await apiPost(
          "/api/giveaway",
          { action: "list" },
          { timeoutMs: 15000 },
        );
        if (token !== epoch.current) return;
        clock.current = serverClock(result.serverTime, performance.now());
        if (clock.current) setNow(clock.current(performance.now()));
        setData(result);
        if (!silent) setError("");
        if (result.balance != null && Number.isFinite(Number(result.balance)))
          onBalanceChange?.(Number(result.balance));
      } catch (e) {
        if (token === epoch.current)
          setError(e.message || "Server bilan aloqa uzildi.");
      } finally {
        if (reading.current === token) reading.current = false;
        if (token === epoch.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [apiPost, onBalanceChange],
  );
  const invalidate = useCallback(() => {
    epoch.current++;
    reading.current = false;
  }, []);
  useEffect(() => {
    void refresh();
    const ticker = setInterval(
      () =>
        setNow(clock.current ? clock.current(performance.now()) : Date.now()),
      1000,
    );
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 20000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      invalidate();
      clearInterval(ticker);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, invalidate]);
  const all = Array.isArray(data.giveaways) ? data.giveaways : [];
  const { main, others, results } = splitGiveaways(all, now);
  const selectedItem = selected
    ? all.find((item) => item.id === selected)
    : null;
  const currentPending = pending
    ? all.find((item) => item.id === pending.item.id)
    : null;
  const pendingError = pending
    ? !sameJoinTerms(pending.item, currentPending)
      ? "Ayni tanlov shartlari o‘zgardi. Yoping va qayta tekshiring."
      : stakeError(currentPending, pending.stars, data.balance, now)
    : "";
  const performJoin = async (operation) => {
    if (locked.current) return;
    locked.current = true;
    epoch.current++;
    reading.current = false;
    remember(operation);
    setJoining(operation.id);
    setPending(null);
    setError("");
    setNotice("");
    setRefreshing(false);
    try {
      const result = await apiPost(
        "/api/giveaway",
        {
          action: "join",
          giveawayId: operation.id,
          stars: operation.stars,
          requestId: operation.requestId,
        },
        { timeoutMs: 15000 },
      );
      remember(null);
      const validBalance =
        result.balance != null && Number.isFinite(Number(result.balance));
      if (validBalance) onBalanceChange?.(Number(result.balance));
      setData((previous) => ({
        ...previous,
        balance: validBalance ? Number(result.balance) : previous.balance,
        giveaways: previous.giveaways.map((item) =>
          item.id === operation.id
            ? {
                ...item,
                myWeight: result.entry?.weight ?? item.myWeight,
                myStars: result.entry?.totalStars ?? item.myStars,
              }
            : item,
        ),
      }));
      setNotice(
        result.balanceUnavailable
          ? "Qatnashish tasdiqlandi. Balans vaqtincha yangilanmadi; sahifani yangilang."
          : "Qatnashish tasdiqlandi.",
      );
      onToast?.("Giveaway qatnashuvi tasdiqlandi!");
    } catch (e) {
      // Only a definitive client/business rejection discards the operation ID.
      // Timeouts and 5xx responses must keep it, including across navigation.
      if ([400, 403, 404, 409].includes(e.status)) remember(null);
      setError(
        e.message || "Javob kelmadi. Shu so‘rov bilan qayta tekshiring.",
      );
    } finally {
      locked.current = false;
      setJoining("");
      void refresh(true);
    }
  };
  const requestJoin = (item, stars) => {
    if (locked.current || retry.current) return;
    const problem = stakeError(item, stars, data.balance, now);
    if (problem) {
      setError(problem);
      return;
    }
    if (stars > 0) {
      setPending({ item, stars });
      return;
    }
    const requestId = crypto.randomUUID?.();
    if (!requestId) {
      setError("Xavfsiz so‘rov yaratilmadi. Ilovani yangilang.");
      return;
    }
    void performJoin({ id: item.id, stars, requestId, title: item.title });
  };
  const confirmJoin = () => {
    if (!pending || pendingError || locked.current) return;
    const requestId = crypto.randomUUID?.();
    if (!requestId) {
      setError("Xavfsiz so‘rov yaratilmadi.");
      return;
    }
    void performJoin({
      id: pending.item.id,
      stars: pending.stars,
      requestId,
      title: pending.item.title,
    });
  };
  const openDetail = (id, button) => {
    scroll.current = window.scrollY;
    opener.current = button;
    setSelected(id);
    window.scrollTo({ top: 0 });
  };
  const closeDetail = () => {
    setSelected(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scroll.current });
      opener.current?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (selected) detail.current?.focus({ preventScroll: true });
  }, [selected]);
  const card = (item) => (
    <GiveawayEventCard
      key={`${item.id}:${item.price}`}
      item={item}
      now={now}
      balance={data.balance}
      joining={joining === item.id}
      blocked={Boolean(recovery)}
      requestJoin={requestJoin}
      apiPost={apiPost}
    />
  );
  return (
    <div className={styles.root}>
      <header className={styles.topbar}>
        <button
          type="button"
          data-giveaway-focus-return
          aria-label={selected ? "Ro‘yxatga qaytish" : "Orqaga qaytish"}
          onClick={selected ? closeDetail : onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <strong>Giveaway</strong>
        <button
          type="button"
          aria-label="Giveawaylarni yangilash"
          disabled={refreshing || Boolean(joining)}
          onClick={() => void refresh()}
        >
          <RefreshCcw size={19} className={refreshing ? styles.spinner : ""} />
        </button>
      </header>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            Yangilash
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {recovery && !joining ? (
        <div className={styles.recovery}>
          <strong>Oldingi so‘rov javobini tekshirish</strong>
          <p>
            {recovery.title} · {fmt(recovery.stars)} Stars
          </p>
          <small>
            Avvalgi so‘rov ID bilan takrorlanadi; tasdiqlangan to‘lov qayta
            yechilmaydi.
          </small>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void performJoin(recovery)}
          >
            Holatni tekshirish
          </button>
        </div>
      ) : null}
      <div hidden={Boolean(selected)}>
        <nav className={styles.tabs} aria-label="Giveaway bo‘limlari">
          {[
            ["main", "Asosiy"],
            ["others", `Qolganlar (${others.length})`],
            ["results", "Natijalar"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        {loading ? (
          <div className={styles.loading} role="status">
            <LoaderCircle className={styles.spinner} size={22} /> Giveawaylar
            yuklanmoqda…
            <div className={styles.cardSkeleton} />
          </div>
        ) : tab === "main" ? (
          main ? (
            card(main)
          ) : (
            <div className={styles.empty}>
              <Gift size={32} />
              <h2>Asosiy tanlov belgilanmagan</h2>
              <p>
                {others.length
                  ? "Boshqa sovrinli tanlovlarda qatnashishingiz mumkin."
                  : "Yangi tanlovlar shu yerda paydo bo‘ladi."}
              </p>
              {others.length ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setTab("others")}
                >
                  Qolgan tanlovlarni ko‘rish
                  <ArrowRight size={18} />
                </button>
              ) : null}
            </div>
          )
        ) : (tab === "others" ? others : results).length ? (
          <div className={styles.otherGrid}>
            {(tab === "others" ? others : results).map((item) => (
              <CompactCard
                key={item.id}
                item={item}
                now={now}
                onOpen={(e) => openDetail(item.id, e.currentTarget)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            {tab === "results" ? <Trophy size={32} /> : <Gift size={32} />}
            <h2>
              {tab === "results"
                ? "Natijalar hali yo‘q"
                : "Boshqa tanlovlar yo‘q"}
            </h2>
            <p>
              {tab === "results"
                ? "Yakunlangan tanlovlar va g‘oliblar shu yerda chiqadi."
                : "Yangi giveawaylar qo‘shilishini kuting."}
            </p>
          </div>
        )}
      </div>
      {selected ? (
        <section ref={detail} tabIndex={-1} aria-label="Giveaway tafsilotlari">
          {selectedItem ? (
            card(selectedItem)
          ) : (
            <div className={styles.empty}>
              <h2>Tanlov hozir ro‘yxatda yo‘q</h2>
              <p>U bekor qilingan yoki arxivlangan bo‘lishi mumkin.</p>
              <button
                type="button"
                className={styles.secondary}
                onClick={closeDetail}
              >
                Ro‘yxatga qaytish
              </button>
            </div>
          )}
        </section>
      ) : null}
      {pending ? (
        <GiveawayDialog
          title="Qatnashishni tasdiqlang"
          onClose={() => setPending(null)}
          busy={Boolean(joining)}
        >
          <div className={styles.confirmContent}>
            <span className={styles.confirmIcon}>
              <Star size={28} />
            </span>
            <h3>{pending.item.title}</h3>
            <dl className={styles.paymentSummary}>
              <div>
                <dt>Yechiladigan Stars</dt>
                <dd>{fmt(pending.stars)}</dd>
              </div>
              <div>
                <dt>Joriy balans</dt>
                <dd>{data.balance == null ? "—" : fmt(data.balance)}</dd>
              </div>
              <div>
                <dt>Amaldan keyin</dt>
                <dd>
                  {data.balance == null
                    ? "—"
                    : fmt(Math.max(0, data.balance - pending.stars))}{" "}
                  Stars
                </dd>
              </div>
            </dl>
            {pendingError ? (
              <p className={styles.fieldError} role="alert">
                {pendingError}
              </p>
            ) : null}
            <button
              type="button"
              className={styles.primary}
              disabled={Boolean(pendingError) || Boolean(joining)}
              onClick={confirmJoin}
            >
              Tasdiqlash va qatnashish
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setPending(null)}
            >
              Bekor qilish
            </button>
          </div>
        </GiveawayDialog>
      ) : null}
    </div>
  );
}
