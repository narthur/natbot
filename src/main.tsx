import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Self-hosted, so the page makes no request to Google Fonts.
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* useAgentChat suspends while it loads a returning visitor's Conversation. */}
    <Suspense fallback={<p className="p-12 text-center text-muted">Loading your conversation…</p>}>
      <App />
    </Suspense>
  </StrictMode>,
);
