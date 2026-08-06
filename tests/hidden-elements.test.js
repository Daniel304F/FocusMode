/**
 * Business level tests for the hidden elements data format and migration.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHiddenEntries,
  removeHiddenEntry,
  hashString,
} from "../src/core/hidden-elements.js";

test("legacy selector strings are migrated without loss", () => {
  const [entry] = normalizeHiddenEntries([".ad-banner"]);
  assert.equal(entry.selector, ".ad-banner");
  assert.equal(entry.label, ".ad-banner");
  assert.equal(entry.createdAt, 0);
  assert.ok(entry.id.startsWith("legacy_"));
});

test("complete entries are kept, missing fields are filled in", () => {
  const [a, b] = normalizeHiddenEntries([
    { id: "fm_1", selector: "#feed", label: "News feed", createdAt: 123 },
    { selector: "#sidebar" }, // without id and label
  ]);
  assert.deepEqual(a, { id: "fm_1", selector: "#feed", label: "News feed", createdAt: 123 });
  assert.equal(b.selector, "#sidebar");
  assert.equal(b.label, "#sidebar");
  assert.ok(b.id.startsWith("fm_"));
});

test("unusable entries are dropped", () => {
  assert.deepEqual(normalizeHiddenEntries([null, {}, { label: "no selector" }]), []);
  assert.deepEqual(normalizeHiddenEntries("not an array"), []);
});

test("ids are deterministic: same selector, same id", () => {
  assert.equal(hashString("#feed"), hashString("#feed"));
  const [x] = normalizeHiddenEntries(["#feed"]);
  const [y] = normalizeHiddenEntries(["#feed"]);
  assert.equal(x.id, y.id);
});

test("removal prefers the id and falls back to the selector", () => {
  const entries = [
    { id: "fm_1", selector: "#feed", label: "Feed", createdAt: 0 },
    { id: "fm_2", selector: "#sidebar", label: "Sidebar", createdAt: 0 },
  ];
  assert.deepEqual(removeHiddenEntry(entries, { id: "fm_1" }).map((e) => e.id), ["fm_2"]);
  assert.deepEqual(removeHiddenEntry(entries, { selector: "#sidebar" }).map((e) => e.id), ["fm_1"]);
  // an unknown target leaves the list complete
  assert.equal(removeHiddenEntry(entries, { id: "fm_99" }).length, 2);
});
