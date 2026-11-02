"use client";
/* eslint-disable @next/next/no-img-element -- Preserve catalogue media bytes, animated formats and explicit fallback events. */

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import styles from "./GiveawayGiftMedia.module.css";

const cache = new Map();
async function loadAnimation(url) {
  if (!cache.has(url)) {
    if (cache.size >= 40) cache.delete(cache.keys().next().value);
    cache.set(
      url,
      fetch("/api/gift-animation?url=" + encodeURIComponent(url), {
        cache: "force-cache",
      })
        .then(async (response) => {
          const json = await response.json();
          if (!response.ok || !json?.ok || !json.animationData)
            throw Error("Gift animation unavailable");
          return json.animationData;
        })
        .catch((error) => {
          cache.delete(url);
          throw error;
        }),
    );
  }
  return cache.get(url);
}

export default function GiveawayGiftMedia({
  prize,
  animate = false,
  className = "",
}) {
  const root = useRef(null),
    canvas = useRef(null),
    player = useRef(null),
    video = useRef(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const image = prize?.imageUrl || "",
    url = prize?.animationUrl || "";
  const kind = /\.(mp4|webm)(?:[?#]|$)/i.test(url)
    ? "video"
    : /\.(gif|webp|png|jpe?g)(?:[?#]|$)/i.test(url)
      ? "image"
      : url
        ? "lottie"
        : "";
  const playing = animate && visible && foreground && !reduced;
  const playRef = useRef(false);
  useEffect(() => {
    playRef.current = playing;
  }, [playing]);
  const needsLottie = kind === "lottie" && (animate || !image || imageFailed);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setReduced(media.matches);
    const visibility = () =>
      setForeground(document.visibilityState === "visible");
    preference();
    visibility();
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              setVisible(entries[0]?.isIntersecting === true);
            },
            { threshold: 0.1 },
          )
        : null;
    if (observer) observer.observe(root.current);
    else setVisible(true);
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    setReady(false);
    setFailed(false);
    setImageFailed(false);
    setImageReady(false);
  }, [image, url]);
  // Load only on screen. Keep the instance paused off screen, destroy on unmount.
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (visible && foreground) setStarted(true);
  }, [visible, foreground]);
  useEffect(() => {
    if (!started || !needsLottie || !canvas.current) return;
    let cancelled = false,
      instance,
      timeout;
    Promise.all([import("lottie-web"), loadAnimation(url)])
      .then(([module, data]) => {
        if (cancelled || !canvas.current) return;
        instance = module.default.loadAnimation({
          container: canvas.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });
        player.current = instance;
        const fail = () => {
          if (!cancelled) {
            setFailed(true);
            clearTimeout(timeout);
            instance.pause();
          }
        };
        timeout = setTimeout(fail, 10000);
        instance.addEventListener("data_failed", fail);
        instance.addEventListener("DOMLoaded", () => {
          if (cancelled) return;
          clearTimeout(timeout);
          setReady(true);
          if (playRef.current) instance.play();
          else
            instance.goToAndStop(Math.round(instance.totalFrames * 0.22), true);
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      player.current = null;
      instance?.destroy();
    };
  }, [started, needsLottie, url]);
  useEffect(() => {
    const instance = player.current;
    if (instance && ready) {
      if (playing) instance.play();
      else instance.pause();
    }
    if (video.current) {
      if (playing) video.current.play().catch(() => setFailed(true));
      else video.current.pause();
    }
  }, [playing, ready]);
  const showVideo =
    kind === "video" && started && animate && !reduced && !failed;
  const showAnimatedImage = kind === "image" && playing && !failed;
  const showLottie = needsLottie && ready && !failed;
  const staticSource = image && !imageFailed ? image : "";
  const unavailable =
    !staticSource &&
    !showLottie &&
    (!url || failed || (kind !== "lottie" && !playing));
  return (
    <span
      ref={root}
      className={`${styles.frame} ${className}`}
      role="img"
      aria-label={prize?.title || "Sovg‘a"}
      data-playing={playing && ready && !failed ? "true" : "false"}
    >
      {staticSource && !showLottie && !showAnimatedImage ? (
        <img
          src={staticSource}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setImageReady(true)}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {needsLottie ? (
        <span
          ref={canvas}
          className={styles.lottie}
          data-ready={showLottie || undefined}
        />
      ) : null}
      {showVideo ? (
        <video
          ref={video}
          src={url}
          poster={staticSource || undefined}
          muted
          playsInline
          loop
          preload="metadata"
          onLoadedData={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {showAnimatedImage ? (
        <img
          src={url}
          alt=""
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {!imageReady && !ready && !unavailable ? (
        <span className={styles.skeleton} aria-hidden="true" />
      ) : null}
      {unavailable ? (
        <span className={styles.unavailable}>
          <ImageOff size={24} />
          <small>Rasm mavjud emas</small>
        </span>
      ) : null}
    </span>
  );
}
