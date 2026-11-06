import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import type confetti from "canvas-confetti";
import "./order-success.css";

export function SuccessFrame({ receiptKey, title, description, children, next, viewLabel, onClose, onView }: {
  receiptKey: string; title: string; description: string; children: ReactNode;
  next: string; viewLabel: string; onClose: () => void; onView: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    let disposed = false, burst: confetti.CreateTypes | undefined;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void import("canvas-confetti").then(({ default: confetti }) => {
        if (disposed || !canvas.current) return;
        burst = confetti.create(canvas.current, { resize: true });
        const base = { origin: { x: 0.5, y: 0.7 }, colors: ["#00b0aa", "#4ade80", "#7b5ea7", "#ffffff"], disableForReducedMotion: true };
        const fire = (ratio: number, opts: confetti.Options) => burst!({ ...base, ...opts, particleCount: Math.floor(200 * ratio) });
        fire(.25, { spread: 26, startVelocity: 55 }); fire(.2, { spread: 60 });
        fire(.35, { spread: 100, decay: .91, scalar: .8 });
        fire(.1, { spread: 120, startVelocity: 25, decay: .92, scalar: 1.2 }); fire(.1, { spread: 120, startVelocity: 45 });
      }).catch(() => { /* The receipt remains usable without animation. */ });
    }
    return () => { disposed = true; burst?.reset(); };
  }, [receiptKey]);
  return <>
    <canvas ref={canvas} className="order-success-confetti" aria-hidden="true" />
    <section className="order-success">
      <div className="order-success-icon"><CheckCircle2 size={36} aria-hidden="true" /></div>
      <h2 id="sale-title" ref={heading} tabIndex={-1}>{title}</h2>
      <p className="order-success-description">{description}</p>
      {children}
      <p className="order-success-next">{next}</p>
      <div className="order-success-actions">
        <button type="button" className="stake-primary" onClick={onView}>{viewLabel}</button>
        <button type="button" className="market-secondary" onClick={onClose}>Done</button>
      </div>
    </section>
  </>;
}
