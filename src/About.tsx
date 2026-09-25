import { useRef } from "react";

// Mirrors profile.md: keep them in step when the Profile changes.
const facts = [
  ["Now", "Founder, Pine Peak Digital, 2024–"],
  ["", "Founder, TaskRatchet, 2019–"],
  ["Before", "Technology Director, AudioVerse"],
  ["Stack", "TypeScript, React, Node.js, Cloudflare Workers"],
  ["Based", "Bowling Green, Kentucky"],
  ["Open to", "US and European roles"],
];

const links = [
  ["nathanarthur.com", "https://nathanarthur.com"],
  ["github.com/narthur", "https://github.com/narthur"],
  ["linkedin.com/in/nathanarthur", "https://www.linkedin.com/in/nathanarthur"],
];

function Identity({ heading: Heading }: { heading: "h1" | "p" }) {
  return (
    <div>
      <p className="label text-on-ink-accent">In conversation</p>
      <Heading className="mt-3 font-serif text-5xl leading-none font-medium">Nathan Arthur</Heading>
      <p className="mt-2.5 font-serif text-lg text-on-ink-muted italic">Full-stack web engineer since 2016</p>
    </div>
  );
}

function Facts() {
  return (
    <>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3">
        {facts.map(([label, value]) => (
          <div key={value} className={`col-span-2 grid grid-cols-subgrid ${label ? "border-t border-ink-rule" : ""}`}>
            <dt className="label pt-2.5 text-on-ink-label">{label}</dt>
            <dd className="pt-2 pb-0.5 font-serif text-lg leading-snug">{value}</dd>
          </div>
        ))}
      </dl>
      <nav aria-label="Nathan elsewhere" className="mt-auto flex flex-col">
        {links.map(([text, href]) => (
          <a key={href} href={href} className="flex min-h-11 items-center text-on-ink hover:underline">
            {text}
          </a>
        ))}
      </nav>
    </>
  );
}

/** Who Nathan is at a glance: a panel beside the chat on wide screens, a header and sheet on phones. */
export function About() {
  const sheet = useRef<HTMLDialogElement>(null);
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 overflow-y-auto bg-ink px-10 pt-14 pb-10 text-on-ink lg:flex">
        <Identity heading="h1" />
        <Facts />
      </aside>

      <header className="bg-ink px-5 pt-7 pb-4 text-on-ink lg:hidden">
        <p className="label text-on-ink-accent">In conversation</p>
        <h1 className="mt-2.5 font-serif text-4xl leading-none font-medium">Nathan Arthur</h1>
        <p className="mt-2 font-serif text-on-ink-muted italic">Full-stack web engineer since 2016</p>
        <p className="mt-3 text-sm text-on-ink-muted">Founder of Pine Peak Digital and TaskRatchet · Open to US and European roles</p>
        <button
          type="button"
          onClick={() => sheet.current?.showModal()}
          className="mt-2 min-h-11 border-b border-ink-rule text-sm font-semibold"
        >
          Background, stack and links ›
        </button>
      </header>

      <dialog
        ref={sheet}
        aria-label="About Nathan"
        className="m-0 h-dvh max-h-none w-full max-w-none bg-ink px-5 pb-6 text-on-ink backdrop:bg-ink"
      >
        <div className="flex min-h-full flex-col gap-7">
          <form method="dialog" className="flex justify-end">
            <button type="submit" aria-label="Close" className="flex size-11 items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </form>
          <Identity heading="p" />
          <Facts />
          <form method="dialog">
            <button type="submit" className="label min-h-12 w-full rounded-xs bg-on-ink text-ink">
              Back to the conversation
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
