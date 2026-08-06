/**
 * Business level tests for the blocklist and the favorites list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { addSite, removeSite, toggleSite } from "../src/core/blocklist.js";

test("adding normalizes the site and keeps the list free of duplicates", () => {
  assert.deepEqual(addSite([], "https://www.Reddit.com"), ["reddit.com"]);
  assert.deepEqual(addSite(["reddit.com"], "reddit.com"), ["reddit.com"]);
  assert.deepEqual(addSite(["reddit.com"], "www.reddit.com/r/all"), ["reddit.com"]);
});

test("invalid input leaves the list unchanged", () => {
  assert.deepEqual(addSite(["reddit.com"], ""), ["reddit.com"]);
  assert.deepEqual(addSite(["reddit.com"], "   "), ["reddit.com"]);
});

test("removing deletes the site regardless of the input form", () => {
  assert.deepEqual(removeSite(["reddit.com", "tiktok.com"], "https://www.reddit.com"), ["tiktok.com"]);
  assert.deepEqual(removeSite(["tiktok.com"], "unknown.de"), ["tiktok.com"]);
});

test("the favorites toggle adds and removes again", () => {
  const once = toggleSite([], "github.com");
  assert.deepEqual(once, ["github.com"]);
  assert.deepEqual(toggleSite(once, "github.com"), []);
  // invalid input: the list stays unchanged apart from normalization
  assert.deepEqual(toggleSite(["github.com"], ""), ["github.com"]);
});

test("input lists are never mutated", () => {
  const input = ["reddit.com"];
  addSite(input, "tiktok.com");
  removeSite(input, "reddit.com");
  toggleSite(input, "x.com");
  assert.deepEqual(input, ["reddit.com"]);
});
