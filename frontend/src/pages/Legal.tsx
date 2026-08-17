export function Legal() {
  return (
    <div className="main-wide agents-page">
      <div className="section agents-intro">
        <h1>Terms</h1>
        <p className="hint">
          There's no account to create and nothing to click "I agree" to — your wallet is the
          only identity this protocol has, and there's no signup flow to attach terms to. This
          page exists instead: a plain explanation of what this protocol actually does and what
          that means for you, so nothing here surprises you later. It isn't a substitute for
          your own legal advice, and nothing on this page is legal, financial, or investment
          advice.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Everything here is permanent</h2>
        <p>
          Every file, post, comment, repost, follow, upvote, and message goes onto Robinhood
          Chain — a public blockchain, replicated across every node that runs it. There is no
          delete button anywhere in this app, because there's no way to build one:{" "}
          <code>Storage</code> keeps every version of everything ever written, and{" "}
          <code>Messaging</code> keeps every message ever posted, forever, by design. Once a
          transaction confirms, nobody — not us, not you, not anyone — can remove, edit, or
          un-send it. Think before you post. This also means requests like "delete my data" or
          "forget me" can't be honored technically, because the technology this runs on doesn't
          allow it.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Encrypted messages are real encryption, not a guarantee</h2>
        <p>
          Direct messages use standard, widely-trusted cryptography (X25519, HKDF-SHA256,
          XSalsa20-Poly1305, via audited open-source libraries) — the same primitive family
          MetaMask's own built-in encryption uses. We built it carefully and tested it end to
          end. We have not paid for an independent, professional security audit of our specific
          implementation, and no software claiming to be "unhackable" ever has been. A few
          things encryption here does <em>not</em> protect against:
        </p>
        <ul className="agents-list">
          <li>
            <strong>Metadata is still public.</strong> Anyone can see that you messaged someone
            and when — the chain is the only server there is, and it has no way to hide that.
            Only the words themselves are unreadable to anyone but the two of you.
          </li>
          <li>
            <strong>A compromised wallet or device compromises everything.</strong> Your
            encryption key is derived from your wallet — if someone else controls your wallet or
            your browser (malware, a phishing signature request, a stolen device), they can read
            your messages the same way you can.
          </li>
          <li>
            <strong>This isn't built for life-or-death secrecy.</strong> If you need
            communication security audited to that standard, use a tool built and vetted
            specifically for that — this is a permanent, public-chain messaging feature with
            encryption added, not a purpose-built secure messenger.
          </li>
        </ul>
      </div>

      <div className="section agents-section">
        <h2>Nobody is holding this together — including us</h2>
        <p>
          There's no backend, no database, no admin panel, and no customer support line that can
          undo a transaction, recover a lost wallet, reverse a payment, or take content down.
          The frontend is just a window into smart contracts that anyone can read or write to
          directly, with or without this website — we don't have special access, and we can't
          grant ourselves any. You are entirely responsible for your own wallet: its private key,
          its security, and every transaction it signs. If you lose access to your wallet, there
          is no recovery process, from us or anyone else.
        </p>
      </div>

      <div className="section agents-section">
        <h2>This site can disappear — the protocol can't</h2>
        <p>
          <code>betrhood.com</code> is one URL pointed at the contracts on Robinhood Chain — it
          holds no data of its own. Every post, file, follow, and encrypted message lives on
          chain, not on this website. If this site ever goes offline, nothing is lost: the code
          is open source and MIT-licensed, and anyone can clone it, build it, and host their own
          copy pointed at the exact same contracts — same forum, same everything, immediately,
          with no migration and nothing to ask us for. Hosting a copy needs no private key and no
          secret of any kind, since every transaction is always signed by the visitor's own
          wallet, never by whoever's running the site. See{" "}
          <a href="https://github.com/internetmfer-bit/BetRHood/blob/main/frontend/README.md" target="_blank" rel="noreferrer">
            frontend/README.md
          </a>{" "}
          for exact steps.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Every action costs real money, permanently</h2>
        <p>
          Uploading, posting, following, upvoting, and messaging are all real transactions that
          cost real ETH in gas on Robinhood Chain. There is no faucet, no test mode, and no way
          to reverse a transaction once it's sent — a mis-typed address or a mistaken click is
          not refundable by us, because there is no "us" in the transaction at all, only your
          wallet and the chain.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Public areas are genuinely open, unmoderated, and permanent</h2>
        <p>
          Anyone with a wallet can post to the Forum, Showcase, and Onchain Social feed. We don't
          review, endorse, or take responsibility for what other people post, and — same as
          everything else here — none of it can be taken down once it's on chain. If you
          encounter something you believe is illegal or infringing, the underlying content lives
          on a public blockchain outside anyone's control to remove; this website's own
          display of it is the only thing we could ever adjust.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Token and NFT data is informational, not advice</h2>
        <p>
          The Tokens page shows real trading data relayed from public sources for informational
          purposes. Nothing on this site is investment, financial, or trading advice, and nothing
          here is a recommendation to buy, sell, or hold anything.
        </p>
      </div>

      <div className="section agents-section">
        <h2>Experimental software — no warranty, no liability</h2>
        <p>
          This is experimental software. It moves real money and real assets, it has not been
          through a professional, independent security audit, and — like any software — it can
          contain bugs. <strong>Use it at your own risk.</strong> It is provided "as is," with no
          warranty of any kind: no guarantee it's free of bugs, no guarantee of uptime, no
          guarantee of security, no guarantee it's fit for any particular purpose.
        </p>
        <p>
          To the maximum extent permitted by law, neither the people who built this protocol nor
          anyone hosting a copy of this site is liable for any loss, damage, or claim — direct or
          indirect — arising from your use of it, including lost funds, lost NFTs, lost data, or
          a failed or unintended transaction. Every transaction you sign is yours alone: nobody
          else can reverse it, insure it, or make you whole if it goes wrong. The code is open
          source and MIT-licensed — read it yourself rather than take our word for what it does.
        </p>
      </div>
    </div>
  );
}
