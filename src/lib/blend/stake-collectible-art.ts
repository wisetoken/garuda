import { keccak256, toHex, formatEther } from 'viem';
import { stakeCollection } from './stake-collections';
import { wiseOneArtLogo } from './wiseone-art-logo';

// Reused from the WiseOne/yoda artwork renderer. Swarm adds a storage path;
// the artwork design itself is existing project work.

export type CollectibleStake = { collection: string; tokenId: string; stakeId: string; principal: bigint; startAt: number; maturesAt: number };
const xml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
/** Fixed Western zodiac date bands, using the stake start date in UTC (cosmetic only). */
export function stakeZodiac(startAt: number) {
  const date = new Date(startAt * 1000);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid stake date');
  const day = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const signs = [
    [120, 'Aquarius', '♒'], [219, 'Pisces', '♓'], [321, 'Aries', '♈'],
    [420, 'Taurus', '♉'], [521, 'Gemini', '♊'], [621, 'Cancer', '♋'],
    [723, 'Leo', '♌'], [823, 'Virgo', '♍'], [923, 'Libra', '♎'],
    [1023, 'Scorpio', '♏'], [1122, 'Sagittarius', '♐'], [1222, 'Capricorn', '♑'],
  ] as const;
  const sign = [...signs].reverse().find(([start]) => day >= start) ?? signs[11];
  return { name: sign[1], symbol: sign[2] };
}
// Vector zodiac glyphs avoid platform-dependent emoji/font rendering.
const zodiacPaths: Record<string, string> = {
  Aries: 'M12 22V8C12 -1 1 -1 2 8M12 8C12 -1 23 -1 22 8',
  Taurus: 'M3 1C3 9 21 9 21 1M19 15a7 7 0 1 1-14 0a7 7 0 1 1 14 0',
  Gemini: 'M3 2Q12 6 21 2M3 22Q12 18 21 22M7 4V20M17 4V20',
  Cancer: 'M3 8Q12 -1 22 7M21 16Q12 25 2 19M9 8a3 3 0 1 1-6 0a3 3 0 1 1 6 0M21 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  Leo: 'M9 15a4 4 0 1 1-8 0a4 4 0 1 1 8 0M8 12C-2 -2 21 -2 17 10S11 23 23 19',
  Virgo: 'M2 20V4Q6 0 7 5V19M7 5Q12 0 12 5V19M12 5Q17 0 17 5V16Q17 22 22 22M17 9Q26 4 22 14L13 23',
  Libra: 'M2 22H22M2 16H8C-2 2 26 2 16 16H22',
  Scorpio: 'M2 20V4Q6 0 7 5V19M7 5Q12 0 12 5V19M12 5Q17 0 17 5V17Q17 22 23 19M20 17L23 19L21 22',
  Sagittarius: 'M2 22L22 2M11 2H22V13M3 9L15 21',
  Capricorn: 'M1 5L6 3L11 20L16 7Q22 1 22 10Q22 18 13 21M16 15Q20 11 23 15Q25 22 19 22',
  Aquarius: 'M1 8L5 4L9 8L13 4L17 8L21 4M1 18L5 14L9 18L13 14L17 18L21 14',
  Pisces: 'M3 1Q16 12 3 23M21 1Q8 12 21 23M1 12H23',
};
/** Cosmetic tiers only. Stable inputs; no external assets, owner address or live price. */
export function collectibleTraits(s: CollectibleStake) {
  const days = Math.round((s.maturesAt - s.startAt) / 86400);
  const tier = days >= 1825 ? 4 : days >= 1095 ? 3 : days >= 365 ? 2 : days >= 90 ? 1 : 0;
  const whole = s.principal / 10n ** 18n;
  const magnitude = whole >= 100000n ? 5 : whole >= 10000n ? 4 : whole >= 1000n ? 3 : whole >= 100n ? 2 : 1;
  const seed = keccak256(toHex(`yoda-art-v1:1:${s.collection.toLowerCase()}:${s.tokenId}:${s.stakeId}`));
  return { days, tier, magnitude, seed, zodiac: stakeZodiac(s.startAt), name: ['Dawn','Grove','Aurora','Celestial','Epoch'][tier], color: ['#b9d8c0','#75d9b4','#9ce8dc','#c9b8ff','#e9cc83'][tier] };
}
export const formatStakeArtDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export function renderStakeCollectible(s: CollectibleStake) {
  if (!/^\d+$/.test(s.tokenId) || s.principal < 0n || !Number.isFinite(s.startAt) || !Number.isFinite(s.maturesAt) || s.maturesAt <= s.startAt) throw new Error('Invalid collectible stake');
  const t = collectibleTraits(s), c = t.color;
  const col = stakeCollection(s.collection);
  const text = (x:number,y:number,size:number,value:string,extra='') => `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${xml(value)}</text>`;
  const dots = Array.from({length:20+t.magnitude*7},(_,i)=>{
    const b = parseInt(t.seed.slice(2+(i%30)*2,4+(i%30)*2),16);
    const angle=(i*137.508+b/12)*Math.PI/180, r=210+(b%105);
    return `<circle cx="${480+Math.cos(angle)*r}" cy="${390+Math.sin(angle)*r}" r="${i%7===0?2.5:1}" opacity="${.25+(b%40)/100}"/>`;
  }).join('');
  const stars = Array.from({length:7+t.tier},(_,i)=>{
    const b=parseInt(t.seed.slice(2+i*2,4+i*2),16);
    const a=(i*137.508+b/5)*Math.PI/180, r=215+b%90;
    const x=480+Math.cos(a)*r, y=Math.min(630,390+Math.sin(a)*r), size=5+b%7;
    return `<g transform="translate(${x} ${y})"><circle r="${size*2.8}" fill="url(#spark)"/><path d="M0 ${-size}Q1.7 -1.7 ${size} 0Q1.7 1.7 0 ${size}Q-1.7 1.7 ${-size} 0Q-1.7 -1.7 0 ${-size}Z" fill="#d9fff4" opacity=".9"/></g>`;
  }).join('');
  const rings=Array.from({length:t.magnitude},(_,i)=>`<circle cx="480" cy="390" r="${226+i*14}" fill="none" stroke="${c}" stroke-opacity="${.3-i*.035}" stroke-width="1" stroke-dasharray="${i%2? '2 12':'120 30 2 30'}" transform="rotate(${parseInt(t.seed.slice(2+i*2,4+i*2),16)} 480 390)"/>`).join('');
  const amount = Number(formatEther(s.principal)).toLocaleString('en-US',{maximumFractionDigits:2,notation:s.principal>=10n**27n?'compact':'standard'});
  const date = formatStakeArtDate;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1100" viewBox="0 0 960 1100" role="img">
<title>${xml(`${col.name} #${s.tokenId} · ${t.name} · ${t.days} days · ${amount} WISE`)}</title>
<defs><filter id="wiseTeal" color-interpolation-filters="sRGB"><feColorMatrix type="hueRotate" values="-45"/>${t.tier === 4 ? '<feColorMatrix type="matrix" values="1 .3 0 0 0  0 1 .06 0 0  0 0 .72 0 0  0 0 0 1 0"/>' : ''}</filter><radialGradient id="spark"><stop stop-color="#a4ffe1" stop-opacity=".24"/><stop offset="1" stop-color="#a4ffe1" stop-opacity="0"/></radialGradient><radialGradient id="bg"><stop stop-color="#143d37"/><stop offset="1" stop-color="#071716"/></radialGradient><radialGradient id="halo"><stop stop-color="${c}" stop-opacity=".11"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
<rect width="960" height="1100" rx="32" fill="url(#bg)"/>
<rect x="20" y="20" width="920" height="1060" rx="23" fill="none" stroke="${c}" stroke-opacity=".3"/>
<path d="M48 104V48H104 M856 48H912V104 M48 996V1052H104 M856 1052H912V996" fill="none" stroke="${c}" stroke-width="2"/>
<g font-family="Arial, sans-serif" fill="${c}">
${text(68,90,32,'yoda', 'font-weight="700" letter-spacing="-1"')}${text(890,90,18,'WISEONE / ETHEREUM','text-anchor="end" letter-spacing="3"')}
<g transform="translate(468 112)" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${zodiacPaths[t.zodiac.name]}"/></g>
${text(480,165,24,t.zodiac.name.toUpperCase(),'text-anchor="middle" letter-spacing="3"')}
<circle cx="480" cy="390" r="330" fill="url(#halo)"/>
${dots}${rings}${stars}
<path d="M480 168L679 284V514L480 628L281 514V284Z" fill="none" stroke="${c}" stroke-opacity=".13"/>
<image x="300" y="210" width="360" height="360" preserveAspectRatio="xMidYMid meet" filter="url(#wiseTeal)" href="${wiseOneArtLogo}"/>
${text(480,700,28,`${col.name.toUpperCase()} / ${t.name.toUpperCase()}`,'text-anchor="middle" letter-spacing="3"')}
${text(480,751,48,`#${s.tokenId.padStart(4,'0')}`,'text-anchor="middle" fill="#f0f4e9"')}
<path d="M68 792H892" stroke="${c}" stroke-opacity=".25"/>
${text(68,830,24,'STAKED PRINCIPAL','letter-spacing="2" opacity=".7"')}${text(892,830,24,'LOCK DURATION','text-anchor="end" letter-spacing="2" opacity=".7"')}
${text(68,881,42,`${amount} WISE`,'fill="#f0f4e9"')}${text(892,881,42,`${t.days.toLocaleString('en-US')} days`,'text-anchor="end" fill="#f0f4e9"')}
${text(68,931,22,'START','opacity=".8"')}${text(892,931,22,'MATURITY','text-anchor="end" opacity=".8"')}
${text(68,968,30,date(s.startAt),'fill="#f0f4e9"')}${text(892,968,30,date(s.maturesAt),'text-anchor="end" fill="#f0f4e9"')}
<path d="M68 995H892" stroke="${c}" stroke-opacity=".2"/>
${text(480,1035,22,col.supportsScraping?'SIGNATURE · REWARD SCRAPING':'ADVANCED · LEGACY','text-anchor="middle" letter-spacing="1.5"')}
</g></svg>`;
}
