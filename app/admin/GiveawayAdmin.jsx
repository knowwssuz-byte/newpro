"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  Crown,
  Plus,
  RefreshCcw,
  Search,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { giveawayPublishState } from "@/lib/giveawayPublish.mjs";
import {
  formatStars as fmt,
  giftFromLibrary,
  serverClock,
} from "@/lib/giveawayUi.mjs";
import GiveawayDialog from "../webapp/GiveawayDialog";
import GiveawayGiftMedia from "../webapp/GiveawayGiftMedia";
import { GiveawayPrizeStage } from "../webapp/GiveawayEventCard";
import cardStyles from "../webapp/GiveawayHub.module.css";
import "./giveaway-admin.css";

const localDate = (value) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const initial = () => ({
  title: "",
  description: "",
  mode: "equal",
  entryPrice: "0",
  endsAt: localDate(Date.now() + 86400000),
  prizeIds: [""],
});
const when = (value) => new Date(value).toLocaleString("uz-UZ");
const labels = {
  draft: "Draft",
  live: "Faol",
  completed: "Yakunlangan",
  cancelled: "Bekor qilingan",
};
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function GiveawayAdmin({ adminKey, giftLibrary = [] }) {
  const [view, setView] = useState("list"),
    [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(initial),
    [giveaways, setGiveaways] = useState([]);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState(null),
    [picker, setPicker] = useState(null),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(48);
  const [proofs, setProofs] = useState({}),
    [filter, setFilter] = useState("all");
  const [now, setNow] = useState(() => Date.now());
  const lock = useRef(false),
    clock = useRef(null),
    loadVersion = useRef(0);
  const validGifts = useMemo(
    () => giftLibrary.filter((g) => g.is_active !== false),
    [giftLibrary],
  );
  const selected = giveaways.find((g) => g.id === selectedId);
  const candidates = validGifts.filter((g) =>
    g.title?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()),
  );
  const call = useCallback(
    async (action, params = {}) => {
      const response = await fetch("/api/browser-admin", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + adminKey,
        },
        body: JSON.stringify({ action, ...params }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok)
        throw Error(json?.error || "Server bilan aloqa uzildi.");
      return json;
    },
    [adminKey],
  );
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const response = await call("giveaway_list");
    if (version !== loadVersion.current) return;
    setGiveaways(response.giveaways || []);
    setLoaded(true);
    clock.current = serverClock(response.serverTime, performance.now());
    if (clock.current) setNow(clock.current(performance.now()));
  }, [call]);
  useEffect(() => {
    void load().catch((e) => {
      setError(e.message);
      setLoaded(true);
    });
    const timer = setInterval(
      () =>
        setNow(clock.current ? clock.current(performance.now()) : Date.now()),
      1000,
    );
    return () => clearInterval(timer);
  }, [load]);
  const act = async (action, params, message, after) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await call(action, params);
      setNotice(message);
      after?.(result);
      try {
        await load();
      } catch {
        setError(
          "Amal saqlandi, lekin ro‘yxat yangilanmadi. Yangilash tugmasini bosing.",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const edit = (g) => {
    setForm(
      g
        ? {
            id: g.id,
            updatedAt: g.updated_at,
            title: g.title,
            description: g.description,
            mode: g.mode,
            entryPrice: String(g.entry_price),
            endsAt: localDate(g.ends_at),
            prizeIds: g.prizes.map((p) => p.libraryGiftId),
          }
        : initial(),
    );
    setError("");
    setNotice("");
    setView("edit");
  };
  const save = async (event) => {
    event.preventDefault();
    if (form.prizeIds.some((id) => !UUID.test(id || ""))) {
      setError("Har bir o‘rin uchun katalogdan sovg‘a tanlang.");
      return;
    }
    const date = new Date(form.endsAt);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= now + 300000 ||
      date.getTime() > now + 90 * 86400000
    ) {
      setError("Muddat 5 daqiqadan keyin va 90 kun ichida bo‘lishi kerak.");
      return;
    }
    await act(
      form.id ? "giveaway_update" : "giveaway_create",
      {
        ...form,
        entryPrice: Number(form.entryPrice),
        endsAt: date.toISOString(),
      },
      "Draft saqlandi. E’lon qilish alohida tasdiqlanadi.",
      (result) => {
        setSelectedId(result.id);
        setView("detail");
      },
    );
  };
  const move = (index, direction) =>
    setForm((previous) => {
      const ids = [...previous.prizeIds];
      [ids[index], ids[index + direction]] = [
        ids[index + direction],
        ids[index],
      ];
      return { ...previous, prizeIds: ids };
    });
  const feature = (g) =>
    void act(
      "giveaway_feature",
      {
        id: g.id,
        featured: !(g.status === "draft" ? g.featureOnPublish : g.isFeatured),
      },
      g.status === "draft"
        ? "Draftning e’lon qilish belgisi yangilandi."
        : "Asosiy tanlov yangilandi.",
    );
  const ask = (action, g, prize) => {
    setError("");
    setConfirm({
      action,
      item: g,
      prize,
      note: prize ? (proofs[prize.id] || "").trim() : "",
    });
  };
  const confirmState =
    confirm?.action === "publish"
      ? giveawayPublishState(confirm.item, { now })
      : null;
  const confirmAction = () => {
    if (!confirm || (confirm.action === "publish" && confirmState !== "ready"))
      return;
    const { action, item, prize, note } = confirm;
    const params =
      action === "deliver"
        ? { prizeId: prize.id, note }
        : {
            id: item.id,
            ...(action === "publish" ? { updatedAt: item.updated_at } : {}),
          };
    void act(
      "giveaway_" + action,
      params,
      {
        publish: "Giveaway e’lon qilindi.",
        cancel: "Giveaway bekor qilindi. Stars qaytarildi.",
        draw: "G‘oliblar saqlandi.",
        deliver: "Yetkazilgan deb qayd etildi. Bu amal gift yubormaydi.",
      }[action],
      () => setConfirm(null),
    );
  };
  const preview = {
    title: form.title,
    mode: form.mode,
    status: "live",
    price: Number(form.entryPrice),
    participants: 0,
    endsAt: form.endsAt,
    prizes: form.prizeIds.map((id, i) => ({
      id: id || String(i),
      place: i + 1,
      ...giftFromLibrary(validGifts.find((g) => g.id === id)),
    })),
  };
  const confirmationTitles = {
    publish: "Giveaway e’lon qilish",
    cancel: "Giveawayni bekor qilish",
    draw: "G‘oliblarni aniqlash",
    deliver: "Yetkazishni qayd etish",
  };
  return (
    <section className="ga-root">
      <header className="ga-header">
        <div>
          <span className="ga-eyebrow">NEWPRO</span>
          <h2>Giveaway Studio</h2>
          <p>Tanlovlar, sovrinlar va yetkazish qaydlari.</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="ga-secondary"
        >
          <RefreshCcw size={17} /> Yangilash
        </button>
      </header>
      <nav className="ga-nav" aria-label="Giveaway boshqaruvi">
        <button
          type="button"
          data-giveaway-focus-return
          aria-pressed={view === "list"}
          onClick={() => setView("list")}
        >
          Giveawaylar
        </button>
        <button
          type="button"
          aria-pressed={view === "edit"}
          onClick={() => edit(null)}
        >
          <Plus size={17} /> Yangi yaratish
        </button>
        {view === "detail" ? <span>Tanlov tafsilotlari</span> : null}
      </nav>
      {error ? (
        <div role="alert" className="ga-alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="ga-note">
          <Check size={17} />
          {notice}
        </div>
      ) : null}
      {view === "list" ? (
        <>
          <div className="ga-filters">
            {[["all", "Barchasi"], ...Object.entries(labels)].map(
              ([value, label]) => (
                <button
                  type="button"
                  aria-pressed={filter === value}
                  key={value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ),
            )}
          </div>
          {!loaded ? (
            <p className="ga-empty">Tanlovlar yuklanmoqda…</p>
          ) : (
            <div className="ga-list">
              {giveaways
                .filter((g) => filter === "all" || g.status === filter)
                .map((g) => (
                  <article className="ga-list-card" key={g.id}>
                    <GiveawayGiftMedia
                      prize={{
                        title: g.prizes?.[0]?.giftTitle,
                        imageUrl: g.prizes?.[0]?.giftImageUrl,
                        animationUrl: g.prizes?.[0]?.giftAnimationUrl,
                      }}
                      className="ga-list-art"
                    />
                    <div className="ga-list-copy">
                      <span className={"ga-status " + g.status}>
                        {labels[g.status]}
                      </span>
                      {g.isFeatured ? (
                        <span className="ga-featured">
                          <Crown size={13} /> Asosiy
                        </span>
                      ) : g.featureOnPublish ? (
                        <span className="ga-featured">
                          E’lon qilingach asosiy
                        </span>
                      ) : null}
                      <h3>{g.title}</h3>
                      <p>
                        <Clock3 size={14} />
                        {when(g.ends_at)}
                      </p>
                      <p>
                        <Users size={14} />
                        {fmt(g.members)} qatnashchi · {fmt(g.totalStars)} Stars
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ga-secondary"
                      onClick={() => {
                        setSelectedId(g.id);
                        setView("detail");
                      }}
                    >
                      Batafsil
                    </button>
                  </article>
                ))}
            </div>
          )}
          {loaded &&
          !giveaways.some((g) => filter === "all" || g.status === filter) ? (
            <p className="ga-empty">Bu bo‘limda tanlovlar yo‘q.</p>
          ) : null}
        </>
      ) : null}
      {view === "edit" ? (
        <div className="ga-editor">
          <form className="ga-form" onSubmit={save}>
            <h3>{form.id ? "Draftni tahrirlash" : "Yangi Giveaway"}</h3>
            <label>
              Nomi
              <input
                required
                minLength={4}
                maxLength={90}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Masalan: Crystal Heart Giveaway"
              />
            </label>
            <label>
              Qisqacha tavsif
              <textarea
                rows={3}
                maxLength={700}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <fieldset className="ga-mode-picker">
              <legend>Tanlov rejimi</legend>
              {[
                ["equal", "Teng imkoniyat"],
                ["weighted", "Stars vaznli"],
              ].map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="mode"
                    checked={form.mode === value}
                    onChange={() =>
                      setForm({
                        ...form,
                        mode: value,
                        entryPrice:
                          value === "weighted" && Number(form.entryPrice) < 1
                            ? "1"
                            : form.entryPrice,
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <div className="ga-form-row">
              <label>
                {form.mode === "weighted"
                  ? "Minimal Stars"
                  : "Kirish narxi (0 = bepul)"}
                <input
                  type="number"
                  min={form.mode === "weighted" ? 1 : 0}
                  max={10000}
                  step={1}
                  required
                  value={form.entryPrice}
                  onChange={(e) =>
                    setForm({ ...form, entryPrice: e.target.value })
                  }
                />
              </label>
              <label>
                Tugash vaqti
                <input
                  type="datetime-local"
                  required
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </label>
            </div>
            <p className="ga-hint">
              Vaqt qurilmangizning mahalliy vaqt mintaqasida. Kamida 5 daqiqa,
              ko‘pi bilan 90 kun.
            </p>
            <div className="ga-prizes-head">
              <h4>Sovrinli o‘rinlar</h4>
              <button
                type="button"
                className="ga-secondary"
                disabled={form.prizeIds.length >= 10}
                onClick={() =>
                  setForm((f) => ({ ...f, prizeIds: [...f.prizeIds, ""] }))
                }
              >
                <Plus size={16} /> O‘rin
              </button>
            </div>
            <div className="ga-prize-inputs">
              {form.prizeIds.map((id, i) => (
                <div className="ga-prize-row" key={i}>
                  <span className="ga-place">{i + 1}</span>
                  <button
                    type="button"
                    className="ga-gift-select"
                    onClick={() => {
                      setSearch("");
                      setLimit(48);
                      setPicker(i);
                    }}
                    aria-label={`${i + 1}-o‘rin sovg‘asini tanlash`}
                  >
                    <GiveawayGiftMedia
                      prize={giftFromLibrary(
                        validGifts.find((g) => g.id === id),
                      )}
                      className="ga-thumb"
                    />
                    <span>
                      {validGifts.find((g) => g.id === id)?.title ||
                        "Sovg‘ani tanlang"}
                    </span>
                    <Search size={17} />
                  </button>
                  <div className="ga-order">
                    <button
                      type="button"
                      aria-label={`${i + 1}-o‘rinni yuqoriga`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${i + 1}-o‘rinni pastga`}
                      disabled={i === form.prizeIds.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${i + 1}-o‘rinni olib tashlash`}
                      disabled={form.prizeIds.length === 1}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          prizeIds: f.prizeIds.filter(
                            (_, index) => index !== i,
                          ),
                        }))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="submit" className="ga-primary" disabled={busy}>
              {busy
                ? "Saqlanmoqda…"
                : form.id
                  ? "O‘zgarishlarni saqlash"
                  : "Draft yaratish"}
            </button>
          </form>
          <aside className="ga-preview">
            <span className="ga-eyebrow">FOYDALANUVCHI KO‘RINISHI</span>
            <div className={cardStyles.root}>
              <article className={cardStyles.event}>
                <GiveawayPrizeStage item={preview} now={now} preview />
                <div className={cardStyles.joinSummary}>
                  <span>
                    {form.mode === "weighted" ? "Minimum" : "Kirish narxi"}
                    <strong>
                      {Number(form.entryPrice)
                        ? `${fmt(form.entryPrice)} Stars`
                        : "Bepul"}
                    </strong>
                  </span>
                </div>
                <p className="ga-hint">
                  {form.description ||
                    "Tavsif tanlov tafsilotlarida ko‘rinadi."}
                </p>
              </article>
            </div>
            <p className="ga-hint">
              Bu preview. Saqlash draft yaratadi; foydalanuvchilar e’lon
              qilingandan keyin ko‘radi.
            </p>
          </aside>
        </div>
      ) : null}
      {view === "detail" ? (
        selected ? (
          <article className="ga-detail">
            <button
              type="button"
              className="ga-back"
              onClick={() => setView("list")}
            >
              <ArrowLeft size={18} /> Ro‘yxatga
            </button>
            <div className="ga-detail-title">
              <span className={"ga-status " + selected.status}>
                {labels[selected.status]}
              </span>
              <h3>{selected.title}</h3>
              <p>{selected.description}</p>
            </div>
            <div className="ga-metadata">
              <span>
                <Clock3 size={17} />
                {when(selected.ends_at)}
              </span>
              <span>
                <Users size={17} />
                {fmt(selected.members)} qatnashchi
              </span>
              <span>
                <Star size={17} />
                {fmt(selected.totalStars)} Stars
              </span>
            </div>
            <div className="ga-actions">
              {["draft", "live"].includes(selected.status) ? (
                <button
                  type="button"
                  disabled={
                    busy ||
                    (selected.status === "live" &&
                      Date.parse(selected.ends_at) <= now)
                  }
                  className="ga-secondary"
                  onClick={() => feature(selected)}
                >
                  <Crown size={16} />
                  {selected.status === "draft"
                    ? selected.featureOnPublish
                      ? "Asosiy rejasini olish"
                      : "E’lon qilingach asosiy qilish"
                    : selected.isFeatured
                      ? "Asosiydan olish"
                      : "Asosiy qilish"}
                </button>
              ) : null}
              {selected.status === "draft" ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    className="ga-secondary"
                    onClick={() => edit(selected)}
                  >
                    Draftni tahrirlash
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="ga-primary"
                    onClick={() => ask("publish", selected)}
                  >
                    E’lon qilish
                  </button>
                </>
              ) : null}
              {selected.status === "live" ? (
                <button
                  type="button"
                  className="ga-primary"
                  disabled={busy || Date.parse(selected.ends_at) > now}
                  onClick={() => ask("draw", selected)}
                >
                  G‘oliblarni aniqlash
                </button>
              ) : null}
              {["draft", "live"].includes(selected.status) ? (
                <button
                  type="button"
                  className="ga-danger"
                  disabled={busy}
                  onClick={() => ask("cancel", selected)}
                >
                  Tanlovni bekor qilish
                </button>
              ) : null}
            </div>
            {selected.status === "draft" ? (
              <p className="ga-hint">
                Draftning asosiy belgisi faol tanlovni almashtirmaydi. E’lon
                qilinayotganda bitta asosiy tanlov serverda tanlanadi.
              </p>
            ) : null}
            <div className="ga-awards">
              {selected.prizes.map((p) => (
                <div key={p.id} className="ga-award">
                  <GiveawayGiftMedia
                    prize={{
                      title: p.giftTitle,
                      imageUrl: p.giftImageUrl,
                      animationUrl: p.giftAnimationUrl,
                    }}
                    className="ga-award-art"
                  />
                  <div>
                    <strong>
                      {p.place}-o‘rin · {p.giftTitle}
                    </strong>
                    <p>
                      {p.winnerId
                        ? `G‘olib: ${p.winnerName || p.winnerUsername || p.winnerId}`
                        : "G‘olib aniqlanmagan"}
                    </p>
                    {p.winnerId ? (
                      <small>
                        {p.deliveryStatus === "delivered"
                          ? "Yetkazilgan deb qayd etilgan"
                          : "Yetkazilishi kutilmoqda"}
                      </small>
                    ) : null}
                    {p.deliveryNote ? (
                      <p className="ga-hint">Qayd: {p.deliveryNote}</p>
                    ) : null}
                  </div>
                  {p.winnerId && p.deliveryStatus === "pending" ? (
                    <div className="ga-deliver">
                      <label>
                        Yetkazish qaydi
                        <input
                          aria-label={`${p.place}-o‘rin yetkazish qaydi`}
                          value={proofs[p.id] || ""}
                          maxLength={500}
                          onChange={(e) =>
                            setProofs((o) => ({ ...o, [p.id]: e.target.value }))
                          }
                          placeholder="Yuborish dalili yoki tranzaksiya ID"
                        />
                      </label>
                      <button
                        type="button"
                        className="ga-secondary"
                        disabled={
                          busy || (proofs[p.id] || "").trim().length < 8
                        }
                        onClick={() => ask("deliver", selected, p)}
                      >
                        Yetkazishni qayd etish
                      </button>
                      <small>
                        Bu amal faqat admin qaydini saqlaydi, Telegram giftini
                        yubormaydi.
                      </small>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {selected.status === "completed" ? (
              <details className="ga-seed">
                <summary>Seed va hash qaydlari</summary>
                <code>{selected.seed_secret}</code>
                <code>{selected.seed_commit}</code>
                <p>
                  Ushbu qaydlarning mavjudligi mustaqil audit kafolati emas.
                </p>
              </details>
            ) : null}
          </article>
        ) : (
          <p className="ga-empty">Tanlov topilmadi. Ro‘yxatni yangilang.</p>
        )
      ) : null}
      {picker !== null ? (
        <GiveawayDialog
          title={`${picker + 1}-o‘rin sovg‘asi`}
          onClose={() => setPicker(null)}
          wide
        >
          <div className="ga-picker">
            <label className="ga-search">
              <Search size={18} />
              <input
                aria-label="Sovg‘a qidirish"
                value={search}
                placeholder="Sovg‘a nomini yozing…"
                onChange={(e) => {
                  setSearch(e.target.value);
                  setLimit(48);
                }}
              />
            </label>
            <p>{candidates.length} ta sovg‘a</p>
            <div className="ga-picker-grid">
              {candidates.slice(0, limit).map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      prizeIds: f.prizeIds.map((id, i) =>
                        i === picker ? g.id : id,
                      ),
                    }));
                    setPicker(null);
                  }}
                >
                  <GiveawayGiftMedia
                    prize={giftFromLibrary(g)}
                    className="ga-picker-art"
                  />
                  <strong>{g.title}</strong>
                </button>
              ))}
            </div>
            {!candidates.length ? (
              <p>Sovg‘a topilmadi. Boshqa nom bilan qidiring.</p>
            ) : null}
            {candidates.length > limit ? (
              <button
                type="button"
                className="ga-secondary"
                onClick={() => setLimit((n) => n + 48)}
              >
                Yana sovg‘alar
              </button>
            ) : null}
          </div>
        </GiveawayDialog>
      ) : null}
      {confirm ? (
        <GiveawayDialog
          title={confirmationTitles[confirm.action]}
          busy={busy}
          onClose={() => setConfirm(null)}
        >
          <div className="ga-confirm">
            <h3>{confirm.item.title}</h3>
            <p>
              {confirm.action === "publish"
                ? "E’lon qilingach, foydalanuvchilar qatnasha oladi. Shartlarni tekshiring."
                : confirm.action === "cancel"
                  ? "Tanlov yopiladi. Qatnashchilarning sarflagan Stars’i serverda qaytariladi."
                  : confirm.action === "draw"
                    ? "Muddat tugagan tanlov uchun g‘oliblar serverda aniqlanadi va saqlanadi."
                    : "Faqat yuborilgan sovrin uchun qayd saqlang. Bu tugma Telegram giftini avtomatik yubormaydi."}
            </p>
            <div className="ga-confirm-summary">
              <span>
                {confirm.item.mode === "weighted"
                  ? "Stars vaznli"
                  : "Teng imkoniyat"}{" "}
                ·{" "}
                {confirm.item.entry_price
                  ? `${fmt(confirm.item.entry_price)} Stars`
                  : "Bepul"}
              </span>
              <span>{when(confirm.item.ends_at)}</span>
              <span>{confirm.item.prizes?.length} ta sovrin</span>
              {confirm.action === "publish" && confirm.item.featureOnPublish ? (
                <strong>E’lon qilingach asosiy tanlov bo‘ladi.</strong>
              ) : null}
              {confirm.note ? <p>Qayd: {confirm.note}</p> : null}
            </div>
            {confirmState === "expired" ? (
              <div className="ga-alert" role="alert">
                Muddat tugagan. Draftni tahrirlab, yangi tugash vaqtini
                kiriting.
                <button
                  type="button"
                  className="ga-secondary"
                  onClick={() => {
                    edit(confirm.item);
                    setConfirm(null);
                  }}
                >
                  Draftni tahrirlash
                </button>
              </div>
            ) : null}
            {error ? (
              <p className="ga-alert" role="alert">
                {error}
              </p>
            ) : null}
            <div className="ga-confirm-actions">
              <button
                type="button"
                className="ga-secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="ga-primary"
                disabled={
                  busy ||
                  (confirm.action === "publish" && confirmState !== "ready")
                }
                onClick={confirmAction}
              >
                {busy
                  ? "Saqlanmoqda…"
                  : confirm.action === "publish"
                    ? "Tasdiqlash va e’lon qilish"
                    : "Tasdiqlash"}
              </button>
            </div>
          </div>
        </GiveawayDialog>
      ) : null}
    </section>
  );
}
