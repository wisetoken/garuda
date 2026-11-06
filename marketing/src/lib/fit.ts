/**
 * Fitted display type. The page titles (WORK, HALDEN STUDIO), the WISEONE wordmark, the 404, the
 * statement band and the contact card title shrink to the width of the page when they are too long.
 * CSS cannot measure text, so the width of each line is worked out at build time from Outfit's
 * glyph widths (measured in Chrome, kerning ignored, so the estimate errs a little wide) and handed
 * to CSS as --em: font-size = min(design size, available width / --em). No layout shift, no script.
 */
const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~’‘“”€·©éáíóúãõçÉÁÍÓÚÇ";
// Advance width of each character in 1/100 em (char code minus 48), for Outfit Light and ExtraLight.
const WIDTHS: Record<200 | 300, string> = {
  200: "FJSplrpGOOaeK^MUrQfeleiegiKKeeeb~tovzki}uHbqhvmogpsstqiQUQ^gJkkakfWkfDE_DfikkYZScczac\\PKPeHHWWz:fkDickiaktHsv",
  300: "FJUpkrqGOOafK^MVrRfflfiegiKKfffb|unuzki}vIbrgvmogotttrjQVQ]eKjjajfWjfEF`EfijkYZTcc{bc\\PKPfIIYYy;fjEicjiakuItu",
};

/** Width of one line of text in em at the given weight, including letter-spacing (in em per character). */
export function emWidth(text: string, weight: 200 | 300 = 300, tracking = -0.03): number {
  const table = WIDTHS[weight];
  let w = 0;
  let n = 0;
  for (const ch of text) {
    const i = CHARS.indexOf(ch);
    // Characters outside the table count as a wide letter, so the line never overflows.
    w += i < 0 ? 0.8 : (table.charCodeAt(i) - 48) / 100;
    n++;
  }
  return Math.round((w + tracking * n) * 1000) / 1000;
}

/** The widest of several lines. */
export const emWidest = (lines: string[], weight: 200 | 300 = 300, tracking = -0.03) => Math.max(...lines.map((l) => emWidth(l, weight, tracking)));
