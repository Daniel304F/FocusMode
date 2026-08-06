/**
 * Business level tests for the autocomplete ranking of the blocker input.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSuggestions, scoreSuggestion } from "../src/core/suggestions.js";

const SOURCES = [
  { domains: ["reddit.com", "readthedocs.org"], label: "Top", baseScore: 10 },
  { domains: ["reddit.com"], label: "Favorit", baseScore: 60 },
];

test("prefix matches beat substring matches", () => {
  assert.ok(
    scoreSuggestion("red", "reddit.com", 10) > scoreSuggestion("red", "hundred.com", 10)
  );
});

test("only matching domains appear, sorted by relevance", () => {
  const result = rankSuggestions("red", [
    { domains: ["reddit.com", "github.com", "hundred.com"], label: "Top", baseScore: 10 },
  ]);
  assert.deepEqual(result.map((r) => r.domain), ["reddit.com", "hundred.com"]);
});

test("with duplicates across sources the highest score wins", () => {
  const result = rankSuggestions("reddit", SOURCES);
  const reddit = result.find((r) => r.domain === "reddit.com");
  assert.equal(reddit.source, "Favorit"); // base score 60 beats base score 10
  assert.equal(result.filter((r) => r.domain === "reddit.com").length, 1);
});

test("empty input yields no suggestions and the limit is respected", () => {
  assert.deepEqual(rankSuggestions("", SOURCES), []);
  assert.deepEqual(rankSuggestions("   ", SOURCES), []);

  const many = Array.from({ length: 30 }, (_, i) => `site${i}.com`);
  const result = rankSuggestions("site", [{ domains: many, label: "Top", baseScore: 10 }]);
  assert.equal(result.length, 12);
});
