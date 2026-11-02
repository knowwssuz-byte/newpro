"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LoaderCircle, RefreshCcw, Trophy } from "lucide-react";
import {
  chanceText,
  formatStars as fmt,
  mergeBoard,
} from "@/lib/giveawayUi.mjs";
import styles from "./GiveawayHub.module.css";

const empty = {
  rows: [],
  total: 0,
  nextOffset: null,
  revision: null,
  me: null,
};
function Person({ person }) {
  return (
    <div
      className={styles.oddsRow}
      data-me={person.isMe || undefined}
      data-entry={person.key}
    >
      <span className={styles.oddsRank}>{person.rank}</span>
      <span className={styles.oddsPerson}>
        <strong>
          {person.name}
          {person.isMe ? <em>Siz</em> : null}
        </strong>
        <small>{fmt(person.stars)} Stars</small>
      </span>
      <strong className={styles.oddsPercent}>
        {chanceText(person.chance)}
      </strong>
      <span className={styles.oddsBar}>
        <i style={{ width: `${person.chance}%` }} />
      </span>
    </div>
  );
}
export default function GiveawayOddsBoard({ item, apiPost }) {
  const [open, setOpen] = useState(true);
  const [board, setBoard] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const generation = useRef(0),
    busy = useRef(false);
  const request = useCallback(
    async (offset = 0, revision = null) => {
      if (busy.current) return;
      busy.current = true;
      const token = ++generation.current;
      setLoading(true);
      setError("");
      try {
        const result = await apiPost(
          "/api/giveaway",
          { action: "leaderboard", giveawayId: item.id, offset, revision },
          { timeoutMs: 15000 },
        );
        if (generation.current !== token) return;
        setBoard((previous) => mergeBoard(previous, result, offset > 0));
        setNotice(
          result.reset
            ? "Ishtirokchilar o‘zgardi. Izchil ro‘yxat uchun 1-sahifadan yangilandi."
            : "",
        );
      } catch (e) {
        if (generation.current === token)
          setError(e.message || "Ishtirokchilar yuklanmadi.");
      } finally {
        if (generation.current === token) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [apiPost, item.id],
  );
  const cancelRequest = useCallback(() => {
    generation.current++;
    busy.current = false;
  }, []);
  useEffect(() => {
    if (!open) return;
    void request();
    return cancelRequest;
  }, [open, request, cancelRequest]);
  // Feed polls never replace an in-flight or expanded page. A refresh button
  // lets the reader choose; the server guards every next page with its revision.
  const changed =
    board.revision &&
    board.revision !== `${item.participants || 0}:${item.totalWeight || 0}`;
  return (
    <section className={styles.odds}>
      <button
        type="button"
        className={styles.oddsHeading}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Trophy size={19} />
        <span>
          <strong>Ishtirokchilar</strong>
          <small>1-o‘rin uchun joriy foiz</small>
        </span>
        <ChevronDown size={18} className={open ? styles.chevronOpen : ""} />
      </button>
      {open ? (
        <div className={styles.oddsBody}>
          <div className={styles.boardTools}>
            <small>{fmt(board.total)} qatnashchi</small>
            <button
              type="button"
              disabled={loading}
              onClick={() => void request()}
            >
              <RefreshCcw size={14} /> Yangilash
            </button>
          </div>
          {changed ? (
            <p className={styles.inlineNotice}>
              Yangi Stars yoki qatnashchilar bor. Ro‘yxatni yangilashingiz
              mumkin.
            </p>
          ) : null}
          {notice ? (
            <p className={styles.inlineNotice} role="status">
              {notice}
            </p>
          ) : null}
          {board.me && !board.rows.some((row) => row.isMe) ? (
            <div className={styles.myStanding}>
              <small>Sizning natijangiz</small>
              <Person person={board.me} />
            </div>
          ) : null}
          <div className={styles.oddsRows} data-giveaway-rows>
            {board.rows.map((person) => (
              <Person key={person.key} person={person} />
            ))}
          </div>
          {!board.rows.length && !loading && !error ? (
            <p className={styles.muted}>Hozircha ishtirokchilar yo‘q.</p>
          ) : null}
          {error ? (
            <div className={styles.error} role="alert">
              {error}
              <button
                type="button"
                disabled={loading}
                onClick={() => void request()}
              >
                Qayta urinish
              </button>
            </div>
          ) : null}
          {loading ? (
            <p className={styles.loading} role="status">
              <LoaderCircle size={17} className={styles.spinner} /> Yuklanmoqda…
            </p>
          ) : null}
          {board.nextOffset != null ? (
            <button
              type="button"
              className={styles.secondary}
              disabled={loading}
              onClick={() => void request(board.nextOffset, board.revision)}
            >
              Yana qatnashchilarni ko‘rish (
              {fmt(Math.max(0, board.total - board.rows.length))})
            </button>
          ) : null}
          <p className={styles.fine}>
            Foiz = foydalanuvchi vazni / jami vazn × 100. Bu birinchi o‘rin
            ulushi; bir nechta sovrinning umumiy ehtimoli emas.
          </p>
        </div>
      ) : null}
    </section>
  );
}
