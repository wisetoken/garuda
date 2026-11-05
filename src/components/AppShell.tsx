import { Sun, Moon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { WalletButton } from '../lib/wallet';
import { Link } from 'react-router-dom';
import { navigation, screenHref, type Screen } from '../navigation';

export function AppShell({ activeScreen, children }: { activeScreen: Screen; children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('garuda:theme:v1') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('garuda:theme:v1', next); } catch { /* Theme still works without storage. */ }
  }
  return (
    <div className="app-shell" data-theme={theme}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-header">
        <div className="container header-content">
          <Link className="brand" to={screenHref('trade')} aria-label="WiseOne Garuda market">
            <img src="/wiseone-logo.png" alt="" width="44" height="44" />
            <strong>WiseOne</strong><span>Garuda extension</span><i aria-hidden="true" />
          </Link>
          <nav aria-label="Garuda navigation">
            {navigation.map(({ screen, label }) => (
              <Link key={screen} to={screenHref(screen)} aria-current={screen === activeScreen ? 'page' : undefined}>{label}</Link>
            ))}
          </nav>
          <div className="header-controls">
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </button>
          <WalletButton />
          </div>
        </div>
      </header>
      <main className="container app-content" id="main" tabIndex={-1}>{children}</main>
      <footer className="app-footer">
        <div className="container footer-content">
          <p className="footer-brand">WiseOne <span>Garuda extension</span></p>
          <div className="footer-links"><span className="network"><i aria-hidden="true" />Ethereum</span><a href="https://github.com/wisetoken/signature-stakes" target="_blank" rel="noreferrer">Contracts <span aria-hidden="true">↗</span></a></div>
        </div>
      </footer>
    </div>
  );
}
