# Keep @mentions after ✨ refine — design

**Size:** small change. **Date:** 2026-11-02.

## Intent

A refine turns `@Redha DIGICERT` into plain text, so the person is no longer tagged or notified. Tags must survive a refine (and Undo), so group-chat drafts can be refined safely.

## Confirmed on real WhatsApp Web (2026-11-02 test)

- A tag in the compose box is `span[data-app-text-template="​<id>@lid​"]`; its text is the shown name (`@Redha DIGICERT`).
- A synthetic `copy` event on the selected draft fills `application/whatsapp` (plus `text/html`, `text/plain`). `application/whatsapp` is the plain draft with each tag written as its `​<id>@lid​` marker.
- A synthetic `paste` of `application/whatsapp` (+ `text/plain`) recreates real tags, including inside new text and across line breaks.
- A `text/plain`-only paste (today's behaviour) keeps the words but drops the tag: 1 tag → 0.

## Behaviour (decided with the user)

- Tags are kept through ✨ (picker and Alt+R) and Undo.
- If the AI's version leaves out a tag, it is put back at the **start** of the message.
- If tags can't be kept (WhatsApp's copy format missing, or fewer tags after inserting than expected), insert as plain text as today and warn in the toast: "Tags became plain text: re-tag @Name before sending."

## Approaches

- **A. Re-type tags via WhatsApp's @ suggestion list.** Fragile timing, same-name clashes, visible typing. Rejected.
- **B. Use WhatsApp's own copy/paste format (picked).** Copy the draft as `application/whatsapp`, swap markers for `{M1}`-style placeholders before sending to the AI, swap them back after, paste as `application/whatsapp`. Native tags, AI never sees ids.
- **C. Only warn.** Kept as B's fallback.

## What changes

- `content.js`
  - `copyDraft(editor) -> { wa, mentions: [{token, name}] } | null`: select all, dispatch `copy` with a `DataTransfer`, read `application/whatsapp`; names from the matching `[data-app-text-template]` spans. `null` when the format is missing.
  - Before refining: replace each marker with `{M1}`, `{M2}`… (same marker → same placeholder) and send that text.
  - After refining: add any missing placeholder at the start (`{M1} {M2} ` + text), then build `wa` (placeholder → marker) and `plain` (placeholder → name).
  - Picker shows the `plain` form.
  - `setDraft(editor, text, wa?)`: when `wa` is given, the paste strategy sets `application/whatsapp` too; verification keeps comparing visible text. After success, check the tag count; if lower than expected, warn as above.
  - Undo restores with the original `wa`, so tags come back.
- `background.js`: refine prompt adds "Keep placeholders like {M1} exactly as they are; they are @mentions." Test for it.
- No change to 💬 draft reply (it writes new text with no existing tags) or catch-up.

## Non-goals

- Adding new tags the AI suggests, or tagging in 💬 replies.
- Keeping other rich formatting beyond what `application/whatsapp` already carries.

## Left to the builder

- Exact marker regex (match `​…@<domain>​`, not only `@lid`).
- Where the "tag put back at the start" note goes, if any (my call: no extra note; the tag is visible).
