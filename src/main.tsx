import * as Sentry from "@sentry/react";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Self-hosted, so the page makes no request to Google Fonts.
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "./index.css";

// natbot-web. Like the Worker (src/worker/sentry.ts), it keeps what Visitors type out of Sentry: no breadcrumbs,
// which would record clicks and console output, and no request data. There is no session replay.
Sentry.init({
  dsn: "https://5b2a6efbacf4e39185165034fe95c405@o4511632382558208.ingest.us.sentry.io/4512148291911680",
  enabled: import.meta.env.PROD,
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  beforeBreadcrumb: () => null,
});

createRoot(document.getElementById("root")!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    {/* useAgentChat suspends while it loads a returning visitor's Conversation. */}
    <Suspense fallback={<p className="p-12 text-center text-muted">Loading your conversation…</p>}>
      <App />
    </Suspense>
  </StrictMode>,
);
