"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./GiveawayDialog.module.css";

// Native <dialog> supplies an inert background and keyboard focus containment.
// It is an in-app surface, never a browser confirm/alert/prompt.
export default function GiveawayDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      const target =
        previousFocus?.isConnected && previousFocus.getClientRects().length
          ? previousFocus
          : document.querySelector("[data-giveaway-focus-return]");
      target?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={styles.dialog}
      data-wide={wide || undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = [
          ...ref.current.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((node) => node.getClientRects().length > 0);
        if (!nodes.length) {
          event.preventDefault();
          ref.current.focus();
          return;
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !ref.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !ref.current.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) {
          const box = ref.current.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          autoFocus
          disabled={busy}
          onClick={onClose}
          aria-label="Yopish"
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>,
    document.body,
  );
}
