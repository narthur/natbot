import { useEffect, useRef, useState } from "react";

// Site keys are public. The dev key is Cloudflare's test key that always passes.
const SITE_KEY = import.meta.env.DEV ? "1x00000000000000000000AA" : "SITE_KEY_PENDING";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/**
 * A Turnstile widget that only shows itself when Cloudflare needs the visitor to interact.
 * `token` is undefined until the check passes; call `reset` after spending a token (they're single-use).
 * `failed` is true when the script was blocked or the widget errored, so the page can say why asking is off.
 */
export function useTurnstile() {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string>(undefined);
  const [token, setToken] = useState<string>();
  // Content blockers often block challenges.cloudflare.com.
  const [failed, setFailed] = useState(() => !window.turnstile);

  useEffect(() => {
    const turnstile = window.turnstile;
    if (!turnstile || !ref.current) return;
    const id = turnstile.render(ref.current, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      callback: (t: string) => {
        setToken(t);
        setFailed(false);
      },
      "expired-callback": () => setToken(undefined),
      "error-callback": () => setFailed(true),
    });
    widget.current = id;
    return () => turnstile.remove(id);
  }, []);

  function reset() {
    setToken(undefined);
    if (widget.current) window.turnstile?.reset(widget.current);
  }

  return { ref, token, failed, reset };
}
