export const navigation = [
  { screen: 'stakes', label: 'My stakes' },
  { screen: 'trade', label: 'Market' },
  { screen: 'lend', label: 'Lend' },
  { screen: 'fund', label: 'Get WISE' },
  { screen: 'problem', label: 'The Problem' },
  { screen: 'how', label: 'The Solution' },
  { screen: 'privacy', label: 'CROPS' },
] as const;

export type Screen = typeof navigation[number]['screen'];
export function screenHref(screen: Screen) {
  const params = new URLSearchParams({ screen });
  if (screen === 'trade') {
    params.set('collection', 'signature');
    params.set('view', 'market');
  }
  return `/garuda/?${params}`;
}
export function resolveScreen(value: string | null): Screen {
  return navigation.find(item => item.screen === value)?.screen ?? 'trade';
}
