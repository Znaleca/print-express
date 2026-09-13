import test from "node:test";
import assert from "node:assert/strict";
import { maskReviewText } from "../lib/reviewText.js";
import { getRatingSummary } from "../lib/rating.js";

test("review masking is case-insensitive, punctuation-aware, and preserves harmless words", () => {
  const rules = [{ word: "bad", is_enabled: true, match_whole_word: true }];
  assert.equal(maskReviewText("BAD, bad! badge; bad-bad", rules), "****, ****! badge; ****-****");
  assert.equal(maskReviewText("badly is not a match", rules), "badly is not a match");
});

test("review masking supports intentional substring rules and disabled rules", () => {
  assert.equal(maskReviewText("class CLASS", [{ word: "ass", is_enabled: true, match_whole_word: false }]), "cl**** CL****");
  assert.equal(maskReviewText("bad BAD", [{ word: "bad", is_enabled: false, match_whole_word: true }]), "bad BAD");
});

test("rating summaries include valid ratings and a complete distribution", () => {
  assert.deepEqual(getRatingSummary([{ rating: 5 }, { rating: 5 }, { rating: 3 }, { rating: 0 }, { rating: 6 }]), {
    average: 4.3,
    count: 3,
    distribution: [
      { rating: 5, count: 2 },
      { rating: 4, count: 0 },
      { rating: 3, count: 1 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ],
  });
});
