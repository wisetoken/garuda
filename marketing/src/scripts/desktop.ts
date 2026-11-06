/**
 * Mouse and trackpad extras, loaded only on (pointer: fine) and never for visitors who prefer reduced
 * motion (see the end of scripts/site.ts). Phones never download this file.
 *
 * - cursor pill: an orange "View" pill that follows the pointer over photos ([data-cursor])
 * - magnetic buttons ([data-magnet]): pulled up to 14 px towards the pointer
 */

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function init() {
  cursor();
  magnets();
}

/* ---------- cursor pill over photos ---------- */
function cursor() {
  const el = document.createElement('div');
  el.className = 'cur';
  el.setAttribute('aria-hidden', 'true');
  const pill = document.createElement('span');
  pill.className = 'cur__p';
  el.append(pill);
  document.body.append(el);
  let x = -200;
  let y = -200;
  let tx = x;
  let ty = y;
  let raf = 0;
  const tick = () => {
    x = lerp(x, tx, 0.18);
    y = lerp(y, ty, 0.18);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const over = (e.target as Element).closest?.<HTMLElement>('[data-cursor]');
      tx = e.clientX;
      ty = e.clientY;
      if (over) {
        if (!el.classList.contains('is-on')) {
          // Appear at the pointer, not flying in from the last spot.
          x = tx;
          y = ty;
        }
        pill.textContent = over.dataset.cursor ?? '';
      }
      el.classList.toggle('is-on', Boolean(over));
      if (!raf) raf = requestAnimationFrame(tick);
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => el.classList.remove('is-on'));
  // Keyboard use hides it.
  addEventListener('keydown', () => el.classList.remove('is-on'));
}

/* ---------- magnetic buttons ---------- */
function magnets() {
  const MAX = 14;
  for (const el of $$('[data-magnet]')) {
    let raf = 0;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    const tick = () => {
      x = lerp(x, tx, 0.2);
      y = lerp(y, ty, 0.2);
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.05 ? requestAnimationFrame(tick) : 0;
    };
    const run = () => !raf && (raf = requestAnimationFrame(tick));
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      tx = Math.max(-1, Math.min(1, dx)) * MAX;
      ty = Math.max(-1, Math.min(1, dy)) * MAX;
      run();
    });
    el.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      run();
    });
  }
}
