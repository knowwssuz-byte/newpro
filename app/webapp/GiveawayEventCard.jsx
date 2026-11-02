"use client";
import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Crown,
  Gift,
  LoaderCircle,
  Star,
  Ticket,
  Users,
} from "lucide-react";
import {
  chanceText,
  eventState,
  firstPlaceChance,
  formatStars as fmt,
  stakeError,
  timeLeft,
} from "@/lib/giveawayUi.mjs";
import GiveawayGiftMedia from "./GiveawayGiftMedia";
import GiveawayOddsBoard from "./GiveawayOddsBoard";
import styles from "./GiveawayHub.module.css";

export function GiveawayPrizeStage({ item, now, preview = false }) {
  const main = item.prizes?.[0];
  const state = eventState(item, now);
  return (
    <>
      <div className={styles.eventTop}>
        <h2>{item.title || "Giveaway nomi"}</h2>
        <span className={styles.mode}>
          <Star size={14} />
          {item.mode === "weighted" ? "Stars vaznli" : "Teng imkoniyat"}
        </span>
      </div>
      <div className={styles.heroStage} data-preview={preview || undefined}>
        <div className={styles.heroArtwork}>
          <span className={styles.artHalo} />
          <GiveawayGiftMedia
            key={main?.animationUrl || main?.imageUrl || "empty"}
            prize={main}
            animate={!preview}
            className={styles.heroPrize}
          />
        </div>
        <div className={styles.heroCaption}>
          <span>
            <Crown size={14} /> 1-o‘rin
          </span>
          <strong>{main?.title || "Sovg‘ani tanlang"}</strong>
        </div>
      </div>
      <div className={styles.facts}>
        <div>
          <Clock3 size={17} />
          <strong>
            {preview
              ? timeLeft(item.endsAt, now)
              : state === "completed"
                ? "Yakunlangan"
                : state === "drawing"
                  ? "Natija kutilmoqda"
                  : timeLeft(item.endsAt, now)}
          </strong>
          <small>Qolgan vaqt</small>
        </div>
        <div>
          <Users size={17} />
          <strong>{fmt(item.participants)}</strong>
          <small>Qatnashchilar</small>
        </div>
        <div>
          <Gift size={17} />
          <strong>{item.prizes?.length || 0}</strong>
          <small>Sovrinlar</small>
        </div>
      </div>
    </>
  );
}

export default function GiveawayEventCard({
  item,
  now,
  balance,
  joining,
  blocked,
  requestJoin,
  apiPost,
}) {
  const [stars, setStars] = useState(String(item.price || 0));
  const weighted = item.mode === "weighted",
    state = eventState(item, now);
  const participated = Number(item.myWeight) > 0;
  const amount = weighted ? stars : Number(item.price || 0);
  const error = stakeError(item, amount, balance, now);
  const chance = firstPlaceChance(item.myWeight, item.totalWeight);
  const max = Math.max(
    0,
    Math.min(
      10000,
      Math.floor(balance || 0),
      100000000 - Number(item.myStars || 0),
    ),
  );
  const quick = [
    ...new Set([
      Number(item.price),
      Number(item.price) * 5,
      Number(item.price) * 10,
    ]),
  ].filter((n) => n > 0 && n <= max);
  return (
    <article
      className={styles.event}
      data-featured={item.isFeatured || undefined}
    >
      <GiveawayPrizeStage item={item} now={now} />
      <section className={styles.prizeSection} aria-label="Sovrinli o‘rinlar">
        <div className={styles.sectionHeading}>
          <h3>Sovrinli o‘rinlar</h3>
          {item.prizes?.length > 1 ? (
            <small>
              Surib ko‘ring <ArrowRight size={14} />
            </small>
          ) : null}
        </div>
        <div className={styles.prizeRail}>
          {(item.prizes || []).map((prize) => (
            <div
              className={styles.prizeCard}
              key={prize.id}
              data-winner={prize.myWin || undefined}
            >
              <span className={styles.prizeBadge}>
                {prize.place === 1 ? <Crown size={14} /> : null}
                {prize.place}-o‘rin
              </span>
              <GiveawayGiftMedia prize={prize} className={styles.prizePhoto} />
              <strong>{prize.title}</strong>
              {state === "completed" ? (
                <>
                  <small>{prize.winner || "G‘olib aniqlanmagan"}</small>
                  {prize.myWin ? (
                    <b className={styles.win}>Siz yutdingiz!</b>
                  ) : null}
                  {prize.winner ? (
                    <small className={styles.delivery}>
                      {prize.deliveryStatus === "delivered"
                        ? "Yetkazilgan deb qayd etilgan"
                        : "Yetkazilishi kutilmoqda"}
                    </small>
                  ) : null}
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>
      {weighted ? (
        <div className={styles.chanceStrip}>
          <span>
            Sizning 1-o‘rin ulushingiz<strong>{chanceText(chance)}</strong>
          </span>
          <div className={styles.chanceTrack}>
            <i style={{ width: `${chance}%` }} />
          </div>
          <small>
            {fmt(item.myStars)} Stars qo‘shgansiz · jami vazn{" "}
            {fmt(item.totalWeight)}
          </small>
        </div>
      ) : null}
      {participated ? (
        <div className={styles.joined} role="status">
          <CheckCircle2 size={18} /> Qatnashyapsiz
          {weighted ? ` · ${fmt(item.myStars)} Stars` : ""}
        </div>
      ) : null}
      {state === "open" ? (
        <section className={styles.joinBox} aria-label="Qatnashish">
          <div className={styles.joinSummary}>
            <span>
              {weighted ? "Minimum" : "Kirish narxi"}
              <strong>
                {Number(item.price) ? `${fmt(item.price)} Stars` : "Bepul"}
              </strong>
            </span>
            <span>
              Balansingiz
              <strong>
                {balance == null ? "Yangilanmoqda…" : `${fmt(balance)} Stars`}
              </strong>
            </span>
          </div>
          {weighted ? (
            <>
              <label className={styles.stakeLabel} htmlFor={`stake-${item.id}`}>
                Qo‘shiladigan Stars
              </label>
              <div className={styles.stakeInput}>
                <Star size={18} />
                <input
                  id={`stake-${item.id}`}
                  type="number"
                  min={item.price}
                  max={max}
                  step="1"
                  inputMode="numeric"
                  value={stars}
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? `stake-error-${item.id}` : undefined
                  }
                  onChange={(e) => setStars(e.target.value)}
                  disabled={joining}
                />
                <span>Stars</span>
              </div>
              {quick.length ? (
                <div className={styles.quickAmounts}>
                  {quick.map((n) => (
                    <button
                      type="button"
                      disabled={joining}
                      key={n}
                      aria-pressed={Number(stars) === n}
                      onClick={() => setStars(String(n))}
                    >
                      {fmt(n)}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {error && !(participated && !weighted) ? (
            <p className={styles.fieldError} id={`stake-error-${item.id}`}>
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            disabled={joining || blocked || Boolean(error)}
            onClick={() => requestJoin(item, Number(amount))}
          >
            {joining ? (
              <LoaderCircle size={19} className={styles.spinner} />
            ) : participated && !weighted ? (
              <CheckCircle2 size={19} />
            ) : (
              <Ticket size={19} />
            )}
            {joining
              ? "Tasdiqlanmoqda…"
              : participated
                ? weighted
                  ? "Yana Stars qo‘shish"
                  : "Qatnashyapsiz"
                : "Qatnashish"}
            <ArrowRight size={18} />
          </button>
        </section>
      ) : state === "drawing" ? (
        <div className={styles.waiting} role="status">
          <Clock3 size={20} />
          <div>
            <strong>Qatnashish yakunlandi</strong>
            <p>
              G‘oliblar aniqlanishi kutilmoqda. Natijalar avtomatik yangilanadi.
            </p>
          </div>
        </div>
      ) : state === "scheduled" ? (
        <p className={styles.waiting}>Tanlov hali boshlanmagan.</p>
      ) : null}
      {weighted ? <GiveawayOddsBoard item={item} apiPost={apiPost} /> : null}
      <details className={styles.details}>
        <summary>Tanlov tafsilotlari</summary>
        {item.description ? <p>{item.description}</p> : null}
        <p>
          {weighted
            ? "Stars miqdori vaznni belgilaydi. Har bir g‘olib keyingi o‘rinlar tanlovidan chiqariladi."
            : "Har bir qatnashchi bir marta qo‘shiladi va teng vaznga ega."}
        </p>
        <p>Tugash: {new Date(item.endsAt).toLocaleString("uz-UZ")}</p>
        {item.seedCommit ? (
          <>
            <small>Seed hash</small>
            <code>{item.seedCommit}</code>
          </>
        ) : null}
        {item.seedReveal ? (
          <>
            <small>Ochiqlangan seed</small>
            <code>{item.seedReveal}</code>
          </>
        ) : null}
        <p className={styles.fine}>
          Seed va hash tanlov qaydlari. Ularning ko‘rsatilishi algoritm to‘liq
          mustaqil tekshirilganini anglatmaydi.
        </p>
      </details>
    </article>
  );
}
