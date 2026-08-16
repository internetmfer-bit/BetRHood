import { robinhoodChain } from "@betrhood/sdk";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

// Optional — WalletConnect (QR on desktop, deep link on mobile) needs a free project ID from
// https://cloud.reown.com. Without one set, the app still works fully via the injected
// connector (MetaMask, Coinbase Wallet, any browser extension, or an in-wallet mobile browser)
// — it just skips the QR/deep-link option rather than breaking.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [robinhoodChain.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
