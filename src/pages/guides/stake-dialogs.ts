/** Open, navigate, and dismiss the ecosystem detail dialogs. */
export function initializeStakeDialogs(root: ParentNode) {
  const triggers = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-stake-open]'));
  const dialogs = triggers.map(trigger => root.querySelector<HTMLDialogElement>(`#${trigger.getAttribute('aria-controls')}`)!);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let active: HTMLDialogElement | null = null;
  let opener: HTMLButtonElement | null = null;
  let previousOverflow = '';

  function show(index: number) {
    const next = dialogs[(index + dialogs.length) % dialogs.length];
    if (!next || active === next) return;
    const previous = active;
    active = next;
    previous?.close();
    triggers.forEach((trigger, i) => trigger.setAttribute('aria-expanded', String(dialogs[i] === next)));
    next.showModal();
    next.scrollTop = 0;
    next.querySelector<HTMLButtonElement>('.stake-close')?.focus({ preventScroll: true });
  }

  function restore() {
    active = null;
    document.documentElement.style.overflow = previousOverflow;
    triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
    opener?.focus({ preventScroll: true });
  }

  triggers.forEach((trigger, index) => trigger.addEventListener('click', () => {
    if (!active) {
      opener = trigger;
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    show(index);
  }, options));
  dialogs.forEach((dialog, index) => {
    dialog.querySelector('.stake-close')?.addEventListener('click', () => dialog.close(), options);
    dialog.querySelectorAll<HTMLButtonElement>('[data-stake-direction]').forEach(button => {
      button.addEventListener('click', () => show(index + Number(button.dataset.stakeDirection)), options);
    });
    dialog.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }, options);
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    }, options);
    dialog.addEventListener('close', () => {
      if (active === dialog && !dialog.open) restore();
    }, options);
  });
  return () => {
    listeners.abort();
    if (active) {
      active.close();
      restore();
    }
  };
}
