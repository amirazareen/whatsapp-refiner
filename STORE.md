# Chrome Web Store submission kit

Copy-paste answers for the Developer Dashboard (https://chrome.google.com/webstore/devconsole). Keep this file in sync with `PRIVACY.md` and the code.

## 1. Package

Commit everything first, then from this folder run:

```bash
git archive --format=zip -o text-refiner.zip HEAD manifest.json background.js content.js content.css options.html options.js icons
```

Upload `text-refiner.zip`. Only committed files go in, without tests or docs. Raise `version` in `manifest.json` before every new upload.

## 2. Store listing tab

**Name** (from the manifest): Text Refiner for WhatsApp Web

**Summary** (from the manifest description, max 132 characters):
AI writing help for WhatsApp Web: refine drafts, draft replies, explain messages, catch up on chats. Not affiliated with WhatsApp.

**Category:** Productivity → Communication. Any Productivity sub-category is fine.

**Description:**

```
Write better WhatsApp Web messages with AI, using your own Anthropic (Claude) or OpenAI API key.

• ✨ Refine: polish your draft next to the send button. Pick a tone (Polished, Friendly, Concise, Formal, Fix grammar only, → English, → Bahasa Melayu) and choose from 3 versions. Alt+R refines straight away. Works in the message box, the "Edit message" box and photo/video captions. @mentions are kept.
• 💬 Draft reply: hover over a message and get a reply written in your own style, learned from your messages in that chat.
• 💡 Explain: get a private explanation of a message or screenshot, with a Copy button.
• 📝 Catch me up: summarise a long chat and see what is waiting for your answer. "Copy for AI" turns the summary into a ready prompt for any AI tool.
• Each chat remembers its tone. An optional "About me" note makes results sound like you.
• Set both keys to use one provider as an automatic backup for the other.

Nothing is ever sent for you: every result goes into the message box or a private panel for you to review. Data is sent only when you click, and only to the AI provider whose key you entered. There are no analytics and no developer server.

You need your own API key from console.anthropic.com or platform.openai.com. API usage is billed by that provider.

Not affiliated with, endorsed by or sponsored by WhatsApp or Meta. WhatsApp is a trademark of WhatsApp LLC.
```

**Icon:** `icons/icon128.png`

**Screenshots** (at least one, 1280×800 or 640×400, PNG or JPEG). Use a test chat or blur names and photos, so no private conversation is shown:
1. The ✨▾ pill next to the send button, with the 3-version picker open
2. 💬 or 💡 on hover, with the drafted reply or explanation panel
3. The 📝 catch-up panel with the "Copy for AI" button

**Small promo tile** (440×280): optional for Unlisted, recommended for Public.

**Language:** English

## 3. Privacy practices tab

**Single purpose:**
AI writing help inside WhatsApp Web: it refines the user's drafts and, on request, drafts replies, explains messages and summarises chats, using the AI provider key the user supplies.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings locally: API keys, chosen models and provider, default tone, "About me" note, chat-context switch, and the tone remembered for each chat. |
| Host `https://api.anthropic.com/*` | Sends the user's request to the Anthropic (Claude) API with the user's own key, only when the user clicks a button or presses the hotkey. |
| Host `https://api.openai.com/*` | Sends the user's request to the OpenAI API with the user's own key, as the main provider or as a backup, only when the user clicks. |
| Content script on `https://web.whatsapp.com/*` | Adds the ✨, 💬, 💡 and 📝 buttons to WhatsApp Web, reads the draft or chat messages the user chose to process, and puts the result in the message box or a private panel. |

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage.** Tick these four. It is safer to declare too much than too little, because under-declaring is a common reason for rejection:
- **Personally identifiable information:** senders' names in the messages sent, and anything the user writes in "About me"
- **Personal communications:** the messages and pictures the user chooses to refine, reply to, explain or summarise
- **Authentication information:** the user's own API keys, stored locally and sent only to their provider
- **Website content:** the WhatsApp Web text and pictures the extension reads when the user clicks

Leave the rest unticked: health, financial and payment, location, web history, and user activity (no clicks, keystrokes or browsing are tracked). If the dashboard's category list differs from this one, use these four as the guide.

**Certifications.** Tick all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Sending the data to Anthropic or OpenAI counts as an approved use: it is needed for the feature the user asked for, and it goes to the provider the user chose.

**Privacy policy URL:**
https://github.com/amirazareen/whatsapp-refiner/blob/main/PRIVACY.md

## 4. Distribution tab

- **Visibility:** *Unlisted* (only people with the link) or *Public*
- **Regions:** All regions
- **Pricing:** Free

## 5. Notes for the reviewer (optional field)

```
To test: install, open the extension options, enter an Anthropic or OpenAI API key, click "Test keys", then open web.whatsapp.com and any chat. Type a draft and click ✨ next to the send button. Hover over a message for 💬 and 💡; click 📝 in the chat header. The extension never sends WhatsApp messages; results go into the message box or a private panel.
```
