# Privacy Policy: Text Refiner for WhatsApp Web

Effective date: 7 November 2026

Text Refiner for WhatsApp Web ("the extension") is a browser extension that adds AI writing help to WhatsApp Web. It is not affiliated with WhatsApp or Meta. This policy explains what data the extension handles, where it goes and what it never does.

## Summary

- The extension has **no server of its own** and **no analytics**. The developer never receives your messages, keys or settings.
- Chat content is sent **only when you click one of its buttons**, and only to the AI provider whose API key **you** entered: Anthropic (Claude) or OpenAI.
- Your settings stay in your browser's local extension storage.

## Data sent to your AI provider, and when

Nothing is sent until you click a button or press the hotkey. Each action sends the following to your main provider (`api.anthropic.com` or `api.openai.com`):

| You click | What is sent |
|---|---|
| ✨ Refine, or Alt+R | The text in the message box. Unless you turn off "Use chat context when refining", also the last 12 messages of the open chat (text only), and the message you are replying to if you use WhatsApp's Reply. |
| 💬 Draft reply | Up to about 25 loaded messages around the chosen message, plus up to 15 of your own older messages in that chat as style examples. This includes senders' names, times and quoted text. Also up to 4 pictures from the chosen message. |
| 💡 Explain | The same nearby messages and up to 4 pictures from that message, without style examples. |
| 📝 Catch me up | Up to the last 60 loaded messages of the open chat (text, names and times). |

With every request, the extension also sends your **"About me" note**, if you wrote one. Refine requests also include the chosen **tone**.

If you enter both an Anthropic and an OpenAI key, and your main provider fails (network error, timeout, invalid key, out of credit, rate limit or outage), the same request is sent once to the other provider. It is not resent when the AI declines a request.

These messages may include **other people's** messages and pictures. Only use the features in chats where you are comfortable sharing that content with your AI provider.

Anthropic and OpenAI process these requests under their own terms and privacy policies, and under the API account that belongs to your key.

## Data stored on your device

The extension saves the following in your browser's local extension storage (`chrome.storage.local`). It is never sent to the developer.

- Your Anthropic and/or OpenAI **API keys**, the chosen models and the main provider
- Your settings: default tone, "Use chat context when refining", and your "About me" note
- A list of **chat names with the tone you last picked** in each chat, used to remember tones per chat

The extension does not save chat messages, drafts, replies, explanations or summaries. They exist only on the open WhatsApp Web page and in your provider's API request.

One exception: if putting text into the message box fails, the extension writes a troubleshooting warning to the browser's extension error log. That warning includes the draft and the text it tried to insert. The log stays on your device, is never sent anywhere, and can be cleared on the extension's **Errors** page in `chrome://extensions`. Other warnings describe only the page layout, never message text.

## Clipboard

The **📋 Copy** and **📋 Copy for AI** buttons put an explanation or chat summary on your clipboard only when you click them. If you paste that text elsewhere, for example into another AI tool, that service receives it under its own terms.

## What the extension never does

- It never sends messages on WhatsApp for you. Every result goes into the message box or a private panel for you to review.
- It does not sell, rent or share your data with anyone other than the AI provider you chose, as described above.
- It does not use your data for advertising, profiling or creditworthiness, and it does not let people read your data, beyond the request you start.
- It does not load or run code from outside the extension.

The use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## Removing your data

- **Settings and keys:** clear the fields on the extension's settings page, or remove the extension. Removing it deletes its local storage.
- **Requests already sent to Anthropic or OpenAI:** these are handled under your account with that provider.

## Changes

Any change to this policy is published in this file, with a new effective date. The file's history is on GitHub.

## Contact

Open an issue at https://github.com/amirazareen/whatsapp-refiner/issues
