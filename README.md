# Text Refiner for WhatsApp Web

> Not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of WhatsApp LLC.

A Chrome/Edge extension that refines your WhatsApp Web drafts with Claude or OpenAI before you send them. Privacy policy: [PRIVACY.md](PRIVACY.md).

- **✨ Refine** button and ▾ tone picker next to the send button (also in the "Edit message" box and the photo/video caption box). Clicking ✨ shows 3 versions to pick from (shorter / best / different wording)
- **Alt+R** hotkey while typing: refines and inserts one version straight away
- Tones: Polished, Friendly, Concise, Formal, Fix grammar only, → English, → Bahasa Melayu
- Each chat remembers the tone you last picked there
- Keeps the language you typed, except the → English / → Bahasa Melayu tones, which translate
- **About me** note in settings, sent with every request so results sound like you
- **📝 Catch me up:** button in the chat header that summarises the loaded messages and lists what is waiting for your answer. **📋 Copy for AI** copies the summary as a ready prompt (chat name, date, `<chat_summary>`, then a `Task:` line for you to fill in); the summary text can also be selected and copied
- **💬 Draft reply:** hover over any incoming message and click 💬. Claude reads the recent conversation and writes a reply to that message in your own style (learned from your messages in the chat), then puts it in the message box.
- **💡 Explain:** hover over any message (yours too) and click 💡. A private panel explains what the message or screenshot shows, with a **📋 Copy** button. Nothing is put in the message box or sent.
- Works with an **Anthropic (Claude) or OpenAI API key**, or both: pick the main one, and the other is used as a backup if the main one fails (bad key, out of credit, rate limit, outage). The message toast then says "via … (backup)"
- ✨ keeps @mentions as real tags (if one can't be kept, the toast tells you to re-tag it)
- Never sends anything for you: you review the result and press Enter yourself
- **Undo** in the toast, or Ctrl+Z

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Click the extension's toolbar icon to open settings. Paste an Anthropic and/or OpenAI API key, choose the main provider if you set both, then click **Test keys**.
5. Open (or reload) https://web.whatsapp.com.

## Privacy

Your draft is sent to your main provider (`api.anthropic.com` or `api.openai.com`) only when you click ✨ or press Alt+R. Unless you untick "Use chat context when refining" in settings, the last 12 messages of the open chat (text only) are sent with it so the rewrite fits the conversation. When you click 💬, the open chat's recently loaded messages (up to about 25 around the chosen one, plus up to 15 of your older messages there as style examples), with the senders' names and times, are sent too. That includes the other person's messages, any quoted text, and up to 4 pictures from the message you're replying to (so the AI can read screenshots). When you click 💡, the same nearby messages and up to 4 pictures of that message are sent (no style examples). When you click 📝, up to the last 60 loaded messages of the open chat (text, names and times) are sent. Your "About me" note, if set, is sent with every request. **📋 Copy for AI** and **📋 Copy** only put text on your clipboard; if you paste it into another AI tool, that tool receives a summary of other people's messages. If both keys are set and the main provider fails (network error, bad key, out of credit, rate limit or outage), the same request is sent to the other provider; it is not resent when the AI declines a request. The API keys are kept in the browser's local extension storage. There is no analytics or other network traffic.

## Troubleshooting

- **No ✨ button:** reload WhatsApp Web after installing or updating the extension. WhatsApp sometimes changes its page layout; the selectors are in `findEditor()` in `content.js`.
- **"Extension was reloaded":** refresh the WhatsApp tab. It can also show when a request takes longer than about 30 seconds (Chrome stops the extension's background worker), for example 📝 on a long chat with Sonnet or Opus: try again, or pick a faster model in settings.
- **"Network error: could not reach …":** no connection, or the AI did not answer within 90 seconds. If both keys are set, the backup provider is tried automatically.
- **No 💬 / 💡 / ✨ in some box:** WhatsApp may have changed its layout. Check the extension's **Errors** page in `chrome://extensions` for a `[WhatsApp Refiner]` warning. The layout warnings list only the page structure needed to fix the selectors, never message text (the "insert failed" warning does include your draft).

## Tests

```bash
node --test test/background.test.js
```

## Publishing

See [STORE.md](STORE.md) for the Chrome Web Store upload zip command, listing text and privacy answers.
