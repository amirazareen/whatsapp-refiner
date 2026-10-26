const $ = (id) => document.getElementById(id);

function status(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
}

chrome.storage.local.get(["apiKey", "defaultTone", "model", "refineContext", "aboutMe"], (s) => {
  $("apiKey").value = s.apiKey || "";
  $("defaultTone").value = s.defaultTone || "polished";
  $("model").value = s.model || "claude-haiku-5-5";
  $("refineContext").checked = s.refineContext !== false;
  $("aboutMe").value = s.aboutMe || "";
});

async function save() {
  await chrome.storage.local.set({
    apiKey: $("apiKey").value.trim(),
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
  status("Testing…");
  const res = await chrome.runtime.sendMessage({
    type: "refine",
    text: "hey i wanted ask if your free tomorow",
    tone: "polished",
  });
  if (res?.error) status(res.message, "err");
  else status(`Works! Sample: "${res.text}"`, "ok");
});
