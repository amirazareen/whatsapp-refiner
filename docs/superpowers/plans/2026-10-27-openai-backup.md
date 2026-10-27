# OpenAI Key with Main/Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the extension use an Anthropic key, an OpenAI key, or both, with the user's Main choice tried first and the other used silently as Backup.

**Architecture:** `callClaude()` stays; `callOpenAI()` is added beside it in `background.js`. A router `callAI()` picks the providers that have keys, orders them by `mainProvider`, adds the About-me note once, and falls back on switchable errors. The three message handlers call `callAI()`. The content script only adds a "via … (backup)" note.

**Tech Stack:** Chrome MV3 extension, plain JS, `node --test` with `vm` + fake `chrome`/`fetch`.

**Spec:** `docs/superpowers/specs/2026-10-27-openai-backup-design.md`

## Global Constraints

- Storage: `apiKey` stays the Anthropic key (no migration). New: `openaiKey`, `openaiModel`, `mainProvider` (`"anthropic"` | `"openai"`, default `"anthropic"`).
- Only providers with a non-empty key are tried. One key → that provider only, no backup.
- Switch to Backup only on error codes `network`, `bad_key`, `limit`, `server`. Never on `refusal`, `empty`, or other `api` errors.
- If Backup also fails, return Main's result with `message` + ` (Backup also failed: <backup message>)`.
- Backup success returns `{ ..., provider, backup: true }`. Note text: `via OpenAI (backup)` / `via Claude (backup)`.
- No prompt text changes. `callClaude` request body stays byte-identical apart from moving the About-me append out of it.
- Status → code mapping, both providers: 401/403 → `bad_key`, 402/429 → `limit`, ≥500 (incl. 529) → `server`, other non-OK → `api`.

## Review Focus

- Both keys set but Main's key empty string after trim → treated as missing; Backup acts alone, no `backup: true` flag.
- Main refuses (`refusal`) → no second request is sent (privacy: chat not sent to a second company).
- Draft reply with images on OpenAI → images arrive as `image_url` data URLs, text block kept.
- Test-key with `provider` set → only that provider is called, even if it fails with a switchable error.
- Neither key → `no_key` error whose message names both providers, so "Open settings" still shows.

---

### Task 1: `callOpenAI` and shared error codes

**Files:**
- Modify: `background.js` (`callClaude` status mapping; new `toOpenAIContent`, `callOpenAI`)
- Test: `test/background.test.js`

**Interfaces:**
- Produces: `callOpenAI(system: string, content: string | Block[], maxTokens = 4096) => Promise<{text} | {error, message}>`; reads `openaiKey`, `openaiModel` from storage. `toOpenAIContent(content) => string | OpenAIPart[]`. Both providers return error codes from the Global Constraints mapping.

- [ ] **Step 1: Make `load()` in the test file route by URL**

New signature `load(storage = {}, reply = "ok", responses = {})`. Change the fake `fetch` to record `{ url, body }` and to answer from the `responses` map keyed by `"anthropic"` / `"openai"` (match on URL containing `anthropic.com` / `openai.com`), each `{ status, body }`. Default anthropic reply keeps today's shape; default openai reply is `{ choices: [{ message: { content: reply }, finish_reason: "stop" }] }`. Keep `sent` as the list of parsed bodies so existing tests pass unchanged; add `calls` with URLs. Default storage still has `apiKey: "test-key"`.

- [ ] **Step 2: Write failing tests**

```js
test("toOpenAIContent converts image blocks to data URLs", () => {
  const { ctx } = load();
  const out = ctx.toOpenAIContent([
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
    { type: "text", text: "hi" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
    { type: "text", text: "hi" },
  ]);
  assert.equal(ctx.toOpenAIContent("plain"), "plain");
});

test("callOpenAI sends system + user and reads choices", async () => {
  const { ctx, calls } = load({ openaiKey: "sk-o", openaiModel: "m1" }, "done");
  const r = await ctx.callOpenAI("SYS", "hello", 1500);
  assert.equal(r.text, "done");
  assert.match(calls[0].url, /api\.openai\.com\/v1\/chat\/completions/);
  assert.equal(calls[0].body.model, "m1");
  assert.deepEqual(calls[0].body.messages.map((m) => m.role), ["system", "user"]);
});

test("status codes map to the same error codes for both providers", async () => {
  for (const [status, code] of [[401, "bad_key"], [429, "limit"], [529, "server"], [400, "api"]]) {
    const err = { error: { message: "x" } };
    const { ctx } = load({ openaiKey: "sk-o" }, "ok", { anthropic: { status, body: err }, openai: { status, body: err } });
    assert.equal((await ctx.callClaude("s", "c")).error, code);
    assert.equal((await ctx.callOpenAI("s", "c")).error, code);
  }
});
```

- [ ] **Step 3: Run tests, expect the 3 new ones to fail**

Run: `node --test test/background.test.js`
Expected: FAIL, `ctx.toOpenAIContent is not a function` / `ctx.callOpenAI is not a function`.

- [ ] **Step 4: Implement**

- `callClaude`: replace `res.status === 401 ? "bad_key" : "api"` with a shared `errorCode(status)` per the mapping.
- `callOpenAI`: POST `https://api.openai.com/v1/chat/completions`, header `authorization: Bearer <openaiKey>`, body `{ model: openaiModel || DEFAULT_OPENAI_MODEL, max_completion_tokens: maxTokens, messages: [{role:"system", content: system}, {role:"user", content: toOpenAIContent(content)}] }`. Messages say "OpenAI API error…". `finish_reason === "content_filter"` or a `message.refusal` → `{error:"refusal"}`. Empty text → `empty`. Missing key → `no_key`.
- `DEFAULT_OPENAI_MODEL`: check https://platform.openai.com/docs/models at build time and pick the smallest, cheapest current chat model that accepts image input; use the same id as the first option in Task 3.

- [ ] **Step 5: Run tests, expect all pass**

Run: `node --test test/background.test.js`
Expected: all tests pass, including the 5 existing ones.

- [ ] **Step 6: Commit**

```bash
git add background.js test/background.test.js
git commit -m "Add OpenAI caller and shared API error codes"
```

### Task 2: `callAI` router with main/backup

**Files:**
- Modify: `background.js` (new `callAI`; About-me moves here; handlers use it; `no_key` message)
- Test: `test/background.test.js`

**Interfaces:**
- Consumes: `callClaude`, `callOpenAI` from Task 1.
- Produces: `callAI(system, content, maxTokens = 4096, only?: "anthropic" | "openai") => Promise<{text, provider, backup?: true} | {error, message}>`. Message `{type:"refine", provider?}` passes `msg.provider` as `only`. Content script reads `res.backup` and `res.provider`.

- [ ] **Step 1: Write failing tests**

```js
const fail = (status) => ({ status, body: { error: { message: "boom" } } });

test("one key: only that provider is used", async () => {
  const { calls, send } = load({ apiKey: "", openaiKey: "sk-o" });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /openai/);
  assert.equal(r.backup, undefined);
});

test("both keys: main goes first, backup on switchable error", async () => {
  const { calls, send } = load({ openaiKey: "sk-o", mainProvider: "openai" }, "ok", { openai: fail(429) });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.deepEqual(calls.map((c) => /openai/.test(c.url) ? "o" : "a"), ["o", "a"]);
  assert.equal(r.backup, true);
  assert.equal(r.provider, "anthropic");
});

test("refusal does not switch to backup", async () => {
  const refused = { status: 200, body: { stop_reason: "refusal", content: [] } };
  const { calls, send } = load({ openaiKey: "sk-o" }, "ok", { anthropic: refused });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(calls.length, 1);
  assert.equal(r.error, "refusal");
});

test("both fail: main error with backup error appended", async () => {
  const { send } = load({ openaiKey: "sk-o" }, "ok", { anthropic: fail(500), openai: fail(401) });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(r.error, "server");
  assert.match(r.message, /Backup also failed: OpenAI API error/);
});

test("provider override tests one key only, no fallback", async () => {
  const { calls, send } = load({ openaiKey: "sk-o" }, "ok", { openai: fail(401) });
  const r = await send({ type: "refine", text: "x", tone: "polished", provider: "openai" });
  assert.equal(calls.length, 1);
  assert.equal(r.error, "bad_key");
});

test("no keys names both providers", async () => {
  const r = await load({ apiKey: "" }).send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(r.error, "no_key");
  assert.match(r.message, /Anthropic.*OpenAI/);
});
```

Also extend "About me reaches refine, reply and summary prompts" with an OpenAI-only run asserting the system message content matches `/About the user/`.

- [ ] **Step 2: Run tests, expect the new ones to fail**

Run: `node --test test/background.test.js`
Expected: FAIL on the 6 new tests (handlers still call `callClaude`).

- [ ] **Step 3: Implement `callAI`**

Read `apiKey`, `openaiKey`, `mainProvider`, `aboutMe`; trim keys. Build order `[main, other]` filtered to providers with keys (or `[only]` when given). Empty → `no_key` "Add an Anthropic or OpenAI API key in the extension options." Append About-me to `system` once (remove it from `callClaude`). Call first; on success return `{...res, provider}`; if `res.error` is in the switch set and a second provider exists, call it, returning `{...res2, provider, backup: true}` or Main's error with the appended message. Switch the three handlers from `callClaude` to `callAI`, passing `msg.provider` for refine.

- [ ] **Step 4: Run tests, expect all pass**

Run: `node --test test/background.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add background.js test/background.test.js
git commit -m "Route requests through main/backup provider"
```

### Task 3: Settings, manifest, README

**Files:**
- Modify: `options.html`, `options.js`, `manifest.json`, `README.md`

**Interfaces:**
- Consumes: storage keys from Global Constraints; `{type:"refine", provider}` from Task 2.

- [ ] **Step 1: Settings page**

`options.html`: rename label to "Anthropic API key"; add "OpenAI API key" (`id="openaiKey"`, `type="password"`, placeholder `sk-...`); add "Main provider" `<select id="mainProvider">` (Claude / OpenAI) with hint "Used first when both keys are set. The other is the backup."; rename `model` label to "Claude model"; add "OpenAI model" `<select id="openaiModel">` with 2–3 current models, the Task 1 default first. `options.js`: load/save the new keys (defaults `"anthropic"` and `DEFAULT_OPENAI_MODEL`'s id).

- [ ] **Step 2: Test key per provider**

`options.js` Test button: for each provider with a filled key, send `{type:"refine", text, tone:"polished", provider}` and show one line per provider (`Claude: works ("…")` / `OpenAI: <error>`). None filled → "Add at least one API key."

- [ ] **Step 3: Manifest and README**

`manifest.json`: add `"https://api.openai.com/*"` to `host_permissions`; bump `version` to `1.1.0`. `README.md`: features line about OpenAI keys and main/backup; install step 4 says either key; Privacy section says requests go to Anthropic or OpenAI (whichever is Main), and to the Backup only when Main fails.

- [ ] **Step 4: Verify manually**

Reload the extension in `chrome://extensions`, open options. Expected: both key fields and selects load and save; Test reports per provider; no console errors on the options page.

- [ ] **Step 5: Commit**

```bash
git add options.html options.js manifest.json README.md
git commit -m "Settings for OpenAI key and main provider"
```

### Task 4: "via backup" note in WhatsApp

**Files:**
- Modify: `content.js` (`refineDraft`, `showPicker` call, draft-reply handler, `summarizeChat`)

**Interfaces:**
- Consumes: `res.backup`, `res.provider` from Task 2.

- [ ] **Step 1: Add the note**

Add `const via = (res) => res.backup ? ` · via ${res.provider === "openai" ? "OpenAI" : "Claude"} (backup)` : "";` near `showError`. Append `via(res)` to the success toast text in refine (`"Refined. …"`), the picker insert (pass the note into `showPicker` as a 4th arg), the reply (`"Reply drafted. …"`), and to the catch-up summary title.

- [ ] **Step 2: Verify manually**

In settings, set Main to OpenAI with a deliberately wrong OpenAI key and a valid Claude key; reload WhatsApp Web. Refine a draft. Expected: text is inserted and the toast ends with "· via Claude (backup)". Restore the key: no note.

- [ ] **Step 3: Run tests**

Run: `node --test test/background.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "Show which provider answered when backup was used"
```
