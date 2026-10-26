// Content script for web.whatsapp.com: adds a compact refine button + tone
// picker next to the send button (compose box and "Edit message" box), an
// Alt+R hotkey, and a 💬 draft-reply button on incoming messages.

(() => {
  const TONES = [
    ["polished", "Polished"],
    ["friendly", "Friendly"],
    ["concise", "Concise"],
    ["formal", "Formal"],
    ["grammar", "Fix grammar only"],
  ];
  const toneLabel = (v) => (TONES.find(([k]) => k === v) || TONES[0])[1];

  let currentTone = "polished";
  let busy = false;
  let toastTimer = null;

  chrome.storage.local.get(["defaultTone"], ({ defaultTone }) => {
    if (defaultTone) currentTone = defaultTone;
    syncToneUI();
  });

  // ---- Finding and reading the compose box ----

  function findEditor() {
    return (
      document.querySelector('footer div[contenteditable="true"]') ||
      document.querySelector('#main div[contenteditable="true"][data-tab]')
    );
  }

  // innerText drops emojis, which WhatsApp renders as <img alt="😘">,
  // so walk the DOM and use each image's alt text.
  function textOf(root) {
    let out = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "IMG") {
        out += node.alt || "";
        return;
      }
      if (node.tagName === "BR") {
        out += "\n";
        return;
      }
      if (node !== root && /^(P|DIV)$/.test(node.tagName) && out && !out.endsWith("\n")) {
        out += "\n";
      }
      node.childNodes.forEach(walk);
    };
    walk(root);
    return out.replace(/\u200b/g, "").trim();
  }
  const getDraft = textOf;

  // ---- Reading chat messages ----

  // WhatsApp's markup changes between versions, so a message is recognised
  // by any of several signals, most specific first:
  //  - .message-in / .message-out classes
  //  - data-id="false_…" (incoming) / "true_…" (mine)
  //  - an element with data-pre-plain-text="[10:21 AM, 16/10/2026] Name: "
  // and each one is normalised to its list row so lookups stay consistent.
  const MESSAGE_SIGNALS =
    '.message-in, .message-out, [data-id^="false_"], [data-id^="true_"], [data-pre-plain-text]';

  const chatPane = () => document.querySelector("#main") || document.body;

  function rowOf(el) {
    return (
      el.closest('[role="row"]') ||
      el.closest('[data-id^="false_"], [data-id^="true_"]') ||
      el.closest(".message-in, .message-out") ||
      el.closest("[data-pre-plain-text]")
    );
  }

  // Returns the row element if `el` is inside a chat message, else null.
  function messageRowAt(el) {
    if (!el?.closest || !chatPane().contains(el)) return null;
    const signal = el.closest(MESSAGE_SIGNALS);
    const row = signal ? rowOf(signal) : el.closest('[role="row"]');
    if (!row || !(row.matches(MESSAGE_SIGNALS) || row.querySelector(MESSAGE_SIGNALS))) return null;
    return row;
  }

  function isMine(row) {
    if (row.matches(".message-out") || row.querySelector(".message-out")) return true;
    if (row.matches(".message-in") || row.querySelector(".message-in")) return false;
    const idEl = row.matches("[data-id]") ? row : row.querySelector("[data-id]") || row.closest("[data-id]");
    const id = idEl?.getAttribute("data-id") || "";
    if (id.startsWith("true_")) return true;
    if (id.startsWith("false_")) return false;
    // Last resort: my messages sit on the right half of the chat.
    const pane = chatPane().getBoundingClientRect();
    const r = bubbleRect(row);
    return r.left + r.width / 2 > pane.left + pane.width / 2;
  }

  // A bubble can hold a quoted (replied-to) message above its own text, and
  // media with a caption. The quote is a clickable block at the top; the
  // message's own text is the last text block outside it.
  const QUOTE_STRONG = '[aria-label*="quot" i], [class*="quot" i], [data-testid*="quot" i]';

  function messageParts(row) {
    const spans = Array.from(row.querySelectorAll("span.selectable-text")).filter(
      (s) => !s.parentElement?.closest("span.selectable-text")
    );
    const last = spans[spans.length - 1];
    const inQuote = (s) => {
      const strong = s.closest(QUOTE_STRONG);
      if (strong && strong !== row && row.contains(strong)) return true;
      // A clickable block counts only if it doesn't also wrap the last text.
      const btn = s.closest('[role="button"]');
      return !!btn && btn !== row && row.contains(btn) && !btn.contains(last);
    };
    const own = spans.filter((s) => !inQuote(s));
    const main = own[own.length - 1] || (spans.length > 1 ? spans[spans.length - 1] : null);

    // The quote block: the highest ancestor of a quoted text that doesn't
    // also contain the main text (so it includes the quoted author's name).
    let quoteEl = null;
    const quoted = spans.find((s) => s !== main);
    if (quoted) {
      quoteEl = quoted;
      while (quoteEl.parentElement && quoteEl.parentElement !== row && !(main && quoteEl.parentElement.contains(main))) {
        quoteEl = quoteEl.parentElement;
      }
    }

    // Real pictures only: skip emojis, avatars and the quote's thumbnail.
    const images = Array.from(row.querySelectorAll("img")).filter((img) => {
      if (quoteEl?.contains(img) || main?.contains(img)) return false;
      const r = img.getBoundingClientRect();
      return r.width >= 60 && r.height >= 60;
    });
    return { main, quoteEl, images };
  }

  function readMessage(row) {
    const metaEl = row.querySelector("[data-pre-plain-text]") || (row.matches("[data-pre-plain-text]") ? row : null);
    const meta = metaEl?.getAttribute("data-pre-plain-text") || "";
    const m = meta.match(/^\[([^\]]*)\]\s*(.*?):\s*$/);
    const { main, quoteEl, images } = messageParts(row);
    const text = main ? textOf(main) : "";
    const quoted = quoteEl ? textOf(quoteEl).replace(/\s*\n\s*/, ": ").slice(0, 400) : "";
    return {
      fromMe: isMine(row),
      time: m ? m[1].split(",")[0].trim() : "",
      sender: m ? m[2] : "",
      text: text || (images.length ? "" : "[photo, sticker or other media]"),
      quoted,
      imageCount: images.length,
    };
  }

  // Encode a chat image as base64 JPEG (max 1280px). WhatsApp serves them as
  // same-origin blob: URLs, so the canvas isn't tainted.
  async function imageData(img) {
    try {
      await img.decode();
    } catch (e) {}
    if (!img.naturalWidth) return null;
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    try {
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    } catch (e) {
      return null; // tainted or not decodable
    }
  }

  function chatBubbles() {
    const rows = [];
    for (const el of chatPane().querySelectorAll(MESSAGE_SIGNALS)) {
      const row = rowOf(el);
      if (row && rows[rows.length - 1] !== row && !rows.includes(row)) rows.push(row);
    }
    return rows;
  }

  // The target message (with its pictures), up to 20 before it and 5 after,
  // plus older messages of mine as extra style examples.
  async function replyContext(target) {
    const all = chatBubbles();
    const idx = all.indexOf(target);
    const start = Math.max(0, idx - 20);
    const window_ = all.slice(start, idx + 6);
    const messages = window_.map(readMessage);
    const styleExamples = all
      .slice(0, start)
      .map(readMessage)
      .filter((m) => m.fromMe && m.text && !m.text.startsWith("[") && m.text.length < 300)
      .slice(-15)
      .map((m) => m.text);
    const images = [];
    for (const img of messageParts(target).images.slice(0, 4)) {
      const data = await imageData(img);
      if (data) images.push(data);
    }
    return { messages, targetIndex: idx - start, styleExamples, images };
  }

  const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();
  // Letters and digits only: ignores how emojis/spacing/punctuation render.
  const loose = (s) => s.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

  // ---- Replacing the text (Lexical-safe) ----

  // WhatsApp's editor (Lexical) keeps its own selection and re-renders the
  // DOM asynchronously, so we drive it through events it handles itself and
  // poll for the result.
  // rAF pauses in background tabs, so fall back to a timer.
  const nextFrame = () =>
    new Promise((resolve) => {
      let done = false;
      const go = () => !done && (done = true) && setTimeout(resolve, 0);
      requestAnimationFrame(go);
      setTimeout(go, 50);
    });

  async function waitFor(pred, ms = 800) {
    const end = performance.now() + ms;
    do {
      if (pred()) return true;
      await nextFrame();
    } while (performance.now() < end);
    return pred();
  }

  function pressKey(editor, key, code, opts = {}) {
    const e = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...opts });
    editor.dispatchEvent(e);
    return e.defaultPrevented; // true when Lexical handled it
  }

  // Select everything both in the DOM and in Lexical's own model
  // (Lexical handles Ctrl+A itself, without waiting for selectionchange).
  async function selectAll(editor) {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const handled = pressKey(editor, "a", "KeyA", { ctrlKey: true });
    await nextFrame();
    await nextFrame();
    return handled;
  }

  function paste(editor, text) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const e = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    editor.dispatchEvent(e);
    return e.defaultPrevented;
  }

  // Each strategy replaces the whole draft; the first one that verifies wins.
  const STRATEGIES = {
    // Keeps newlines and emojis.
    async paste(editor, text) {
      await selectAll(editor);
      return paste(editor, text);
    },
    // Empty the box first, so even an out-of-sync selection can't append.
    async clearThenInsert(editor, text) {
      await selectAll(editor);
      pressKey(editor, "Backspace", "Backspace");
      if (!(await waitFor(() => getDraft(editor) === "", 400))) return "not-cleared";
      return document.execCommand("insertText", false, text);
    },
    async insertText(editor, text) {
      await selectAll(editor);
      return document.execCommand("insertText", false, text);
    },
  };

  async function setDraft(editor, text) {
    const before = getDraft(editor);
    // Compare on letters/digits unless the change is only punctuation/emoji.
    const key = loose(text) !== loose(before) ? loose : norm;
    const want = key(text);
    const matches = () => key(getDraft(editor)) === want;
    const log = { hasFocus: document.hasFocus(), before, want: text, attempts: [] };

    for (const [name, run] of Object.entries(STRATEGIES)) {
      let result;
      try {
        result = await run(editor, text);
      } catch (e) {
        result = "threw: " + e.message;
      }
      const ok = await waitFor(matches);
      log.attempts.push({ name, result, ok, now: getDraft(editor) });
      if (ok) return true;
    }

    // Nothing verified: put the original back so the draft isn't mangled.
    if (key(getDraft(editor)) !== key(before)) {
      await selectAll(editor);
      paste(editor, before);
      await waitFor(() => key(getDraft(editor)) === key(before));
    }
    log.restored = getDraft(editor);
    log.editorHTML = editor.innerHTML.slice(0, 500);
    // Stringified so it's readable on the chrome://extensions Errors page.
    console.warn("[WhatsApp Refiner] insert failed " + JSON.stringify(log, null, 1));
    return false;
  }

  // ---- Toast ----

  function toast(message, { action, onAction, duration = 5000 } = {}) {
    let el = document.querySelector(".wr-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "wr-toast";
      document.body.appendChild(el);
    }
    el.textContent = "";
    const span = document.createElement("span");
    span.textContent = message;
    el.appendChild(span);
    if (action) {
      const btn = document.createElement("button");
      btn.textContent = action;
      btn.addEventListener("click", () => {
        el.classList.remove("wr-show");
        onAction();
      });
      el.appendChild(btn);
    }
    el.classList.add("wr-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("wr-show"), duration);
  }

  // ---- Refine flow ----

  function setBusy(state) {
    busy = state;
    document.querySelectorAll(".wr-bar").forEach((b) => b.classList.toggle("wr-loading", state));
    document.querySelectorAll(".wr-btn, .wr-reply-btn").forEach((b) => (b.disabled = state));
    replyBtn?.classList.toggle("wr-loading", state);
  }

  async function askBackground(msg) {
    try {
      return (await chrome.runtime.sendMessage(msg)) || { error: "empty", message: "Unknown error." };
    } catch (e) {
      return { error: "ext", message: "Extension was reloaded. Refresh WhatsApp Web." };
    }
  }

  function showError(res) {
    const needsKey = res.error === "no_key" || res.error === "bad_key";
    toast(res.message, needsKey
      ? { action: "Open settings", onAction: () => chrome.runtime.sendMessage({ type: "openOptions" }), duration: 8000 }
      : {});
  }

  // Put `text` in the box (replacing `previous`), with Undo back to `previous`.
  async function insertWithUndo(ed, text, previous, doneMessage) {
    if (!(await setDraft(ed, text))) {
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (e) {}
      toast(
        copied
          ? "Couldn't insert automatically. Text copied: press Ctrl+A, then Ctrl+V."
          : "Couldn't insert the text. Click in the message box and try again.",
        { duration: 9000 }
      );
      return;
    }
    toast(doneMessage, {
      action: "Undo",
      onAction: async () => {
        // Only undo in the same box, and only if it still holds what we put there.
        if (!ed.isConnected || norm(getDraft(ed)) !== norm(text)) return toast("The text changed since, so Undo was skipped.");
        if (!(await setDraft(ed, previous))) toast("Couldn't undo. Try Ctrl+Z.");
      },
      duration: 8000,
    });
  }

  // Recent chat (text only) and, if you're using WhatsApp's own Reply, the
  // message shown above the box. Off when "Use chat context" is unticked.
  async function refineContext(editor) {
    const { refineContext: enabled } = await chrome.storage.local.get("refineContext");
    if (enabled === false) return {};
    const context = chatBubbles().slice(-12).map(readMessage);
    const footer = editor.closest("footer");
    const q = footer?.querySelector(QUOTE_STRONG);
    const replyingTo = q && !q.contains(editor) ? textOf(q).replace(/\s*\n\s*/, ": ").slice(0, 400) : "";
    return { context, replyingTo };
  }

  async function refineDraft(editor) {
    if (busy || !editor?.isConnected) return;
    const original = getDraft(editor);
    if (!original) {
      toast("Type a message first.");
      return;
    }

    setBusy(true);
    try {
      const res = await askBackground({ type: "refine", text: original, tone: currentTone, ...(await refineContext(editor)) });
      if (res.error) return showError(res);

      // Don't clobber edits the user made while waiting.
      const ed = editor.isConnected ? editor : null;
      if (!ed || norm(getDraft(ed)) !== norm(original)) {
        toast("Draft changed while refining, so it was left as is.");
        return;
      }
      if (norm(res.text) === norm(original)) {
        toast("Already looks good. No changes.");
        return;
      }
      await insertWithUndo(ed, res.text, original, "Refined. Review it, then press Enter to send.");
    } finally {
      setBusy(false);
      updateVisibility();
    }
  }

  // ---- Draft a reply to a chosen message ----

  // The open chat's name, to notice a chat switch while a request runs.
  // shortcut: returns "" if WhatsApp moves the name, and then the check passes; upgrade if drafts land in the wrong chat.
  function chatTitle() {
    const h = document.querySelector("#main header");
    return h?.querySelector("span[title]")?.getAttribute("title") || h?.querySelector('[dir="auto"]')?.textContent || "";
  }

  async function draftReplyTo(row) {
    if (busy) return;
    const editor = findEditor();
    if (!editor) return toast("Open a chat first.");
    if (!chatBubbles().includes(row)) return toast("Couldn't read this message. Try hovering it again.");
    const previous = getDraft(editor);
    const bubble = bubbleEl(row);
    const chat = chatTitle();

    setBusy(true);
    bubble.classList.add("wr-target");
    try {
      const res = await askBackground({ type: "draftReply", ...(await replyContext(row)) });
      if (res.error) return showError(res);
      if (chatTitle() !== chat) return toast("You switched chats, so the drafted reply was dropped.");

      const ed = findEditor();
      if (!ed || norm(getDraft(ed)) !== norm(previous)) {
        toast("You typed while the reply was drafting, so your text was left as is.");
        return;
      }
      await insertWithUndo(ed, res.text, previous, "Reply drafted. Review it, then press Enter to send.");
    } finally {
      bubble.classList.remove("wr-target");
      setBusy(false);
      updateVisibility();
    }
  }

  // ---- UI injection: one ✨▾ pill per editor, left of its send button ----
  // Editors are the chat's compose box and WhatsApp's "Edit message" box.

  // Send / confirm icons or labels (labels vary by language, icons don't).
  const SEND_BTN =
    '[data-icon*="send" i], [data-icon*="check" i], [aria-label="Send"], [aria-label="Save"], [aria-label="Done"]';
  // Message status ticks (msg-check, msg-dblcheck, …) also contain "check".
  const STATUS_ICON = /msg|dblcheck|status|tick|ack/i;
  const EDITOR_SEL = 'div[contenteditable="true"], div[contenteditable="plaintext-only"]';
  const MODAL = '[role="dialog"], [aria-modal="true"], [data-animate-modal-popup], [data-animate-modal-body]';

  function isSendIcon(el) {
    if (el.closest(".wr-bar") || STATUS_ICON.test(el.getAttribute("data-icon") || "")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  // Fallback for popups (e.g. "Edit message"): the right-most button that
  // sits on the editor's row, to the right of the text.
  function rightmostButtonNear(ed, scope) {
    const er = ed.getBoundingClientRect();
    let best = null;
    let bestRight = -Infinity;
    for (const b of scope.querySelectorAll('button, [role="button"], [data-icon]')) {
      if (b.contains(ed) || b.closest(".wr-bar") || STATUS_ICON.test(b.getAttribute("data-icon") || "")) continue;
      const r = b.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      if (!r.width || r.left < er.right - 8 || cy < er.top - 24 || cy > er.bottom + 24) continue;
      if (r.right > bestRight) [best, bestRight] = [b, r.right];
    }
    return best;
  }

  // The send/confirm button's slot in the editor's row: the child of the
  // lowest common ancestor (of editor and button) that holds the button.
  function sendItemFor(ed) {
    const inModal = !!ed.closest(MODAL);
    // Never search beyond the composer (footer) or popup the editor lives in.
    const boundary = ed.closest("footer") || ed.closest(MODAL);
    let el = ed.parentElement;
    for (let i = 0; el && i < 10; i++, el = el.parentElement) {
      if (boundary && !boundary.contains(el)) break;
      const icon =
        Array.from(el.querySelectorAll(SEND_BTN)).find(isSendIcon) ||
        (inModal ? rightmostButtonNear(ed, el) : null);
      if (!icon) continue;
      let item = icon;
      while (item.parentElement && item.parentElement !== el) item = item.parentElement;
      return item.contains(ed) ? null : item;
    }
    return null;
  }

  // The chat's compose box, plus editors in popups (like "Edit message").
  function allEditors() {
    return Array.from(document.querySelectorAll(EDITOR_SEL)).filter(
      (ed) => !ed.closest("#side, header") && (ed.closest("footer") || ed.closest(MODAL) || sendItemFor(ed))
    );
  }

  const bars = new Map(); // editor -> its pill

  function syncToneUI() {
    document.querySelectorAll(".wr-tone").forEach((s) => (s.value = currentTone));
    document.querySelectorAll(".wr-btn").forEach(
      (b) => (b.title = `Refine draft – ${toneLabel(currentTone)} (Alt+R)`)
    );
  }

  function buildToolbar(editor) {
    const bar = document.createElement("div");
    bar.className = "wr-bar";

    const btn = document.createElement("button");
    btn.className = "wr-btn";
    btn.type = "button";
    btn.textContent = "✨";
    // Keep focus/selection in the editor when clicking.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => refineDraft(editor));

    // Tone picker: a small caret with an invisible native <select> on top.
    const tone = document.createElement("label");
    tone.className = "wr-tone-wrap";
    tone.textContent = "▾";
    const select = document.createElement("select");
    select.className = "wr-tone";
    select.setAttribute("aria-label", "Refine tone");
    for (const [value, label] of TONES) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      currentTone = select.value;
      syncToneUI();
    });
    tone.appendChild(select);

    bar.append(btn, tone);
    return bar;
  }

  // Only show each pill while its editor has something to refine.
  function updateVisibility() {
    for (const [ed, bar] of bars) {
      if (!ed.isConnected) {
        bar.remove();
        bars.delete(ed);
        continue;
      }
      bar.classList.toggle("wr-hidden", !getDraft(ed) && !busy);
    }
  }

  // Inline just before the send button when we can find it; otherwise float
  // above the box. Only touches the DOM when the pill is in the wrong place.
  function place(bar, ed) {
    const item = sendItemFor(ed);
    if (item) {
      if (bar.nextElementSibling !== item) item.parentElement.insertBefore(bar, item);
      bar.classList.add("wr-inline");
      return;
    }
    if (bar.isConnected) return; // e.g. send turned into the mic button; stay put (hidden)
    const host = ed.closest("footer") || ed.parentElement;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    bar.classList.remove("wr-inline");
    host.appendChild(bar);
  }

  function inject() {
    let added = false;
    for (const ed of allEditors()) {
      let bar = bars.get(ed);
      if (!bar) {
        bar = buildToolbar(ed);
        bars.set(ed, bar);
        added = true;
      }
      place(bar, ed);
    }
    if (added) syncToneUI();
    updateVisibility();
  }

  // ---- 💬 button shown when hovering an incoming message ----

  let replyBtn = null;
  let hoverBubble = null;
  let hideTimer = null;

  function ensureReplyBtn() {
    if (replyBtn) return replyBtn;
    replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "wr-reply-btn";
    replyBtn.textContent = "💬";
    replyBtn.title = "Draft a reply to this message";
    replyBtn.addEventListener("mousedown", (e) => e.preventDefault());
    replyBtn.addEventListener("click", () => hoverBubble && draftReplyTo(hoverBubble));
    replyBtn.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    replyBtn.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(replyBtn);
    return replyBtn;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => !busy && replyBtn?.classList.remove("wr-show"), 400);
  }

  // A row is often full-width; the visible bubble is the first ancestor of
  // the text with a background colour, or else the widest ancestor that's
  // still clearly narrower than the row.
  function bubbleEl(row) {
    const rowWidth = row.getBoundingClientRect().width;
    let el =
      row.querySelector("[data-pre-plain-text]") ||
      row.querySelector("span.selectable-text") ||
      row.querySelector("img, video, canvas");
    if (!el) return row;
    let best = el;
    while (el && el !== row) {
      if (el.getBoundingClientRect().width >= rowWidth * 0.85) break;
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return el;
      best = el;
      el = el.parentElement;
    }
    return best;
  }
  const bubbleRect = (row) => bubbleEl(row).getBoundingClientRect();

  document.addEventListener(
    "mouseover",
    (e) => {
      if (replyBtn?.contains(e.target)) return;
      const row = messageRowAt(e.target);
      if (!row || isMine(row)) return scheduleHide();
      if (busy) return;
      clearTimeout(hideTimer);
      hoverBubble = row;
      const btn = ensureReplyBtn();
      // Sit on the bubble's top-right corner.
      const r = bubbleRect(row);
      const paneTop = chatPane().getBoundingClientRect().top;
      btn.style.top = `${Math.max(paneTop + 2, r.top - 10)}px`;
      btn.style.left = `${Math.min(window.innerWidth - 30, r.right - 14)}px`;
      btn.classList.add("wr-show");
    },
    true
  );
  document.addEventListener("scroll", () => !busy && replyBtn?.classList.remove("wr-show"), true);

  // ---- Diagnostics: if a chat is open but no messages are recognised, log
  // the page structure (tags/attributes only, never message text) so the
  // selectors can be fixed. Shows on the chrome://extensions Errors page.

  const describe = (el) =>
    el.tagName.toLowerCase() +
    (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "") +
    (el.getAttribute("data-id") ? `[data-id=${el.getAttribute("data-id").split("_")[0]}_…]` : "") +
    (el.getAttribute("data-testid") ? `[data-testid=${el.getAttribute("data-testid")}]` : "") +
    (el.getAttribute("contenteditable") ? `[contenteditable=${el.getAttribute("contenteditable")}]` : "") +
    (el.getAttribute("aria-modal") ? "[aria-modal]" : "") +
    Array.from(el.attributes)
      .filter((a) => a.name.startsWith("data-animate"))
      .map((a) => `[${a.name}]`)
      .join("") +
    (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "");

  const checkedPanes = new WeakSet();
  setInterval(() => {
    const pane = document.querySelector("#main");
    if (!pane || checkedPanes.has(pane) || !findEditor()) return;
    checkedPanes.add(pane);
    const found = chatBubbles();
    if (found.length) {
      const mine = found.filter(isMine).length;
      console.info(`[WhatsApp Refiner] ${found.length} messages found (${mine} mine, ${found.length - mine} incoming).`);
      return;
    }
    const sample = pane.querySelector('[role="row"]') || pane.querySelector("[data-id]");
    const path = [];
    for (let el = sample; el && path.length < 12; el = el.firstElementChild) path.push(describe(el));
    const info = {
      rows: pane.querySelectorAll('[role="row"]').length,
      dataIds: pane.querySelectorAll("[data-id]").length,
      prePlainText: pane.querySelectorAll("[data-pre-plain-text]").length,
      messageInOut: pane.querySelectorAll(".message-in, .message-out").length,
      selectableText: pane.querySelectorAll("span.selectable-text").length,
      firstRowPath: path,
    };
    console.warn("[WhatsApp Refiner] no messages recognised in this chat " + JSON.stringify(info, null, 1));
  }, 5000);

  // If the box has text but no send button was recognised, log the footer's
  // icon names and button labels once so SEND_BTN can be fixed.
  let sendWarned = false;
  setInterval(() => {
    const ed = findEditor();
    if (sendWarned || !ed || !getDraft(ed) || sendItemFor(ed)) return;
    sendWarned = true;
    const footer = ed.closest("footer") || ed.parentElement;
    const info = {
      icons: Array.from(footer.querySelectorAll("[data-icon]")).map((el) => el.getAttribute("data-icon")),
      buttonLabels: Array.from(footer.querySelectorAll("button, [role=button]"))
        .map((el) => el.getAttribute("aria-label"))
        .filter(Boolean),
    };
    console.warn("[WhatsApp Refiner] send button not found, ✨ shown above the box instead " + JSON.stringify(info));
  }, 3000);

  // Any other text box with text but no inline ✨ (e.g. a popup we didn't
  // recognise): log its ancestor chain, nearby icons and button labels once.
  const editorsWarned = new WeakSet();
  setInterval(() => {
    for (const ed of document.querySelectorAll(EDITOR_SEL)) {
      if (editorsWarned.has(ed) || ed.closest("#side, footer") || !getDraft(ed)) continue;
      if (bars.get(ed)?.classList.contains("wr-inline")) continue;
      editorsWarned.add(ed);
      const chain = [];
      for (let el = ed; el && el !== document.body && chain.length < 16; el = el.parentElement) chain.push(describe(el));
      let box = ed;
      for (let i = 0; i < 5 && box.parentElement; i++) box = box.parentElement;
      const info = {
        hasPill: bars.has(ed),
        chain,
        icons: Array.from(box.querySelectorAll("[data-icon]")).map((el) => el.getAttribute("data-icon")),
        buttonLabels: Array.from(box.querySelectorAll("button, [role=button]"))
          .map((el) => el.getAttribute("aria-label"))
          .filter(Boolean),
      };
      console.warn("[WhatsApp Refiner] text box without ✨ " + JSON.stringify(info, null, 1));
    }
  }, 3000);

  // Lexical renders typed text asynchronously, so react to DOM changes
  // (throttled to one check per frame) rather than to key events.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    nextFrame().then(() => {
      scheduled = false;
      inject();
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  inject();

  // ---- Hotkey: Alt+R while typing in the compose box ----

  document.addEventListener(
    "keydown",
    (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== "KeyR") return;
      const editor = allEditors().find((ed) => ed.contains(document.activeElement));
      if (!editor) return;
      e.preventDefault();
      e.stopPropagation();
      refineDraft(editor);
    },
    true
  );
})();
