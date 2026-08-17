import { Link, Route, Routes } from "react-router-dom";
import { ConnectButton } from "./components/ConnectButton.js";
import { NetworkBanner } from "./components/NetworkBanner.js";
import { TrendingTicker } from "./components/TrendingTicker.js";
import { UserSearch } from "./components/UserSearch.js";
import { Agents } from "./pages/Agents.js";
import { Conversation } from "./pages/Conversation.js";
import { Feed } from "./pages/Feed.js";
import { Home } from "./pages/Home.js";
import { Legal } from "./pages/Legal.js";
import { Messages } from "./pages/Messages.js";
import { Profile } from "./pages/Profile.js";
import { ProfileView } from "./pages/ProfileView.js";
import { Store } from "./pages/Store.js";
import { StoreCollection } from "./pages/StoreCollection.js";
import { Topic } from "./pages/Topic.js";
import { Trending } from "./pages/Trending.js";
import { Upload } from "./pages/Upload.js";
import { Viewer } from "./pages/Viewer.js";

export default function App() {
  return (
    <div className="app">
      <TrendingTicker />

      <header className="nav">
        <Link to="/" className="brand">
          Bet<span>RH</span>ood
        </Link>
        <nav className="nav-links">
          <Link to="/profile">Profile</Link>
          <Link to="/feed">Social</Link>
          <Link to="/messages">Messages</Link>
          <Link to="/upload">Uploads</Link>
          <Link to="/store">NFTs</Link>
          <Link to="/trending">Tokens</Link>
          <Link to="/agents">Agents</Link>
        </nav>
        <UserSearch />
        <ConnectButton />
      </header>

      <NetworkBanner />

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/store" element={<Store />} />
          <Route path="/store/collection/:address" element={<StoreCollection />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/trending" element={<Trending />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:address" element={<Conversation />} />
          <Route path="/u/:address" element={<ProfileView />} />
          <Route path="/topic/:topic" element={<Topic />} />
          <Route path="/view/:address/:key" element={<Viewer />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>

      <footer className="site-footer">
        <Link to="/legal">Notices</Link>
        <a href="https://github.com/internetmfer-bit/BetRHood" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}
