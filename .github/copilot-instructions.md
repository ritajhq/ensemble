# Instructions for Copilot in this repository

Start with [docs/agent-context.md](../docs/agent-context.md) for the repo's mental
model, and [README.md](../README.md) for the user-facing pitch and command reference.

## Response style

- **Task summaries are 1–3 sentences.** Say what changed and how it was verified.
  Skip the file-by-file recap, the heading scaffolding, and any restatement of the
  diff — the reviewer can read the diff.
- **Don't say the same thing twice.** If a summary has two sections covering the
  same work, delete one.
- Use prose by default. Reach for headings and bullets only when the content is
  genuinely list-shaped, not to make a short answer look thorough.
- Only the requested change: no extra sections, no unsolicited files.

## How this repo expects work to be done

Prefer `deno fmt`, `deno lint`, and `deno check` on the files you touched, and build
with `deno task cli build <app>` — the smallest command that covers the change.

Don't add tests, harnesses, or screenshots the user didn't ask for. Visual checks are
welcome when they're the only way to confirm the change works, but don't re-verify
what's already confirmed.
