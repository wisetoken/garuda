import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./duration-picker.css";

const durations = [1, 3, 7, 30];
const durationLabel = (days: number) => `${days} ${days === 1 ? "day" : "days"}`;
type DurationPickerProps = {
  id: string;
  label: string;
  value: number;
  onChange: (days: number) => void;
  disabled?: boolean;
};

export function DurationPicker({ id, label, value, onChange, disabled = false }: DurationPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const [upward, setUpward] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = `${id}-options`;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function expand(next = value) {
    if (disabled) return;
    const bounds = trigger.current?.getBoundingClientRect();
    const dialog = trigger.current?.closest("dialog")?.getBoundingClientRect();
    if (bounds) {
      const below = Math.min(window.innerHeight, dialog?.bottom ?? window.innerHeight) - bounds.bottom;
      const above = bounds.top - Math.max(0, dialog?.top ?? 0);
      setUpward(below < 220 && above > below);
    }
    setActive(next);
    setOpen(true);
  }
  function select(days: number) {
    onChange(days);
    setOpen(false);
    trigger.current?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const index = durations.indexOf(active);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) expand();
      else setActive(durations[(index + (event.key === "ArrowDown" ? 1 : -1) + durations.length) % durations.length]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      expand(event.key === "Home" ? durations[0] : durations[durations.length - 1]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) select(active); else expand();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return <>
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <div className="sale-duration" ref={root} data-upward={upward}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button id={id} ref={trigger} type="button" className="sale-duration-trigger"
        role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        disabled={disabled} onKeyDown={onKeyDown}
        onClick={() => open ? setOpen(false) : expand()}>
        <span>{durationLabel(value)}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <div id={listId} className="sale-duration-menu" role="listbox" aria-labelledby={`${id}-label`}>
        {durations.map(days => <div id={`${id}-option-${days}`} key={days}
          role="option" aria-selected={days === value} data-active={days === active}
          onPointerMove={() => setActive(days)} onMouseDown={event => event.preventDefault()}
          onClick={() => select(days)}>
          <span>{durationLabel(days)}</span>{days === value && <Check size={17} aria-hidden="true" />}
        </div>)}
      </div>}
    </div>
  </>;
}
