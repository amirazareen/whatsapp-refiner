# WhatsApp Text Refiner

A Chrome/Edge extension that refines your WhatsApp Web drafts with Claude before you send them.

- **✨ Refine** button and ▾ tone picker next to the send button (also in the "Edit message" box). Clicking ✨ shows 3 versions to pick from (shorter / best / different wording)
- **Alt+R** hotkey while typing: refines and inserts one version straight away
- Tones: Polished, Friendly, Concise, Formal, Fix grammar only, → English, → Bahasa Melayu
- Each chat remembers the tone you last picked there
- Keeps the language you typed, except the → English / → Bahasa Melayu tones, which translate
- **About me** note in settings, sent with every request so results sound like you
- **📝 Catch me up:** button in the chat header that summarises the loaded messages and lists what is waiting for your answer
- **💬 Draft reply:** hover over any incoming message and click 💬. Claude reads the recent conversation and writes a reply to that message in your own style (learned from your messages in the chat), then puts it in the message box.
- Never sends anything for you: you review the result and press Enter yourself
- **Undo** in the toast, or Ctrl+Z

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Click the extension's toolbar icon to open settings. Paste your Anthropic API key, then click **Test key**.
5. Open (or reload) https://web.whatsapp.com.

## Privacy

Your draft is sent to `api.anthropic.com` only when you click ✨ or press Alt+R. Unless you untick "Use chat context when refining" in settings, the last 12 messages of the open chat (text only) are sent with it so the rewrite fits the conversation. When you click 💬, the open chat's recently loaded messages (up to about 25 around the chosen one, plus up to 15 of your older messages there as style examples), with the senders' names and times, are sent too. That includes the other person's messages, any quoted text, and up to 4 pictures from the message you're replying to (so Claude can read screenshots). When you click 📝, up to the last 60 loaded messages of the open chat (text, names and times) are sent. Your "About me" note, if set, is sent with every request. The API key is kept in the browser's local extension storage. There is no analytics or other network traffic.

## Troubleshooting

- **No ✨ button:** reload WhatsApp Web after installing or updating the extension. WhatsApp sometimes changes its page layout; the selectors are in `findEditor()` in `content.js`.
- **"Extension was reloaded":** refresh the WhatsApp tab.

## Tests

```bash
node --test test/background.test.js
```
