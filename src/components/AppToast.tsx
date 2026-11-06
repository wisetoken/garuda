import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, CircleAlert, Info, X } from "lucide-react";
import "./app-toast.css";

type ToastOptions = {
  id?: string;
  tone?: "info" | "error";
  action?: { label: string; run: () => void };
  link?: { label: string; href: string };
};
type Toast = ToastOptions & { id: string; message: string; sequence: number };
type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
  dismissToast: (id: string) => void;
};
const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const remaining = useRef(6000);
  useEffect(() => {
    if (paused || hovered) return;
    const started = Date.now();
    const timer = window.setTimeout(dismiss, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [dismiss, paused, hovered]);
  return <div className="app-toast" data-tone={toast.tone ?? "info"}
    role={toast.tone === "error" ? "alert" : "status"}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    {toast.tone === "error" ? <CircleAlert size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}
    <div className="app-toast-content">
      {toast.link ? <a className="app-toast-link" href={toast.link.href} target="_blank" rel="noopener noreferrer"
        aria-label={`${toast.message}. ${toast.link.label} (opens in a new tab)`}>
        {toast.message} <ArrowUpRight size={16} aria-hidden="true" />
      </a> : <span>{toast.message}</span>}
      {toast.action && <button type="button" className="app-toast-action" onClick={() => { dismiss(); toast.action?.run(); }}>{toast.action.label}</button>}
    </div>
    <button type="button" className="app-toast-close" aria-label="Dismiss notification" onClick={dismiss}><X size={16} aria-hidden="true" /></button>
  </div>;
}

function ToastHost({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const [target, setTarget] = useState<Element>(document.body);
  useEffect(() => {
    // Native modal dialogs sit above body portals, regardless of z-index.
    const update = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      setTarget(dialogs[dialogs.length - 1] ?? document.querySelector(".app-shell") ?? document.body);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  return createPortal(<div className="app-toast-stack" aria-label="Notifications">
    {toasts.map(toast => <ToastItem key={toast.sequence} toast={toast} dismiss={() => dismiss(toast.id)} />)}
  </div>, target);
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sequence = useRef(0);
  const recent = useRef(new Map<string, number>());
  const dismissToast = useCallback((id: string) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    if (!message) return;
    const id = options.id ?? message;
    const now = Date.now();
    // Polling queries and multiple observers must not flood the notification area.
    for (const [key, time] of recent.current) if (now - time >= 60_000) recent.current.delete(key);
    if (recent.current.has(id)) return;
    recent.current.set(id, now);
    const action = options.action ? { label: options.action.label, run: () => {
      recent.current.delete(id);
      options.action?.run();
    } } : undefined;
    const toast = { ...options, action, id, message, sequence: ++sequence.current };
    setToasts(current => [...current.filter(item => item.id !== id).slice(-2), toast]);
  }, []);
  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);
  return <ToastContext.Provider value={value}>{children}<ToastHost toasts={toasts} dismiss={dismissToast} /></ToastContext.Provider>;
}

export function useAppToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("AppToastProvider is missing.");
  return context;
}

export function useErrorToast(id: string, message: string | undefined | false, retry?: () => void) {
  const { showToast, dismissToast } = useAppToast();
  const retryRef = useRef(retry);
  useEffect(() => { retryRef.current = retry; });
  const canRetry = !!retry;
  useEffect(() => {
    if (!message) { dismissToast(id); return; }
    showToast(message, { id, tone: "error", action: canRetry ? { label: "Retry", run: () => retryRef.current?.() } : undefined });
  }, [id, message, canRetry, showToast, dismissToast]);
}
