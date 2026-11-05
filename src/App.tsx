import { MarketActionsProvider } from "./components/MarketActions";
import { resolveScreen } from "./navigation";
import { InformationPage } from "./pages/InformationPage";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { MarketPage } from "./pages/MarketPage";
import { MyStakesPage } from "./pages/MyStakesPage";
import { LendPage } from "./pages/LendPage";

const pages = { trade: MarketPage, stakes: MyStakesPage, lend: LendPage };

export function App() {
  const [params] = useSearchParams();
  const screen = resolveScreen(params.get("screen"));
  const Page =
    screen === "trade" || screen === "stakes" || screen === "lend"
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
