# Keep @mentions after refine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ✨ refine (picker, Alt+R) and Undo keep WhatsApp @mention tags as real tags.

**Architecture:** The content script copies the draft in WhatsApp's `application/whatsapp` format (tags as `​<id>@<domain>​` markers) and sends it with the tag list. `background.js` swaps markers for `{M1}` placeholders before the AI call, swaps them back after (re-adding missing ones at the start), and returns both a plain version (names) and a `wa` version (markers). The content script pastes `wa` as `application/whatsapp`, then checks the tag count.

**Tech Stack:** Chrome MV3 extension, plain JS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-02-keep-mentions-design.md`

## Global Constraints

- Marker regex: `/​[^​\s]+@[a-z.]+​/g` (not only `@lid`).
- Placeholders `{M1}`, `{M2}`… in order of first appearance; the same marker always gets the same placeholder.
- Missing placeholders are prepended in order, each followed by a space: `{M1} {M2} ` + text.
- The AI never receives a marker or contact id.
- Warning copy, exact: `Tags became plain text: re-tag ${names} before sending.` where `names` is the tag names joined with `", "`.
- No change to 💬 draft reply or catch-up.

## Review Focus

- Draft with no tags → request and result identical to today (no `wa`, no `mentions` sent).
- Same person tagged twice → one placeholder, both restored.
- AI returns a placeholder twice → both become tags (accepted; WhatsApp allows it).
- `copyDraft` returns null (format missing) → plain flow as today plus the warning toast if the draft visibly had tags (`[data-app-text-template]` present).
- Undo after a tagged refine → original tags come back.

---

### Task 1: Mask and unmask mentions in `background.js`

**Files:**
- Modify: `background.js` (new `maskMentions`, `unmaskMentions`; refine handler; refine prompt line 27)
- Test: `test/background.test.js`

**Interfaces:**
- Produces: refine message accepts optional `wa: string` (draft with markers) and `mentions: [{ token, name }]`. When `mentions?.length`, the response adds `wa: string` (single) or `was: string[]` (parallel to `versions`); `text` / `versions` hold the plain form with names.
- `maskMentions(wa, mentions) => string`, `unmaskMentions(text, mentions) => { text, wa }`.

- [ ] **Step 1: Write failing tests**

```js
const M = [{ token: "​111@lid​", name: "@Redha DIGICERT" }, { token: "​222@lid​", name: "@Aiden" }];

test("maskMentions swaps markers for placeholders, same marker same placeholder", () => {
  const { ctx } = load();
  assert.equal(ctx.maskMentions(`Hi ${M[0].token} and ${M[1].token}, ${M[0].token}`, M), "Hi {M1} and {M2}, {M1}");
});

test("unmaskMentions restores names and markers, prepending missing ones", () => {
  const { ctx } = load();
  const r = ctx.unmaskMentions("Please check, {M2}", M);
  assert.equal(r.text, "@Redha DIGICERT Please check, @Aiden");
  assert.equal(r.wa, `${M[0].token} Please check, ${M[1].token}`);
});

test("refine with mentions never sends markers and returns wa versions", async () => {
  const { sent, send } = load({}, "short {M1}\n---\nbest {M1}\n---\nother");
  const r = await send({ type: "refine", text: "hi @Redha DIGICERT", wa: `hi ${M[0].token}`, mentions: [M[0]], tone: "polished", variants: true });
  assert.doesNotMatch(JSON.stringify(sent[0]), /111@lid/);
  assert.match(sent[0].system, /\{M1\}/);
  assert.deepEqual([...r.versions], ["short @Redha DIGICERT", "best @Redha DIGICERT", "@Redha DIGICERT other"]);
  assert.equal(r.was[2], `${M[0].token} other`);
});

test("refine without mentions is unchanged", async () => {
  const { sent, send } = load();
  const r = await send({ type: "refine", text: "hi", tone: "polished" });
  assert.equal(sent[0].messages[0].content, "hi");
  assert.equal(r.wa, undefined);
});
```

- [ ] **Step 2: Run, expect the 3 mention tests to fail**

Run: `node --test test/background.test.js`
Expected: FAIL, `ctx.maskMentions is not a function`.

- [ ] **Step 3: Implement**

`maskMentions` / `unmaskMentions` per Global Constraints. Refine handler: when `msg.mentions?.length`, use `maskMentions(msg.wa, msg.mentions)` as the draft text passed to `refineUserContent`, and map the result (`text`, each of `versions`, and the fallback first-part path) through `unmaskMentions`. Prompt: when mentions are present, add "Placeholders like {M1} are @mentions: keep each one exactly as written." (only then, so tag-free prompts stay byte-identical).

- [ ] **Step 4: Run, expect all pass**

Run: `node --test test/background.test.js`
Expected: all pass (22).

- [ ] **Step 5: Commit**

```bash
git add background.js test/background.test.js
git commit -m "Keep @mention placeholders through refine"
```

### Task 2: Copy and paste tags in `content.js`

**Files:**
- Modify: `content.js` (`copyDraft` new; `paste`, `STRATEGIES.paste`, `setDraft`, `insertWithUndo`, `refineDraft`, `showPicker`)
- Modify: `README.md` (one line: tags are kept)

**Interfaces:**
- Consumes: Task 1 message/response fields.
- Produces: `copyDraft(editor) => Promise<{ wa, mentions } | null>`; `setDraft(editor, text, wa?)`; `insertWithUndo(ed, text, previous, doneMessage, { wa, previousWa, mentions } = {})`.

- [ ] **Step 1: Implement**

- `copyDraft`: `selectAll`, dispatch `copy` with a `DataTransfer`, read `application/whatsapp`; `null` if empty. `mentions`: unique markers in order, `name` = text of the editor's `[data-app-text-template="<token>"]` span (fallback `"@"`).
- `paste(editor, text, wa)`: also `setData("application/whatsapp", wa)` when given; `STRATEGIES.paste` passes it through; `setDraft(editor, text, wa)` forwards to strategies (others ignore it).
- `refineDraft`: call `copyDraft` only when the editor has a `[data-app-text-template]`; if it returns null, send no `wa`/`mentions` and pass the visible tags (`{ token: null, name }` per span) as `mentions` to `insertWithUndo`, so its tag-count check warns. Send `wa` and `mentions` when present. Pass `res.wa` / `res.was[i]` into insert, and the original `wa` as `previousWa` for Undo.
- `insertWithUndo`: after a successful `setDraft`, if `mentions.length` and the editor's `[data-app-text-template]` count is lower, replace the done message with the warning copy (Global Constraints). Undo calls `setDraft(ed, previous, previousWa)`.
- `showPicker(editor, original, versions, note, was = [], extra)`: pass `was[i]` on insert.
- README features line: "✨ keeps @mentions as real tags."

- [ ] **Step 2: Syntax and suite**

Run: `node -e "new Function(require('fs').readFileSync('content.js','utf8'))" && node --test test/background.test.js`
Expected: no error, all pass.

- [ ] **Step 3: Verify on real WhatsApp (Claude in Chrome, the user's draft only)**

Reload the extension. With a draft containing one tag, click ✨ and pick a version. Expected: `[data-app-text-template]` count stays 1 and the name is green; Undo brings back the original with 1 tag. Do not send.

- [ ] **Step 4: Commit**

```bash
git add content.js README.md
git commit -m "Keep @mention tags when inserting refined text"
```
