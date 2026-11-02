// Run: node --test test/background.test.js
// Loads background.js with a fake chrome + fetch and checks the prompts and parsing.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(storage = {}, reply = "ok", responses = {}) {
  const sent = [];
  const calls = [];
  let listener;
  const defaults = {
    anthropic: { status: 200, body: { stop_reason: "end_turn", content: [{ type: "text", text: reply }] } },
    openai: { status: 200, body: { choices: [{ message: { content: reply }, finish_reason: "stop" }] } },
  };
  const ctx = {
    console,
    chrome: {
      storage: { local: { get: async () => ({ apiKey: "test-key", ...storage }) } },
      runtime: { onMessage: { addListener: (fn) => (listener = fn) }, openOptionsPage() {} },
      action: { onClicked: { addListener() {} } },
    },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      sent.push(body);
      calls.push({ url, body });
      const which = url.includes("openai.com") ? "openai" : "anthropic";
      const r = responses[which] || defaults[which];
      return { ok: r.status < 300, status: r.status, json: async () => r.body };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), ctx);
  const send = (msg) => new Promise((r) => listener(msg, {}, r));
  return { ctx, sent, calls, send };
}

test("translate tones replace the keep-language rule", () => {
  const { ctx } = load();
  const p = ctx.refineSystemPrompt("to_en", false, false);
  assert.match(p, /Write the result in English/);
  assert.doesNotMatch(p, /do not translate/);
  assert.match(ctx.refineSystemPrompt("polished", false, false), /do not translate/);
});

test("About me reaches refine, reply and summary prompts", async () => {
  const { sent, send } = load({ aboutMe: "I'm Amir, IT support." });
  await send({ type: "refine", text: "hi", tone: "polished" });
  await send({ type: "draftReply", messages: [{ fromMe: false, text: "hi" }], targetIndex: 0 });
  await send({ type: "summarize", messages: [{ fromMe: false, text: "hi" }] });
  assert.equal(sent.length, 3);
  for (const body of sent) assert.match(body.system, /About the user.*I'm Amir, IT support\./);
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
  await send({ type: "summarize", messages: [{ fromMe: false, sender: "Aiden", time: "7:04 PM", text: "PDF is corrupted" }] });
  assert.equal(sent[0].max_tokens, 1500);
  assert.match(sent[0].messages[0].content, /\[7:04 PM\] Aiden: PDF is corrupted/);
  assert.match(sent[0].system, /Waiting for you:/);
});

test("toOpenAIContent converts image blocks to data URLs", () => {
  const { ctx } = load();
  const out = ctx.toOpenAIContent([
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAA" } },
    { type: "text", text: "hi" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
    { type: "text", text: "hi" },
  ]);
  assert.equal(ctx.toOpenAIContent("plain"), "plain");
});

test("callOpenAI sends system + user and reads choices", async () => {
  const { ctx, calls } = load({ openaiKey: "sk-o", openaiModel: "m1" }, "done");
  const r = await ctx.callOpenAI("SYS", "hello", 1500);
  assert.equal(r.text, "done");
  assert.match(calls[0].url, /api\.openai\.com\/v1\/chat\/completions/);
  assert.equal(calls[0].body.model, "m1");
  assert.deepEqual(calls[0].body.messages.map((m) => m.role), ["system", "user"]);
});

test("status codes map to the same error codes for both providers", async () => {
  for (const [status, code] of [[401, "bad_key"], [429, "limit"], [529, "server"], [400, "api"]]) {
    const err = { error: { message: "x" } };
    const { ctx } = load({ openaiKey: "sk-o" }, "ok", { anthropic: { status, body: err }, openai: { status, body: err } });
    assert.equal((await ctx.callClaude("s", "c")).error, code);
    assert.equal((await ctx.callOpenAI("s", "c")).error, code);
  }
});

const fail = (status) => ({ status, body: { error: { message: "boom" } } });

test("one key: only that provider is used", async () => {
  const { calls, send } = load({ apiKey: "", openaiKey: "sk-o" });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /openai/);
  assert.equal(r.backup, undefined);
});

test("both keys: main goes first, backup on switchable error", async () => {
  const { calls, send } = load({ openaiKey: "sk-o", mainProvider: "openai" }, "ok", { openai: fail(429) });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.deepEqual(calls.map((c) => (/openai/.test(c.url) ? "o" : "a")), ["o", "a"]);
  assert.equal(r.backup, true);
  assert.equal(r.provider, "anthropic");
});

test("refusal does not switch to backup", async () => {
  const refused = { status: 200, body: { stop_reason: "refusal", content: [] } };
  const { calls, send } = load({ openaiKey: "sk-o" }, "ok", { anthropic: refused });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(calls.length, 1);
  assert.equal(r.error, "refusal");
});

test("both fail: main error with backup error appended", async () => {
  const { send } = load({ openaiKey: "sk-o" }, "ok", { anthropic: fail(500), openai: fail(401) });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(r.error, "server");
  assert.match(r.message, /Backup also failed: OpenAI API error/);
});

test("provider override tests one key only, no fallback", async () => {
  const { calls, send } = load({ openaiKey: "sk-o" }, "ok", { openai: fail(401) });
  const r = await send({ type: "refine", text: "x", tone: "polished", provider: "openai" });
  assert.equal(calls.length, 1);
  assert.equal(r.error, "bad_key");
});

test("no keys names both providers", async () => {
  const r = await load({ apiKey: "" }).send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(r.error, "no_key");
  assert.match(r.message, /Anthropic.*OpenAI/);
});

test("whitespace-only main key counts as missing: backup alone, no backup flag", async () => {
  const { calls, send } = load({ apiKey: "   ", openaiKey: "sk-o" });
  const r = await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(calls.length, 1);
  assert.equal(r.backup, undefined);
});

test("About me reaches OpenAI too", async () => {
  const { sent, send } = load({ apiKey: "", openaiKey: "sk-o", aboutMe: "I'm Amir." });
  await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.match(sent[0].messages[0].content, /About the user.*I'm Amir\./);
});

test("About me appears exactly once in the Claude system prompt", async () => {
  const { sent, send } = load({ aboutMe: "I'm Amir." });
  await send({ type: "summarize", messages: [{ text: "hi" }] });
  assert.equal(sent[0].system.split("About the user").length, 2);
});

test("refine fallback to first version keeps the backup note", async () => {
  const { send } = load({ openaiKey: "sk-o" }, "one\n---\ntwo", { anthropic: fail(500) });
  const r = await send({ type: "refine", text: "x", tone: "polished", variants: true });
  assert.equal(r.text, "one");
  assert.equal(r.backup, true);
  assert.equal(r.provider, "openai");
});

const M = [{ token: "​111@lid​", name: "@Redha DIGICERT" }, { token: "​222@lid​", name: "@Aiden" }];

test("maskMentions swaps markers for placeholders, same marker same placeholder", () => {
  const { ctx } = load();
  assert.equal(ctx.maskMentions(`Hi ${M[0].token} and ${M[1].token}, ${M[0].token}`, M), "Hi {M1} and {M2}, {M1}");
});

test("unmaskMentions restores names and markers, prepending missing ones", () => {
  const { ctx } = load();
  const r = ctx.unmaskMentions("Please check, {M2}", M);
  assert.equal(r.text, "@Redha DIGICERT Please check, @Aiden");
  assert.equal(r.wa, `${M[0].token} Please check, ${M[1].token}`);
});

test("refine with mentions never sends markers and returns wa versions", async () => {
  const { sent, send } = load({}, "short {M1}\n---\nbest {M1}\n---\nother");
  const r = await send({ type: "refine", text: "hi @Redha DIGICERT", wa: `hi ${M[0].token}`, mentions: [M[0]], tone: "polished", variants: true });
  assert.doesNotMatch(JSON.stringify(sent[0]), /111@lid/);
  assert.match(sent[0].system, /\{M1\}/);
  assert.deepEqual([...r.versions], ["short @Redha DIGICERT", "best @Redha DIGICERT", "@Redha DIGICERT other"]);
  assert.equal(r.was[2], `${M[0].token} other`);
});

test("refine without mentions is unchanged", async () => {
  const { sent, send } = load();
  const r = await send({ type: "refine", text: "hi", tone: "polished" });
  assert.equal(sent[0].messages[0].content, "hi");
  assert.equal(r.wa, undefined);
  assert.doesNotMatch(sent[0].system, /\{M1\}/);
});

test("explain sends the target with images, its own prompt and an 800 limit", async () => {
  const { sent, send } = load({ aboutMe: "IT support" }, "It shows a blocked site.");
  const r = await send({ type: "explain", messages: [{ fromMe: false, sender: "Sandeep", text: "can't open" }], targetIndex: 0, images: ["AAA"] });
  assert.equal(r.text, "It shows a blocked site.");
  assert.equal(sent[0].max_tokens, 800);
  assert.match(sent[0].system, /explain/i);
  assert.match(sent[0].system, /About the user.*IT support/);
  const blocks = sent[0].messages[0].content;
  assert.equal(blocks[0].type, "image");
  assert.match(blocks.at(-1).text, />>> TARGET >>>.*Sandeep: can't open/);
  assert.match(blocks.at(-1).text, /Explain the TARGET message for me\./);
  assert.doesNotMatch(blocks.at(-1).text, /Draft my reply/);
});

test("draft reply still ends with the reply request", async () => {
  const { sent, send } = load();
  await send({ type: "draftReply", messages: [{ fromMe: false, text: "hi" }], targetIndex: 0 });
  assert.match(sent[0].messages[0].content.at(-1).text, /Draft my reply to the TARGET message\./);
});
