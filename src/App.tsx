import { useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { MarketPage } from './pages/MarketPage';
import { MyStakesPage } from './pages/MyStakesPage';
import { LendPage } from './pages/LendPage';

const pages = { trade: MarketPage, stakes: MyStakesPage, lend: LendPage };
export type Screen = keyof typeof pages;

export function App() {
  const [params] = useSearchParams();
  const requested = params.get('screen');
  const screen: Screen = requested === 'stakes' || requested === 'lend' ? requested : 'trade';
  const Page = pages[screen];

  return (
    <AppShell activeScreen={screen}>
      <Page />
    </AppShell>
  );
}
