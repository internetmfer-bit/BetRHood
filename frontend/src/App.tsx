import { Link, Route, Routes } from "react-router-dom";
import { ConnectButton } from "./components/ConnectButton.js";
import { Home } from "./pages/Home.js";
import { Profile } from "./pages/Profile.js";
import { Upload } from "./pages/Upload.js";
import { Viewer } from "./pages/Viewer.js";

export default function App() {
  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="brand">
          BetRHood
        </Link>
        <nav className="nav-links">
          <Link to="/upload">Upload</Link>
          <Link to="/profile">Profile</Link>
        </nav>
        <ConnectButton />
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/view/:address/:key" element={<Viewer />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
