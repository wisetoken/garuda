export const navigation = [
  { screen: 'stakes', path: '/stakes', label: 'My stakes' },
  { screen: 'trade', path: '/market', label: 'Market' },
  { screen: 'lend', path: '/lend', label: 'Lend' },
  { screen: 'fund', path: '/get-wise', label: 'Get WISE' },
  { screen: 'problem', path: '/problem', label: 'The Problem' },
  { screen: 'how', path: '/solution', label: 'The Solution' },
  { screen: 'privacy', path: '/crops', label: 'CROPS' },
] as const;

export type Screen = typeof navigation[number]['screen'];
export function screenHref(screen: Screen, filters: Record<string, string> = {}) {
  const path = navigation.find(item => item.screen === screen)!.path;
  const query = new URLSearchParams(filters).toString();
  return query ? `${path}?${query}` : path;
}
export function resolveScreen(value: string | null): Screen {
  return navigation.find(item => item.screen === value)?.screen ?? 'trade';
}

/** Canonicalize old bookmarks without losing filters, selected stakes or anchors. */
export function resolveAppRoute(pathname: string, search = '', hash = '', allowDeploy = false) {
  const path = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const legacy = path === '/garuda' || path === '/garuda/index.html';
  const deployment = allowDeploy && (path === '/deploy' || (legacy && params.get('screen') === 'deploy'));
  let screen: Screen | 'deploy' | undefined = deployment ? 'deploy' : legacy
    ? resolveScreen(params.get('screen'))
    : navigation.find(item => item.path === path)?.screen;
  if (!screen) return null;
  if (screen === 'trade' && params.get('view') === 'positions') {
    screen = 'stakes';
    params.delete('view');
  }
  params.delete('screen');
  if (params.get('view') === 'market') params.delete('view');
  const query = params.toString();
  const destination = screen === 'deploy' ? '/deploy' : screenHref(screen);
  return { screen, href: `${destination}${query ? `?${query}` : ''}${hash}` };
}
