/**
 * Business level tests for site normalization and block matching.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSite,
  normalizeSites,
  parseHostname,
  matchesBlockedHost,
  isBlockedBy,
  isTrackableUrl,
} from "../src/core/site.js";

test("user input is normalized to a canonical site", () => {
  assert.equal(normalizeSite("https://www.Reddit.com/r/all"), "reddit.com");
  assert.equal(normalizeSite("  YouTube.com  "), "youtube.com");
  assert.equal(normalizeSite("http://news.ycombinator.com/item?id=1"), "news.ycombinator.com");
  assert.equal(normalizeSite("www.spiegel.de"), "spiegel.de");
});

test("empty or unusable input yields an empty site", () => {
  assert.equal(normalizeSite(""), "");
  assert.equal(normalizeSite("   "), "");
  assert.equal(normalizeSite(null), "");
  assert.equal(normalizeSite(undefined), "");
  assert.equal(normalizeSite(42), "");
});

test("list normalization removes duplicates and empty values", () => {
  assert.deepEqual(
    normalizeSites(["reddit.com", "www.reddit.com", "https://reddit.com", "", null]),
    ["reddit.com"]
  );
  assert.deepEqual(normalizeSites("not an array"), []);
});

test("a blocked site matches itself and all of its subdomains", () => {
  assert.equal(matchesBlockedHost("reddit.com", "reddit.com"), true);
  assert.equal(matchesBlockedHost("www.reddit.com", "reddit.com"), true);
  assert.equal(matchesBlockedHost("old.reddit.com", "reddit.com"), true);
  // the blocklist entry may be unnormalized
  assert.equal(matchesBlockedHost("reddit.com", "https://www.reddit.com/"), true);
});

test("mere name similarity does not block", () => {
  assert.equal(matchesBlockedHost("notreddit.com", "reddit.com"), false);
  assert.equal(matchesBlockedHost("reddit.com.evil.io", "reddit.com"), false);
  assert.equal(matchesBlockedHost("reddit.com", ""), false);
});

test("a hostname is checked against the entire blocklist", () => {
  const list = ["reddit.com", "tiktok.com"];
  assert.equal(isBlockedBy("music.tiktok.com", list), true);
  assert.equal(isBlockedBy("github.com", list), false);
  assert.equal(isBlockedBy("github.com", []), false);
});

test("only http(s) URLs yield a hostname", () => {
  assert.equal(parseHostname("https://example.com/path"), "example.com");
  assert.equal(parseHostname("http://Example.COM"), "example.com");
  assert.equal(parseHostname("chrome://extensions"), "");
  assert.equal(parseHostname("file:///C:/tmp.html"), "");
  assert.equal(parseHostname("not a url"), "");
});

test("internal pages and excluded URLs are not trackable", () => {
  const blockedPage = "chrome-extension://abc/blocked.html";
  assert.equal(isTrackableUrl("https://example.com", [blockedPage]), true);
  assert.equal(isTrackableUrl(blockedPage + "?from=x", [blockedPage]), false);
  assert.equal(isTrackableUrl("chrome://settings", []), false);
  assert.equal(isTrackableUrl("about:blank", []), false);
  assert.equal(isTrackableUrl("", []), false);
});
