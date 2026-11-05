import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Screen } from '../App';

const navigation: { screen: Screen; label: string; href: string }[] = [
  { screen: 'trade', label: 'Market', href: '/garuda/?screen=trade&collection=signature&view=market' },
  { screen: 'stakes', label: 'My stakes', href: '/garuda/?screen=stakes' },
  { screen: 'lend', label: 'Lend', href: '/garuda/?screen=lend' },
];

export function AppShell({ activeScreen, children }: { activeScreen: Screen; children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="container header-content">
          <a className="brand" href="/">Garuda <span>A WiseOne extension</span></a>
          <nav aria-label="Main navigation">
            {navigation.map(({ screen, label, href }) => (
              <Link key={screen} to={href} aria-current={screen === activeScreen ? 'page' : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="container app-content" id="main" tabIndex={-1}>{children}</main>
      <footer className="app-footer">
        <div className="container footer-content">
          <p>Garuda / App preview</p>
          <a href="/">Back to the project draft <span aria-hidden="true">↗</span></a>
        </div>
      </footer>
    </div>
  );
}
