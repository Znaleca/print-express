/**
 * Shared text helpers for review moderation previews and server responses.
 * The customer-facing read model is masked in Supabase before it is exposed;
 * this helper is also used by Admin tools when previewing configured rules.
 */
export function normalizeReviewText(value) {
  return String(value ?? "").trim();
}

export function normalizeFilterWord(value) {
  return normalizeReviewText(value).replace(/\s+/g, " ");
}

export function maskReviewText(value, rules = []) {
  let masked = String(value ?? "");
  const activeRules = (Array.isArray(rules) ? rules : [])
    .filter((rule) => rule?.is_enabled !== false && normalizeFilterWord(rule?.word))
    .sort((first, second) => normalizeFilterWord(second.word).length - normalizeFilterWord(first.word).length);

  for (const rule of activeRules) {
    const word = normalizeFilterWord(rule.word);
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = rule.match_whole_word === false ? escaped : `(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`;
    const flags = rule.match_whole_word === false ? "giu" : "giu";
    masked = masked.replace(new RegExp(pattern, flags), rule.match_whole_word === false ? "****" : "$1****");
  }

  return masked;
}
