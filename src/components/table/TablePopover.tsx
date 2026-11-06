import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./table-controls.css";

export function TablePopover({ label, trigger, children, end = false, active = false, variant = "filter" }: {
  label: string; trigger: ReactNode; children: ReactNode;
  end?: boolean; active?: boolean; variant?: "filter" | "columns";
}) {
  const [open, setOpen] = useState(false), id = useId();
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.bottom <= 0 || rect.top >= innerHeight) { setOpen(false); return; }
      const width = Math.min(variant === "columns" ? 280 : 260, innerWidth - 16);
      const below = innerHeight - rect.bottom - 16, above = rect.top - 16;
      const flip = below < 240 && above > below;
      setPosition({ width, left: Math.max(8, Math.min(end ? rect.right - width : rect.left, innerWidth - width - 8)),
        ...(flip ? { bottom: innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
        maxHeight: Math.max(100, Math.min(variant === "columns" ? 480 : 680, flip ? above : below)) });
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) update(); };
    update();
    const focusFrame = requestAnimationFrame(() => menu.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }));
    window.addEventListener("resize", update);
    window.addEventListener("scroll", scroll, true);
    return () => { cancelAnimationFrame(focusFrame); window.removeEventListener("resize", update); window.removeEventListener("scroll", scroll, true); };
  }, [open, end, variant]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { setOpen(false); button.current?.focus({ preventScroll: true }); }
    };
    const focus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); document.removeEventListener("focusin", focus); };
  }, [open]);
  return <div className="market-popover-anchor" ref={root}>
    <button ref={button} type="button" className={end ? "market-settings-button" : "market-filter-button"}
      aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      data-active={active} onClick={() => setOpen(!open)}>{trigger}</button>
    {open && createPortal(<div id={id} ref={menu} className={`table-popover table-popover--${variant}`}
      style={position} role="dialog" aria-label={label}>
      {variant === "filter" && <div className="table-popover-heading"><strong>Filter</strong>
        <button type="button" aria-label="Close filters" onClick={() => { setOpen(false); button.current?.focus(); }}><X size={14} /></button>
      </div>}
      {children}
    </div>, root.current?.closest(".app-shell") ?? document.body)}
  </div>;
}
