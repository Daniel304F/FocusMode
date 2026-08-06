/**
 * Business level tests for the recommendation logic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keywordsFromHost,
  buildInterestKeywords,
  recommendationScore,
  buildExclusionSet,
  selectRecommendations,
  needsRefresh,
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_TTL_MS,
} from "../src/core/recommendations.js";

test("keywords are the core name plus its dash and underscore parts", () => {
  assert.deepEqual(keywordsFromHost("news-aggregator.io").sort(), ["aggregator", "news", "news-aggregator"].sort());
  assert.deepEqual(keywordsFromHost("www.github.com"), ["github"]);
  // tokens shorter than three characters are dropped
  assert.deepEqual(keywordsFromHost("x.com"), []);
  assert.deepEqual(keywordsFromHost(""), []);
});

test("favorites weigh twice as much as visited sites", () => {
  const keywords = buildInterestKeywords(
    ["cooking.com"],            // visited, weight 2
    ["fitness.com"]             // favorite, weight 4
  );
  assert.deepEqual(keywords, ["fitness", "cooking"]);
});

test("at most eight keywords, heaviest first", () => {
  const visited = ["aaa.com", "bbb.com", "ccc.com", "ddd.com", "eee.com", "fff.com", "ggg.com", "hhh.com", "iii.com"];
  const keywords = buildInterestKeywords(visited, []);
  assert.equal(keywords.length, 8);
});

test("without favorites and visits there are no interests (cold start)", () => {
  assert.deepEqual(buildInterestKeywords([], []), []);
  assert.deepEqual(buildInterestKeywords(undefined, undefined), []);
});

test("score: 2 for a domain match, 2 for a name match, 1 for .com", () => {
  assert.equal(recommendationScore("git", { domain: "github.com", name: "GitHub" }), 5);
  assert.equal(recommendationScore("git", { domain: "gitlab.io", name: "GitLab" }), 4);
  assert.equal(recommendationScore("git", { domain: "example.com", name: "Example" }), 1);
});

test("visited, favorited and blocked domains are excluded", () => {
  const excluded = buildExclusionSet(["visited.com"], ["fav.com"], ["www.blocked.com"]);
  const result = selectRecommendations(
    [{
      keyword: "test",
      items: [
        { domain: "visited.com", name: "Visited" },
        { domain: "fav.com", name: "Fav" },
        { domain: "blocked.com", name: "Blocked" },
        { domain: "fresh.com", name: "Fresh" },
      ],
    }],
    excluded
  );
  assert.deepEqual(result.map((r) => r.domain), ["fresh.com"]);
});

test("every domain appears at most once, capped at 24", () => {
  const manyItems = Array.from({ length: 40 }, (_, i) => ({ domain: `site${i}.com`, name: `Site ${i}` }));
  const result = selectRecommendations(
    [
      { keyword: "a", items: manyItems },
      { keyword: "b", items: manyItems }, // identical candidates yield no duplicates
    ],
    new Set()
  );
  assert.equal(result.length, MAX_RECOMMENDATIONS);
  assert.equal(new Set(result.map((r) => r.domain)).size, MAX_RECOMMENDATIONS);
});

test("the result is sorted by descending score", () => {
  const result = selectRecommendations(
    [{
      keyword: "fit",
      items: [
        { domain: "other.org", name: "Other" },        // score 0
        { domain: "fitness.com", name: "Fitness" },     // score 5
        { domain: "fitlab.io", name: "irrelevant" },    // score 2
      ],
    }],
    new Set()
  );
  const scores = result.map((r) => r.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(result[0].domain, "fitness.com");
});

test("the stock needs a refresh after three hours", () => {
  const now = Date.now();
  assert.equal(needsRefresh({ updatedAt: now - RECOMMENDATION_TTL_MS - 1 }, now), true);
  assert.equal(needsRefresh({ updatedAt: now - 1000 }, now), false);
  assert.equal(needsRefresh(null, now), true); // missing stock
});
