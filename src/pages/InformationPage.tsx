import { lazy, Suspense } from 'react';
import { PlaceholderPage } from '../components/PlaceholderPage';

const ProblemPage = lazy(() => import('./guides/GarudaProblem').then(module => ({ default: module.GarudaProblem })));
const SolutionPage = lazy(() => import('./guides/GarudaGuide').then(module => ({ default: module.GarudaGuide })));
const BackupPage = lazy(() => import('./BackupAccessPage').then(module => ({ default: module.BackupAccessPage })));

const content = {
  fund: { section: 'Get WISE', title: 'Get ready for your next position.', description: 'Swap ETH, WETH, USDC or DAI into WISE.' },
  privacy: { section: 'CROPS', title: 'Your access should outlast this website.', description: 'Recovery tools and private connection controls will be brought over with their supporting integrations.' },
};

type InformationScreen = keyof typeof content | 'problem' | 'how';

export function InformationPage({ screen }: { screen: InformationScreen }) {
  if (screen === 'privacy') return <Suspense fallback={<p role="status">Loading backup access…</p>}><BackupPage /></Suspense>;
  if (screen === 'problem' || screen === 'how') {
    return <>
      <title>{`${screen === 'problem' ? 'The Problem' : 'The Solution'} | WiseOne | Garuda Extension`}</title>
      <Suspense fallback={<p role="status">Loading…</p>}>
        {screen === 'problem' ? <ProblemPage /> : <SolutionPage />}
      </Suspense>
    </>;
  }
  return <PlaceholderPage {...content[screen]} placeholder="This page is being brought into the new app." />;
}
