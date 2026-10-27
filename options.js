const $ = (id) => document.getElementById(id);

function status(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

const KEYS = ["apiKey", "openaiKey", "mainProvider", "defaultTone", "model", "openaiModel", "refineContext", "aboutMe"];
chrome.storage.local.get(KEYS, (s) => {
  $("apiKey").value = s.apiKey || "";
  $("openaiKey").value = s.openaiKey || "";
  $("mainProvider").value = s.mainProvider || "anthropic";
  $("openaiModel").value = s.openaiModel || "gpt-6-luna";
  $("defaultTone").value = s.defaultTone || "polished";
  $("model").value = s.model || "claude-haiku-5-5";
  $("refineContext").checked = s.refineContext !== false;
  $("aboutMe").value = s.aboutMe || "";
});

async function save() {
  await chrome.storage.local.set({
    apiKey: $("apiKey").value.trim(),
    openaiKey: $("openaiKey").value.trim(),
    mainProvider: $("mainProvider").value,
    openaiModel: $("openaiModel").value,
    defaultTone: $("defaultTone").value,
    model: $("model").value,
    refineContext: $("refineContext").checked,
    aboutMe: $("aboutMe").value.trim(),
  });
}

$("save").addEventListener("click", async () => {
  await save();
  status("Saved. Reload WhatsApp Web to apply a new default tone.", "ok");
});

$("test").addEventListener("click", async () => {
  await save();
  const providers = [["anthropic", "Claude", "apiKey"], ["openai", "OpenAI", "openaiKey"]].filter(([, , id]) => $(id).value.trim());
  if (!providers.length) return status("Add at least one API key.", "err");
  status("Testing…");
  const lines = [];
  let failed = false;
  for (const [provider, name] of providers) {
    const res = await chrome.runtime.sendMessage({
      type: "refine",
      text: "hey i wanted ask if your free tomorow",
      tone: "polished",
      provider,
    });
    if (res?.error) failed = true;
    lines.push(res?.error ? `${name}: ${res.message}` : `${name}: works! Sample: "${res.text}"`);
  }
  status(lines.join("\n"), failed ? "err" : "ok");
});
