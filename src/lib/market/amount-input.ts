/** Group the integer as text so 18-decimal token values never lose precision. */
export function formatTokenInput(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return grouped + (fraction === undefined ? '' : `.${fraction}`);
}

export function readTokenInput(display: string): string | undefined {
  const raw = display.replace(/,/g, '');
  if (!/^\d*(?:\.\d{0,18})?$/.test(raw)) return undefined;
  return raw.replace(/^0+(?=\d)/, '').replace(/^\./, '0.');
}

export function tokenInputCaret(display: string, characters: number): number {
  if (characters === 0) return 0;
  let count = 0;
  for (let i = 0; i < display.length; i++) {
    if (display[i] !== ',') count++;
    if (count === characters) return i + 1;
  }
  return display.length;
}
