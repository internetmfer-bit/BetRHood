import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);

  if (isConnected && address) {
    return (
      <div className="connect-wrap">
        <button className="btn btn-connected" onClick={() => setMenuOpen((v) => !v)}>
          <span className="pip" />
          {truncate(address)}
        </button>
        {menuOpen && (
          <div className="menu">
            <button
              className="menu-item"
              onClick={() => {
                disconnect();
                setMenuOpen(false);
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  if (connectors.length === 0) {
    return <span className="hint">No wallet found — install one to continue.</span>;
  }

  return (
    <div className="connect-wrap">
      <button className="btn btn-primary" onClick={() => setMenuOpen((v) => !v)} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {menuOpen && (
        <div className="menu">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              className="menu-item"
              onClick={() => {
                connect({ connector });
                setMenuOpen(false);
              }}
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
