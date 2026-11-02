# 💡 Explain this message — design

**Size:** small change. **Date:** 2026-11-02.

## Intent

In work chats people send screenshots of errors (e.g. Symantec "Malicious Site Blocked") and short technical messages. The user wants a private, one-click explanation of what a message or screenshot shows, without drafting or sending anything.

## Behaviour (decided with the user)

- 💡 appears on hover over **every** message, with or without pictures. On incoming messages it sits next to 💬; on the user's own messages (e.g. a forwarded screenshot) only 💡 shows.
- Clicking 💡 shows a **private panel** with an explanation of what the message/screenshot shows. Nothing goes into the message box, nothing is sent.
- Focus is **explanation** ("what am I looking at"), not troubleshooting steps.

## My calls (proposed, not objected to)

- Panel styled like the 📝 catch-up panel, with ✕ to close; title `💡 Explanation` plus the usual "via … (backup)" note.
- Reads the message's pictures (up to 4), its text/caption, and the nearby messages, the same window 💬 uses, so it knows who and what "the file" is. No style examples (not needed).
- Answer in the chat's main language; 2–5 short sentences; explain technical terms on first use; don't invent facts; say plainly when a picture is unreadable.
- Max output 800 tokens.

## Approaches

- **A. Second hover button 💡 beside 💬 (picked).** One click, reuses the 💬 hover code, 💬 unchanged.
- **B. One hover button with a 💬/💡 menu.** Tidier, but two clicks for everything and changes 💬. Rejected.
- Right-click menu: dropped, WhatsApp's own message menu is fragile to extend.

## What changes

- `background.js`: `EXPLAIN_SYSTEM_PROMPT`; message `{ type: "explain", messages, targetIndex, images }` → `callAI(EXPLAIN_SYSTEM_PROMPT, …, 800)`. Build the content with the same TARGET-marked conversation + image blocks as `replyUserContent`, ending with "Explain the TARGET message for me." (share the builder, don't copy it). Tests: prompt/limit, images attached, About me included.
- `content.js`: `ensureExplainBtn` next to `ensureReplyBtn`; hover shows 💡 on all rows and 💬 only on others' rows; click → `replyContext` minus style examples → `explain` → panel. Turn the catch-up panel code into a shared `showPanel(title, text)` used by both.
- `content.css`: 💡 button styles (copy of `.wr-reply-btn`'s look), offset so the two don't overlap.
- `README.md`: feature line, and the Privacy section says what 💡 sends (the message's pictures and nearby messages, like 💬).

## Non-goals

- Troubleshooting steps or "what to reply" (💬 does replies).
- Follow-up questions in the panel.
- Explaining messages that aren't loaded in the chat.

## Left to the builder

- Exact button offset and hover timing (match 💬).
- Panel max height / scrolling.
