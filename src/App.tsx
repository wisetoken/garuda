import {lazy, Suspense} from "react";
import { MarketActionsProvider } from "./components/MarketActions";
import { resolveAppRoute } from "./navigation";
import { InformationPage } from "./pages/InformationPage";
import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { MarketPage } from "./pages/MarketPage";
import { MyStakesPage } from "./pages/MyStakesPage";
import { LendPage } from "./pages/LendPage";

import { FundingPage } from "./pages/FundingPage";

const DeploymentPage = import.meta.env.DEV ? lazy(() => import("./pages/DeploymentPage").then(m => ({default:m.DeploymentPage}))) : null;

const pages = { trade: MarketPage, stakes: MyStakesPage, lend: LendPage, fund: FundingPage };

export function App() {
  const { pathname, search, hash } = useLocation();
  const route = resolveAppRoute(pathname, search, hash, import.meta.env.DEV);
  if (!route) return <AppShell activeScreen="trade"><h1>Page not found</h1><a href="/">Back to home</a></AppShell>;
  if (route.href !== `${pathname}${search}${hash}`) return <Navigate to={route.href} replace />;
  const screen = route.screen;
  if (screen === "deploy" && DeploymentPage)
    return <AppShell activeScreen="trade"><Suspense fallback={<p>Loading deployment review…</p>}><DeploymentPage/></Suspense></AppShell>;
  if (screen === "deploy") return null;
  const Page =
    screen === "trade" || screen === "stakes" || screen === "lend" || screen === "fund"
      ? pages[screen]
      : null;

  return (
    <AppShell activeScreen={screen}>
      <MarketActionsProvider>
        {Page ? (
          <Page />
        ) : (
          <InformationPage
            screen={screen as "fund" | "problem" | "how" | "privacy"}
          />
        )}
      </MarketActionsProvider>
    </AppShell>
  );
}
