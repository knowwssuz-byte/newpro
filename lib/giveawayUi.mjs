export const formatStars = (value) =>
  new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 2 }).format(
    Number(value) || 0,
  );

export function firstPlaceChance(weight, total) {
  const w = Number(weight),
    t = Number(total);
  return Number.isFinite(w) && Number.isFinite(t) && w > 0 && t > 0
    ? Math.min(100, (w / t) * 100)
    : 0;
}

export function chanceText(value) {
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  return n > 0 && n < 0.01 ? "<0.01%" : `${n.toFixed(2)}%`;
}

export function eventState(item, now) {
  if (item.status === "completed") return "completed";
  if (item.status !== "live") return item.status;
  if (Date.parse(item.endsAt) <= now) return "drawing";
  if (Date.parse(item.startsAt) > now) return "scheduled";
  return "open";
}

export function splitGiveaways(items, now) {
  const active = items.filter((item) =>
    ["open", "scheduled"].includes(eventState(item, now)),
  );
  const main = active.find((item) => item.isFeatured === true) || null;
  return {
    main,
    others: active.filter((item) => item.id !== main?.id),
    results: items.filter((item) =>
      ["completed", "drawing"].includes(eventState(item, now)),
    ),
  };
}

export function timeLeft(value, now) {
  const delta = Date.parse(value) - now;
  if (!Number.isFinite(delta) || delta <= 0) return "Muddat tugadi";
  const seconds = Math.ceil(delta / 1000);
  const d = Math.floor(seconds / 86400),
    h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return d
    ? `${d} kun ${h} soat`
    : h
      ? `${h} soat ${m} daqiqa`
      : `${m}:${String(s).padStart(2, "0")}`;
}

export function stakeError(item, amount, balance, now) {
  if (eventState(item, now) !== "open")
    return "Bu tanlov qatnashish uchun ochiq emas.";
  if (item.mode === "equal" && Number(item.myWeight) > 0)
    return "Siz allaqachon qatnashyapsiz.";
  const n = Number(amount),
    price = Number(item.price);
  if (String(amount).trim() === "" || !Number.isSafeInteger(n))
    return "Butun Stars miqdorini kiriting.";
  if (n < price || (item.mode === "weighted" && n < 1))
    return `Kamida ${formatStars(price)} Stars kiriting.`;
  if (n > 10000) return "Bir martada ko‘pi bilan 10 000 Stars qo‘shish mumkin.";
  if (item.mode === "equal" && n !== price)
    return "Kirish narxi o‘zgardi. Qayta tekshiring.";
  if (item.mode === "weighted" && Number(item.myStars || 0) + n > 100000000)
    return "Tanlovdagi jami Stars limitingizga yetdingiz.";
  if (balance == null || !Number.isFinite(Number(balance)))
    return "Balansni yangilang va qayta urinib ko‘ring.";
  if (n > Number(balance)) return "Balansingizda Stars yetarli emas.";
  return "";
}

export function sameJoinTerms(a, b) {
  return Boolean(
    a &&
      b &&
      a.id === b.id &&
      a.mode === b.mode &&
      Number(a.price) === Number(b.price) &&
      a.endsAt === b.endsAt &&
      a.status === b.status,
  );
}

// Once synced, wall-clock changes cannot move the countdown.
export function serverClock(serverTime, monotonicNow) {
  const epoch = Date.parse(serverTime);
  if (!Number.isFinite(epoch)) return null;
  return (tick) => epoch + Math.max(0, tick - monotonicNow);
}

export function mergeBoard(previous, result, append) {
  const replace =
    !append || result.reset || previous.revision !== result.revision;
  const rows = replace ? result.rows : [...previous.rows, ...result.rows];
  return {
    ...result,
    rows: [...new Map(rows.map((row) => [row.key, row])).values()],
  };
}

export function giftFromLibrary(gift) {
  return {
    title: gift?.title || "Sovg‘ani tanlang",
    imageUrl: gift?.image_url || gift?.png_url || gift?.webp_url || "",
    animationUrl: gift?.animation_url || "",
  };
}
