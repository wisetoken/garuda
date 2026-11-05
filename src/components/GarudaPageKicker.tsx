import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/** Keeps introductory copy available without adding a paragraph below the title. */
export function GarudaPageKicker({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  return <div
    className="ba-kicker garuda-page-kicker"
    ref={root}
    onMouseLeave={() => { if (!root.current?.contains(document.activeElement)) setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
  >
    {label}
    <button
      type="button"
      className="garuda-page-info"
      aria-label={`About ${label.toLowerCase()}`}
      aria-describedby={tooltipId}
      onMouseEnter={() => setOpen(true)}
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
    ><Info size={16} aria-hidden="true" /></button>
    <div id={tooltipId} role="tooltip" className="garuda-page-tooltip" hidden={!open}>{description}</div>
  </div>;
}
