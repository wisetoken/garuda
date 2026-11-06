import { darkTheme, lightTheme } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

const appUrl = window.location.origin;

export const thirdwebAppMetadata = {
  name: "WiseOne",
  url: appUrl,
  description: "WiseOne — Garuda Extension",
  logoUrl: `${appUrl}/dapp-icon.png`,
};

// Keep the same sign-in choices and wallet ordering as the original Garuda app.
export const thirdwebWallets = [
  inAppWallet({
    auth: {
      options: [
        "google", "discord", "telegram", "farcaster", "email", "x",
        "passkey", "phone", "steam", "twitch", "github", "coinbase",
        "facebook", "tiktok", "line", "apple", "guest",
      ],
    },
  }),
  createWallet("io.rabby"),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet", { appMetadata: thirdwebAppMetadata }),
  createWallet("app.phantom"),
  createWallet("com.tangem"),
  createWallet("com.exodus"),
  createWallet("com.bitcoin"),
  createWallet("com.ledger"),
  createWallet("com.trustwallet.app"),
  createWallet("io.zerion.wallet"),
];

export const thirdwebConnectModal = {
  size: "wide" as const,
  title: "WiseOne Connect",
  titleIcon: `${appUrl}/wiseone-connect.svg?icon=wiseone-connect`,
  showThirdwebBranding: false,
};

export const thirdwebDarkTheme = darkTheme({
    fontFamily: "Manrope, system-ui, sans-serif",
    colors: {
        modalBg: "#111214",
        borderColor: "rgba(255,255,255,0.1)",
        accentText: "#00b0aa",
        accentButtonBg: "#00b0aa",
        primaryButtonBg: "#00b0aa",
        primaryButtonText: "#ffffff",
        connectedButtonBg: "transparent",
        connectedButtonBgHover: "transparent",
        secondaryButtonHoverBg: "rgba(0, 176, 170, 0.18)",
        secondaryText: "#a8adb8",
        primaryText: "#f3f4f6",
    },
});

export const thirdwebLightTheme = lightTheme({
    fontFamily: "Manrope, system-ui, sans-serif",
    colors: {
        modalBg: "#ffffff",
        borderColor: "rgba(33,28,22,0.12)",
        accentText: "#08938d",
        accentButtonBg: "#00b0aa",
        primaryButtonBg: "#00b0aa",
        primaryButtonText: "#ffffff",
        connectedButtonBg: "transparent",
        connectedButtonBgHover: "transparent",
        secondaryButtonHoverBg: "rgba(0, 176, 170, 0.1)",
        primaryText: "#221f1b",
        secondaryText: "#5f594f",
    },
});
