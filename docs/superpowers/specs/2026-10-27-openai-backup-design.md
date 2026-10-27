# OpenAI key support with main/backup — design

**Size:** small change. **Date:** 2026-10-27.

## Intent

Let the extension use an OpenAI API key as well as an Anthropic one, so it is not tied to one provider. With both keys set, the user picks which is **Main** and the other is the **Backup**, used automatically when Main fails.

## Behaviour (decided with the user)

- **Only one key present:** use that provider only. No backup, no main/backup choice shown as active.
- **Both keys present:** every refine, catch-up summary and draft reply goes to Main. If Main fails with a *switchable* error, the same request is resent to Backup.
- **Backup is silent:** no confirmation prompt. The success toast gets a small note, e.g. "via OpenAI (backup)", so a dead main key gets noticed.
- **No key at all:** today's "Add your API key" error, now naming both providers.

## Switching rules (my call)

Switch to Backup on: network error, HTTP 401/403 (bad key), 402/429 (credit or rate limit), 5xx and 529 (overloaded). Do **not** switch on a model refusal or an empty result: the same text would likely fail again, and the chat would go to a second company for nothing. If Backup also fails, show Main's error (with "backup also failed: ..." appended).

## Approaches

- **A. Separate callers plus a router (picked).** Keep `callClaude()` unchanged, add `callOpenAI()` beside it, and add `callAI()` that orders the providers by priority and keys present, then applies the switching rules. The three message handlers call `callAI()`. Claude behaviour stays the same; each provider's quirks stay in its own function.
- **B. Send everything in OpenAI's format via Anthropic's compatibility endpoint.** Less code, but Claude loses `output_config.effort: low`, browser access is less certain, and the code that works today gets rewritten. Rejected.

## What changes

- `background.js`: `callOpenAI(system, content, maxTokens)` posting to `https://api.openai.com/v1/chat/completions` with `system` as a system message. It converts Anthropic-style content blocks (`image` base64 → `image_url` data URL, `text` → `text`) and maps errors to the same `{error, message}` shape (`no_key`, `bad_key`, `network`, `api`, `refusal`, `empty`). The "About me" append moves into `callAI()` so both providers get it. `callAI()` returns `{..., provider, backup: true}` when Backup answered.
- `options.html` / `options.js`: second key field "OpenAI API key", a "Main provider" choice (Claude / OpenAI, only meaningful when both keys are set), and an OpenAI model list beside the Claude one. Existing storage key `apiKey` stays the Anthropic key, so no migration is needed. New keys: `openaiKey`, `openaiModel`, `mainProvider` (default `anthropic`). **Test key** tests each filled-in key on its own and reports both results.
- `content.js`: where a result is inserted or shown, append " · via OpenAI (backup)" (or Claude) to the toast when `res.backup` is set. Error toasts' "Open settings" also fires for OpenAI key errors.
- `manifest.json`: add `https://api.openai.com/*` to `host_permissions`.
- `README.md`: features list and the Privacy section name both providers and the backup behaviour.
- `test/background.test.js`: tests for provider order (one key / both keys / main choice), switch-vs-no-switch errors, and the image block conversion.

## Non-goals

- No asking before using Backup (the user chose a silent note).
- No more than two providers, no per-feature provider choice, no load balancing.
- No changes to prompts.

## Left to the builder

- The OpenAI model list and its default: use a small, cheap current model as default (like Haiku for Claude), checked against OpenAI's model list at build time.
- Exact OpenAI request parameters (e.g. `max_completion_tokens` vs `max_tokens`) per the current API docs.
