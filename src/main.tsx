import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* useAgentChat suspends while it loads a returning visitor's Conversation. */}
    <Suspense>
      <App />
    </Suspense>
  </StrictMode>,
);
