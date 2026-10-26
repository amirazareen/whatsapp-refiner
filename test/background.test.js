// Run: node --test test/background.test.js
// Loads background.js with a fake chrome + fetch and checks the prompts and parsing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(storage = {}, reply = "ok") {
  const sent = [];
  let listener;
  const ctx = {
    console,
    chrome: {
      storage: { local: { get: async () => ({ apiKey: "test-key", ...storage }) } },
      runtime: { onMessage: { addListener: (fn) => (listener = fn) }, openOptionsPage() {} },
      action: { onClicked: { addListener() {} } },
    },
    fetch: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: reply }] }) };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), ctx);
  const send = (msg) => new Promise((r) => listener(msg, {}, r));
  return { ctx, sent, send };
}

test("translate tones replace the keep-language rule", () => {
  const { ctx } = load();
  const p = ctx.refineSystemPrompt("to_en", false, false);
  assert.match(p, /Write the result in English/);
  assert.doesNotMatch(p, /do not translate/);
  assert.match(ctx.refineSystemPrompt("polished", false, false), /do not translate/);
});

test("About me reaches refine, reply and summary prompts", async () => {
  const { sent, send } = load({ aboutMe: "I'm Alex, IT support." });
  await send({ type: "refine", text: "hi", tone: "polished" });
  await send({ type: "draftReply", messages: [{ fromMe: false, text: "hi" }], targetIndex: 0 });
  await send({ type: "summarize", messages: [{ fromMe: false, text: "hi" }] });
  assert.equal(sent.length, 3);
  for (const body of sent) assert.match(body.system, /About the user.*I'm Alex, IT support\./);
});

test("splitVersions needs exactly 3 parts", () => {
  const { ctx } = load();
  assert.deepEqual([...ctx.splitVersions("a\n---\nb\n---\nc")], ["a", "b", "c"]);
  assert.equal(ctx.splitVersions("a\n---\nb"), null);
  assert.equal(ctx.splitVersions("just one"), null);
});

test("refine with variants returns versions, or falls back to the first part", async () => {
  let r = await load({}, "short\n---\nbest\n---\nother").send({ type: "refine", text: "x", tone: "polished", variants: true });
  assert.deepEqual([...r.versions], ["short", "best", "other"]);
  r = await load({}, "one\n---\ntwo").send({ type: "refine", text: "x", tone: "polished", variants: true });
  assert.equal(r.versions, undefined);
  assert.equal(r.text, "one");
});

test("summary request sends the chat and a short output limit", async () => {
  const { sent, send } = load();
  await send({ type: "summarize", messages: [{ fromMe: false, sender: "Sam", time: "7:04 PM", text: "PDF is corrupted" }] });
  assert.equal(sent[0].max_tokens, 1500);
  assert.match(sent[0].messages[0].content, /\[7:04 PM\] Sam: PDF is corrupted/);
  assert.match(sent[0].system, /Waiting for you:/);
});
