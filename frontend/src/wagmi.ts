import { robinhoodChain } from "@betrhood/sdk";
import { createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { fallback, http } from "viem";

// Optional — WalletConnect (QR on desktop, deep link on mobile) needs a free project ID from
// https://cloud.reown.com. Without one set, the app still works fully via the injected
// connector (MetaMask, Coinbase Wallet, any browser extension, or an in-wallet mobile browser)
// — it just skips the QR/deep-link option rather than breaking.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

// Optional — a dedicated RPC provider (Alchemy is what Robinhood's own docs recommend; see
// https://docs.robinhood.com/chain/connecting). The public endpoint baked into robinhoodChain
// is explicitly documented there as "rate-limited and not recommended for production use," which
// is the direct cause of intermittent page-load failures under real traffic. Same
// try-the-dedicated-one-first, fall-back-to-public pattern already used server-side in
// gateway/src/index.ts's buildTransport() — this is the browser-side counterpart of that. Without
// a key set, every read still works exactly as before, just still exposed to that rate limit.
const dedicatedRpcUrl = import.meta.env.VITE_RPC_URL_PRIMARY as string | undefined;
const rpcTransport = dedicatedRpcUrl
  ? fallback([http(dedicatedRpcUrl), http(robinhoodChain.rpcUrls.default.http[0])])
  : http();

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [robinhoodChain.id]: rpcTransport,
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
