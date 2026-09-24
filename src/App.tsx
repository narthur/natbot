const starterQuestions = [
  "What has Nathan built?",
  "What is TaskRatchet?",
  "What's his experience with Cloudflare?",
];

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-12 text-stone-900 dark:text-stone-100">
      <h1 className="text-2xl font-semibold">Ask about Nathan Arthur's career</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        Ask a question about Nathan's work and get an answer drawn from his career profile.
      </p>

      <ul className="mt-8 flex flex-wrap gap-2">
        {starterQuestions.map((q) => (
          <li key={q}>
            <button
              type="button"
              disabled
              className="rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-500 dark:border-stone-700"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>

      <form className="mt-auto pt-8" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          disabled
          placeholder="Chat is coming soon"
          className="w-full rounded-lg border border-stone-300 bg-transparent px-4 py-3 dark:border-stone-700"
        />
      </form>
    </main>
  );
}
