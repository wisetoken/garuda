import { MarketActionsProvider } from "./components/MarketActions";
import { resolveScreen, screenHref } from "./navigation";
import { InformationPage } from "./pages/InformationPage";
import { Navigate, useSearchParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { MarketPage } from "./pages/MarketPage";
import { MyStakesPage } from "./pages/MyStakesPage";
import { LendPage } from "./pages/LendPage";

import { FundingPage } from "./pages/FundingPage";

const pages = { trade: MarketPage, stakes: MyStakesPage, lend: LendPage, fund: FundingPage };

export function App() {
  const [params] = useSearchParams();
  const screen = resolveScreen(params.get("screen"));
  const Page =
    screen === "trade" || screen === "stakes" || screen === "lend" || screen === "fund"
      ? pages[screen]
      : null;

  // Keep existing bookmarks pointing to the dedicated portfolio page.
  if (screen === "trade" && params.get("view") === "positions")
    return <Navigate to={screenHref("stakes")} replace />;

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
