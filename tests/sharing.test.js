import test from "node:test";
import assert from "node:assert/strict";
import { shareLinks, cardFilename } from "../frontend/src/share-links.js";

test("share intents preserve the exact destination and encode titles once", () => {
  const title = "Notes & ideas / café?";
  const destination = "https://eyubuilds.tech/#share/abc123";
  const links = shareLinks(title, destination);
  assert.deepEqual(
    links.map((link) => link.name),
    ["X", "Telegram", "WhatsApp", "Email"],
  );
  for (const link of links.slice(0, 2)) {
    assert.equal(new URL(link.href).searchParams.get("url"), destination);
    assert.equal(new URL(link.href).searchParams.get("text"), title);
  }
  assert.equal(
    new URL(links[2].href).searchParams.get("text"),
    `${title}\n${destination}`,
  );
  assert.equal(
    new URL(links[3].href).searchParams.get("body"),
    `${title}\n${destination}`,
  );
  assert.equal(new URL(links[3].href).searchParams.get("subject"), title);
  for (const url of [
    "javascript:alert(1)",
    "data:text/plain,test",
    "file:///test",
  ])
    assert.throws(() => shareLinks(title, url));
});

test("card exports use bounded safe filenames", () => {
  assert.equal(cardFilename("../../ Notes?", "pdf"), "playqr-card-notes.pdf");
  assert.equal(cardFilename("中文", "png"), "playqr-card-app.png");
  assert.ok(cardFilename("a".repeat(1000), "pdf").length < 90);
});
