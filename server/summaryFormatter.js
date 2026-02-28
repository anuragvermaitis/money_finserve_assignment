const SENTIMENTS = new Set(['positive', 'neutral', 'cautious', 'negative']);
const CONFIDENCE = new Set(['high', 'medium', 'low']);

function ensureString(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`Invalid JSON: ${field} must be a string`);
  }
  return value.trim();
}

function ensureEnum(value, field, allowed) {
  const val = ensureString(value, field).toLowerCase();
  if (!allowed.has(val)) {
    throw new Error(`Invalid JSON: ${field} must be one of ${Array.from(allowed).join(', ')}`);
  }
  return val;
}

function ensureStringArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid JSON: ${field} must be an array`);
  }

  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupeAcrossSections(sectionsInOrder) {
  const seen = new Set();
  const result = {};

  for (const [section, values] of sectionsInOrder) {
    result[section] = [];
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result[section].push(normalized);
    }
  }

  return result;
}

function hasStrongGuidance(guidanceItems) {
  if (!Array.isArray(guidanceItems) || guidanceItems.length === 0) return false;
  const strongWords =
    /\b(raised|raise|increased|increase|strong|confidence|confident|improve|improved|growth|upside|robust|reaffirmed|momentum)\b/i;
  return guidanceItems.some((item) => strongWords.test(item));
}

function deriveSentimentAndExplanation(summary) {
  const highlights = summary.key_highlights.length;
  const risks = summary.risks_and_concerns.length;
  const strongGuidance = hasStrongGuidance(summary.guidance_outlook);

  let ruleBasedSentiment = 'neutral';
  let explanation = 'Sentiment classified as neutral due to a balanced mix of opportunities and risks.';

  if (risks >= highlights + 2) {
    ruleBasedSentiment = 'negative';
    explanation =
      'Sentiment classified as negative due to risk concentration materially outweighing positive operating discussion.';
  } else if (risks > highlights) {
    ruleBasedSentiment = 'cautious';
    explanation =
      'Sentiment classified as cautious due to risk discussion outweighing positive highlights in management commentary.';
  } else if (highlights > risks && strongGuidance) {
    ruleBasedSentiment = 'positive';
    explanation =
      'Sentiment classified as positive due to stronger operational highlights supported by forward guidance signals.';
  }

  return { ruleBasedSentiment, explanation };
}

function normalizeSummary(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid JSON: response must be an object');
  }

  const base = {
    company: ensureString(payload.company, 'company'),
    quarter: ensureString(payload.quarter, 'quarter'),
    financial_sentiment: ensureEnum(payload.financial_sentiment, 'financial_sentiment', SENTIMENTS),
    confidence_level: ensureEnum(payload.confidence_level, 'confidence_level', CONFIDENCE),
    key_highlights: ensureStringArray(payload.key_highlights, 'key_highlights'),
    risks_and_concerns: ensureStringArray(payload.risks_and_concerns, 'risks_and_concerns'),
    management_commitments: ensureStringArray(payload.management_commitments, 'management_commitments'),
    guidance_outlook: ensureStringArray(payload.guidance_outlook, 'guidance_outlook'),
    analyst_focus_areas: ensureStringArray(payload.analyst_focus_areas, 'analyst_focus_areas'),
  };

  const deduped = dedupeAcrossSections([
    ['key_highlights', base.key_highlights],
    ['risks_and_concerns', base.risks_and_concerns],
    ['management_commitments', base.management_commitments],
    ['guidance_outlook', base.guidance_outlook],
    ['analyst_focus_areas', base.analyst_focus_areas],
  ]);

  const finalSummary = {
    ...base,
    ...deduped,
  };

  const derived = deriveSentimentAndExplanation(finalSummary);

  return {
    ...finalSummary,
    rule_based_sentiment: ensureEnum(derived.ruleBasedSentiment, 'rule_based_sentiment', SENTIMENTS),
    sentiment_explanation: ensureString(derived.explanation, 'sentiment_explanation'),
  };
}

module.exports = {
  normalizeSummary,
};
