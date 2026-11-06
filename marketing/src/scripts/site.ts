/**
 * Every interaction on the site, in one small module (no framework). Each part looks for its own
 * markup and does nothing when the page does not have it.
 *
 * - header: compact blurred bar after 8 px of scroll
 * - preloader (home, first visit of a session) and the page transition (orange tile)
 * - reveals: tiles rise, images open, titles rise line by line, text clears word by word, numbers count
 * - menu: the full-screen <dialog>, animated open and close, preview images
 * - hero slider: autoplay with a progress line, wipe on desktop, swipe on phones
 * - statement band fallback where CSS scroll timelines are missing
 * - filters (work, journal), pricing toggle, FAQ height, newsletter demo, copy link
 * - desktop extras (cursor pill, magnetic buttons) load only on a mouse or trackpad and
 *   never for visitors who prefer reduced motion: scripts/desktop.ts
 */
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 767px)');
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- ready: after the preloader or the page transition, the page entrance runs ---------- */
let isReady = !root.classList.contains('pre') && !root.classList.contains('pt-in');
const readyFns: (() => void)[] = [];
const ready = (fn: () => void) => (isReady ? fn() : readyFns.push(fn));
const setReady = () => {
  if (isReady) return;
  isReady = true;
  readyFns.splice(0).forEach((fn) => fn());
  document.dispatchEvent(new Event('bd:ready'));
};

/* ---------- header scroll state ---------- */
const header = $('[data-header]');
if (header) {
  let queued = false;
  const update = () => {
    header.classList.toggle('is-scrolled', scrollY > 8);
    queued = false;
  };
  addEventListener('scroll', () => !queued && (queued = true) && requestAnimationFrame(update), { passive: true });
  update();
}

/* ---------- preloader (home, first visit of a session) ---------- */
// The pill spins one turn while the counter runs 00 to 100, then a hole shaped like the pill grows
// from the centre and shows the page through it. A click or a key skips it; never longer than 2.2 s.
const pre = $('[data-preloader]');
if (pre && root.classList.contains('pre')) {
  const count = $('[data-pre-count]', pre);
  const pill = $<SVGRectElement>('.pre__pill', pre);
  const hole = $<SVGRectElement>('.pre__hole', pre);
  const logo = $<SVGGElement>('.pre__logo', pre);
  let finished = false;
  const anims: Animation[] = [];
  const finish = () => {
    if (finished) return;
    finished = true;
    anims.forEach((a) => a.cancel());
    root.classList.remove('pre');
    pre.remove();
    setReady();
  };
  const t0 = performance.now();
  const tick = (t: number) => {
    if (finished || !count) return;
    const p = clamp((t - t0) / 1100);
    count.textContent = String(Math.round(100 * (1 - Math.pow(1 - p, 2)))).padStart(2, '0');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (pill) anims.push(pill.animate([{ transform: 'rotate(35deg)' }, { transform: 'rotate(395deg)' }], { duration: 1100, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }));
  // The hole has to cover the screen across the pill's narrow side (14.4 units wide).
  const big = (Math.hypot(innerWidth, innerHeight) / 14.4) * 1.15;
  if (hole)
    anims.push(
      hole.animate([{ transform: 'rotate(35deg) scale(1)' }, { transform: `rotate(35deg) scale(${big.toFixed(1)})` }], {
        duration: 900,
        delay: 1150,
        easing: 'cubic-bezier(.7,0,.2,1)',
        fill: 'forwards',
      }),
    );
  if (logo) anims.push(logo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 1500, fill: 'forwards' }));
  // The hero entrance starts while the hole opens.
  setTimeout(setReady, 1350);
  const timer = setTimeout(finish, 2100);
  const skip = () => {
    clearTimeout(timer);
    finish();
  };
  addEventListener('pointerdown', skip, { once: true });
  addEventListener('keydown', skip, { once: true });
} else root.classList.remove('pre');

/* ---------- page transition ---------- */
// Arriving covered (set by the inline script in Base.astro): let the tile leave upward.
if (root.classList.contains('pt-in')) {
  const leave = () => {
    root.classList.remove('pt-in');
    root.classList.add('pt-out');
    setTimeout(setReady, 200);
    setTimeout(() => root.classList.remove('pt-out'), 650);
  };
  // Wait for the font (max 300 ms) so the page does not reflow under the leaving tile.
  Promise.race([document.fonts?.ready, wait(300)]).then(() => requestAnimationFrame(leave));
}
if (!calm) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest?.<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    // Same page with a hash: a jump, not a navigation.
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    // Files (feeds, text files) open as they are.
    if (/\.(xml|txt|pdf|zip|jpg|png|webp|avif|svg)$/i.test(url.pathname)) return;
    e.preventDefault();
    try {
      sessionStorage.setItem('bd-pt', '1');
    } catch {
      // storage blocked: the next page simply starts uncovered
    }
    root.classList.remove('pt-out');
    root.classList.add('pt-on');
    setTimeout(() => location.assign(url.href), 560);
  });
}
// Back and forward restore pages from the cache as they were: never covered.
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  root.classList.remove('pt-on', 'pt-in', 'pt-out', 'pre');
  try {
    sessionStorage.removeItem('bd-pt');
  } catch {
    // fine
  }
});

/* ---------- reveals ---------- */
// Lines: split a title or lead into masked lines at its current width, let them rise, then put the
// original markup back (so a later resize simply rewraps the text).
const splitLines = (el: HTMLElement) => {
  const html = el.innerHTML;
  // Titles with markup inside rise as one line.
  if (el.children.length) {
    el.innerHTML = `<span class="ln"><span class="ln__i">${html}</span></span>`;
    return { html, n: 1 };
  }
  const words = (el.textContent ?? '').trim().split(/ +/);
  el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(' ');
  const lines: string[][] = [];
  let top = -1;
  for (const w of $$('.w', el)) {
    if (Math.abs(w.offsetTop - top) > 2) {
      lines.push([]);
      top = w.offsetTop;
    }
    lines[lines.length - 1].push(w.textContent ?? '');
  }
  el.innerHTML = lines.map((l, i) => `<span class="ln"><span class="ln__i" style="--i:${i}">${l.join(' ')}</span></span>`).join('');
  return { html, n: lines.length };
};
const splitWords = (el: HTMLElement) => {
  if (el.children.length) return;
  const words = (el.textContent ?? '').trim().split(/ +/);
  el.innerHTML = words.map((w, i) => `<span class="wd" style="--i:${i}">${w}</span>`).join(' ');
};
const countUp = (el: HTMLElement) => {
  const to = Number(el.dataset.count);
  const dec = Number(el.dataset.dec ?? 0);
  const fmt = (v: number) => v.toFixed(dec);
  if (calm || !Number.isFinite(to)) return void (el.textContent = fmt(to));
  const t0 = performance.now();
  const step = (t: number) => {
    const p = clamp((t - t0) / 1400);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
const reveal = (el: HTMLElement) => {
  if (el.dataset.count !== undefined) return countUp(el);
  if (el.hasAttribute('data-lines') && !calm) {
    const { html, n } = splitLines(el);
    el.classList.add('is-split');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    setTimeout(() => {
      el.innerHTML = html;
      el.classList.remove('is-split');
      el.classList.add('is-done');
    }, 1000 + n * 80);
    return;
  }
  if (el.hasAttribute('data-words') && !calm) {
    splitWords(el);
    el.classList.add('is-split');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    return;
  }
  el.classList.add('is-in');
  if (el.hasAttribute('data-lines') || el.hasAttribute('data-words')) el.classList.add('is-done');
};
const STAGGER = '[data-rise], [data-img], [data-fade]';
const revealed = $$('[data-rise], [data-img], [data-fade], [data-in], [data-letters], [data-lines], [data-words], [data-count]');
// Counters below the screen start from 0.
if (!calm)
  for (const el of $$('[data-count]')) if (el.getBoundingClientRect().top > innerHeight) el.textContent = (0).toFixed(Number(el.dataset.dec ?? 0));
ready(() => {
  if (!('IntersectionObserver' in window)) return revealed.forEach(reveal);
  const io = new IntersectionObserver(
    (entries) => {
      // In view, or already scrolled past (a jump link, a restored scroll position).
      const hits = entries.filter((e) => e.isIntersecting || e.boundingClientRect.top < 0).map((e) => e.target as HTMLElement);
      // Tiles that arrive together rise one after another, left to right, top to bottom (80 ms);
      // an image inside a rising card keeps the card's delay.
      const row = hits.filter((el) => el.matches(STAGGER) && !el.style.getPropertyValue('--d') && !el.parentElement?.closest('[data-rise]'));
      const pos = new Map(row.map((el) => [el, el.getBoundingClientRect()]));
      row
        .sort((a, b) => pos.get(a)!.top - pos.get(b)!.top || pos.get(a)!.left - pos.get(b)!.left)
        .forEach((el, i) => el.style.setProperty('--d', `${Math.min(i, 6) * 80}ms`));
      for (const el of hits) {
        const card = el.hasAttribute('data-img') ? el.parentElement?.closest<HTMLElement>('[data-rise]') : null;
        if (card) el.style.setProperty('--d', card.style.getPropertyValue('--d') || '0ms');
        reveal(el);
        io.unobserve(el);
      }
    },
    { threshold: 0.1, rootMargin: '0px 0px -5% 0px' },
  );
  revealed.forEach((el) => io.observe(el));
});

/* ---------- menu ---------- */
const menu = $<HTMLDialogElement>('[data-menu]');
if (menu) {
  const burger = $('[data-menu-open]');
  const cap = $('[data-menu-cap]', menu);
  const imgs = $$('[data-prev-img]', menu);
  const caseIndex = String(imgs.length - 1);
  let closing = 0;
  const show = (i: string) => {
    const on = imgs.find((im) => im.classList.contains('is-on'));
    if (on?.dataset.prevImg === i) return;
    imgs.forEach((im) => im.classList.remove('was-on'));
    on?.classList.replace('is-on', 'was-on');
    imgs.find((im) => im.dataset.prevImg === i)?.classList.add('is-on');
    cap?.classList.toggle('is-off', i !== caseIndex);
  };
  const open = () => {
    if (menu.open) return;
    clearTimeout(closing);
    menu.classList.remove('is-open');
    show(caseIndex);
    menu.showModal();
    burger?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    document.dispatchEvent(new CustomEvent('bd:menu', { detail: true }));
  };
  const close = (instant = false) => {
    if (!menu.open) return;
    menu.classList.remove('is-open');
    const done = () => {
      menu.close();
      burger?.setAttribute('aria-expanded', 'false');
      document.dispatchEvent(new CustomEvent('bd:menu', { detail: false }));
    };
    if (instant || calm) done();
    else closing = window.setTimeout(done, 600);
  };
  burger?.addEventListener('click', open);
  $$('[data-menu-close]', menu).forEach((b) => b.addEventListener('click', () => close()));
  // Esc closes with the same animation.
  menu.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // Every link closes the menu, also one to the page you are on.
  menu.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) close(true);
  });
  for (const a of $$<HTMLAnchorElement>('[data-prev]', menu)) {
    a.addEventListener('pointerenter', () => show(a.dataset.prev!));
    a.addEventListener('focus', () => show(a.dataset.prev!));
  }
  // Back/forward cache restores the page as it was: never with the menu open.
  addEventListener('pageshow', () => close(true));
}

/* ---------- hero slider ---------- */
for (const box of $$('[data-slider]')) {
  const track = $('[data-track]', box)!;
  const slides = $$('[data-slide]', box);
  const texts = $$<HTMLAnchorElement>('[data-slide-text]', box);
  const dots = $$('[data-dot]', box);
  const roll = $('[data-roll]', box);
  const clock = $('[data-clock]', box);
  const n = slides.length;
  if (n < 2) continue;
  let at = 0;
  let busy = false;
  const restartClock = () => {
    if (calm) return;
    box.classList.remove('is-auto');
    void box.offsetWidth;
    box.classList.add('is-auto');
  };
  const setText = (i: number) => {
    texts.forEach((t, k) => {
      const on = k === i;
      if (t.classList.contains('is-on') && !on) {
        t.classList.add('is-leave');
        setTimeout(() => t.classList.remove('is-leave'), 900);
      }
      t.classList.toggle('is-on', on);
      t.tabIndex = on ? 0 : -1;
      t.toggleAttribute('aria-hidden', !on);
      if (on) t.removeAttribute('tabindex');
    });
    slides.forEach((s, k) => s.toggleAttribute('aria-hidden', k !== i));
    dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
    if (roll) roll.style.transform = `translateY(${(-100 * i) / n}%)`;
  };
  // Desktop: the new slide wipes in from the right over the old one, which drifts 4% left.
  const wipe = (i: number) => {
    slides.forEach((s) => s.classList.remove('was-on'));
    slides[at].classList.replace('is-on', 'was-on');
    slides[i].classList.add('is-on');
  };
  // Phones: the current slide is always the first in the track, the next one shows its edge.
  const step = () => (slides[0].getBoundingClientRect().width || 0) + 8;
  const ordered = () => $$('[data-slide]', track);
  const slideTo = (dir: 1 | -1) =>
    new Promise<void>((done) => {
      const w = step();
      if (dir === -1) {
        track.style.transition = 'none';
        track.prepend(ordered()[n - 1]);
        track.style.transform = `translateX(${-w}px)`;
        void track.offsetWidth;
      }
      track.style.transition = '';
      track.style.transform = dir === 1 ? `translateX(${-w}px)` : 'translateX(0px)';
      const end = () => {
        track.removeEventListener('transitionend', end);
        clearTimeout(t);
        if (dir === 1) {
          track.style.transition = 'none';
          track.append(ordered()[0]);
          track.style.transform = 'translateX(0px)';
          void track.offsetWidth;
          track.style.transition = '';
        }
        done();
      };
      const t = setTimeout(end, calm ? 20 : 1000);
      track.addEventListener('transitionend', end);
    });
  const go = async (dir: 1 | -1) => {
    if (busy) return;
    busy = true;
    const i = (at + dir + n) % n;
    if (phone.matches) {
      // Mark the slide classes too, so a resize to desktop shows the right one.
      slides.forEach((s, k) => s.classList.toggle('is-on', k === i));
      setText(i);
      await slideTo(dir);
    } else {
      wipe(i);
      setText(i);
      await wait(calm ? 0 : 400);
    }
    at = i;
    busy = false;
    restartClock();
  };
  $('[data-next]', box)?.addEventListener('click', () => go(1));
  clock?.addEventListener('animationend', () => go(1));
  // Switching layout: reset the track to the markup order.
  phone.addEventListener('change', () => {
    track.style.transform = '';
    slides.forEach((s) => track.append(s));
    for (let k = 0; k < at; k++) track.append(ordered()[0]);
  });
  // Swipe on touch screens: the track follows the finger, a short flick is enough.
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let drag: 'x' | 'y' | null = null;
  track.addEventListener('pointerdown', (e) => {
    if (!phone.matches || busy || e.pointerType === 'mouse') return;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = 0;
    drag = null;
    box.classList.add('is-held');
  });
  track.addEventListener('pointermove', (e) => {
    if (!box.classList.contains('is-held') || drag === 'y') return;
    dx = e.clientX - x0;
    if (!drag) {
      if (Math.abs(dx) < 6 && Math.abs(e.clientY - y0) < 6) return;
      drag = Math.abs(dx) > Math.abs(e.clientY - y0) ? 'x' : 'y';
      if (drag === 'y') return;
      track.setPointerCapture(e.pointerId);
    }
    track.style.transition = 'none';
    // Dragging to the right pulls the previous slide in: rubber band instead.
    track.style.transform = `translateX(${dx < 0 ? dx : dx * 0.35}px)`;
  });
  const release = () => {
    if (!box.classList.contains('is-held')) return;
    box.classList.remove('is-held');
    if (drag !== 'x') return;
    drag = null;
    track.style.transition = '';
    if (dx < -40) go(1);
    else if (dx > 40) go(-1);
    else track.style.transform = 'translateX(0px)';
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);
  // A dragged slide is not a click on the text link.
  box.addEventListener('click', (e) => Math.abs(dx) > 6 && (e.preventDefault(), (dx = 0)), true);
  ready(restartClock);
}

/* ---------- statement band: scroll-linked fallback where CSS scroll timelines are missing ---------- */
if (!calm && !CSS.supports('animation-timeline: view()')) {
  for (const el of $$('[data-scrub]')) {
    let on = false;
    let queued = false;
    const run = () => {
      queued = false;
      const r = el.getBoundingClientRect();
      const vh = innerHeight;
      el.style.setProperty('--p', clamp((vh - r.top) / ((vh + r.height) / 2)).toFixed(3));
    };
    const queue = () => on && !queued && (queued = true) && requestAnimationFrame(run);
    new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      run();
    }).observe(el);
    addEventListener('scroll', queue, { passive: true });
    run();
  }
}

/* ---------- filters: work and journal ---------- */
for (const bar of $$('[data-filter]')) {
  const grid = $(`#${bar.dataset.filter}`);
  if (!grid) continue;
  const items = $$('[data-cats]', grid);
  const chips = $$<HTMLButtonElement>('button[data-cat]', bar);
  const live = $('[data-count-live]');
  const more = $<HTMLButtonElement>('[data-more]');
  const apply = (cat: string) => {
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.cat === cat)));
    grid.classList.toggle('is-filtered', cat !== 'all');
    let shown = 0;
    for (const it of items) {
      const on = cat === 'all' ? !it.hasAttribute('data-page-item') : (it.dataset.cats ?? '').split(' ').includes(cat);
      it.hidden = !on;
      if (!on) continue;
      shown++;
      // Rise again, one after another.
      it.classList.remove('is-in');
      it.style.setProperty('--d', `${Math.min(shown - 1, 6) * 60}ms`);
      void it.offsetWidth;
      it.classList.add('is-in');
      $$('[data-img]', it).forEach((im) => im.classList.add('is-in'));
    }
    if (live) live.textContent = String(shown);
    if (more) more.hidden = cat !== 'all' || !items.some((it) => it.hasAttribute('data-page-item'));
  };
  chips.forEach((chip) => chip.addEventListener('click', () => apply(chip.dataset.cat!)));
  // "Show more" / "Older notes": the next page of items.
  more?.addEventListener('click', () => {
    const next = items.filter((it) => it.hasAttribute('data-page-item')).slice(0, Number(more.dataset.more) || 6);
    next.forEach((it) => {
      it.removeAttribute('data-page-item');
      it.hidden = false;
      it.classList.add('is-in');
      $$('[data-img]', it).forEach((im) => im.classList.add('is-in'));
    });
    next[0]?.querySelector('a')?.focus();
    more.hidden = !items.some((it) => it.hasAttribute('data-page-item'));
    if (live) live.textContent = String(items.filter((it) => !it.hidden).length);
  });
}

/* ---------- pricing: monthly / quarterly ---------- */
for (const box of $$('[data-billing]')) {
  const chips = $$<HTMLButtonElement>('button[data-period]', box);
  const scope = box.closest('main') ?? document;
  const set = (q: boolean) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String((c.dataset.period === 'quarterly') === q)));
    $$('[data-plans]', scope).forEach((p) => p.classList.toggle('is-q', q));
    $$('[data-price="monthly"]', scope).forEach((p) => p.toggleAttribute('aria-hidden', q));
    $$('[data-price="quarterly"]', scope).forEach((p) => p.toggleAttribute('aria-hidden', !q));
  };
  chips.forEach((c) => c.addEventListener('click', () => set(c.dataset.period === 'quarterly')));
}

/* ---------- FAQ: the answer opens and closes with its height ---------- */
if (!calm) {
  for (const row of $$<HTMLDetailsElement>('[data-faq]')) {
    const sum = $('summary', row)!;
    const body = $('.faq__a', row)!;
    let anim: Animation | null = null;
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      anim?.cancel();
      if (!row.open) {
        row.open = true;
        const h = body.offsetHeight;
        anim = body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' });
      } else {
        const h = body.offsetHeight;
        row.classList.add('is-closing');
        anim = body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 400, easing: 'cubic-bezier(.22,1,.36,1)' });
        anim.onfinish = () => {
          row.open = false;
          row.classList.remove('is-closing');
        };
        anim.oncancel = () => row.classList.remove('is-closing');
      }
    });
  }
}

/* ---------- newsletter without an endpoint: demo mode, only the thank-you line ---------- */
for (const form of $$<HTMLFormElement>('form[data-news="demo"]')) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = $('[data-news-ok]', form);
    if (ok) ok.textContent = form.dataset.thanks ?? '';
    form.reset();
  });
}

/* ---------- copy link (journal notes) ---------- */
for (const b of $$<HTMLButtonElement>('[data-copy]')) {
  const label = $('[data-copy-label]', b) ?? b;
  const text = label.textContent;
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      label.textContent = b.dataset.copy ?? text;
      setTimeout(() => (label.textContent = text), 2000);
    } catch {
      // clipboard blocked: nothing to do
    }
  });
}

/* ---------- "On this page" (legal pages): the section in view is marked ---------- */
for (const nav of $$('[data-spy]')) {
  const links = $$<HTMLAnchorElement>('a[href^="#"]', nav);
  const targets = links.map((a) => document.getElementById(a.hash.slice(1))?.closest('section')).filter(Boolean) as HTMLElement[];
  const mark = (i: number) => links.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
  const spy = () => {
    let at = 0;
    targets.forEach((t, i) => t.getBoundingClientRect().top < innerHeight * 0.4 && (at = i));
    mark(at);
  };
  addEventListener('scroll', spy, { passive: true });
  spy();
}

/* ---------- desktop extras ---------- */
if (matchMedia('(pointer: fine)').matches && !calm) import('./desktop').then((m) => m.init());

// Explicit keyboard dismissal also works when focus has moved outside a detail dialog.
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.isComposing) return;
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('.stake-dialog[open], .token-dialog[open]'));
  const focused = event.target instanceof Element ? event.target.closest<HTMLDialogElement>('dialog[open]') : null;
  const dialog = focused && dialogs.includes(focused) ? focused : dialogs.at(-1);
  if (!dialog) return;
  event.preventDefault();
  event.stopPropagation();
  dialog.close();
}, { capture: true });
