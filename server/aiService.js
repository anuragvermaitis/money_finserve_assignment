const axios = require('axios');
const { buildConcallPrompt } = require('./services/promptBuilder');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1';

function buildGeminiBody(prompt) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 3000,
    },
  };
}

function extractRawTextFromGemini(responseData, requestId) {
  const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!Array.isArray(responseData?.candidates) || responseData.candidates.length === 0) {
    console.error(`[provider_response_invalid] request_id=${requestId} reason=missing_candidates body=`, responseData);
    throw new Error('Gemini response missing candidates array');
  }

  if (typeof rawText !== 'string' || !rawText.trim()) {
    console.error(`[provider_response_invalid] request_id=${requestId} reason=missing_text body=`, responseData);
    throw new Error('Gemini response missing text in candidates[0].content.parts[0].text');
  }

  return rawText;
}

function parseJsonWithRecovery(rawText, requestId) {
  let cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (_err) {
    console.error(`[json_parse_failed] request_id=${requestId} cleaned_output=`, cleaned);

    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
      const possibleJson = cleaned.slice(0, lastBraceIndex + 1);
      try {
        return JSON.parse(possibleJson);
      } catch {
        console.error(`[json_recovery_failed] request_id=${requestId}`);
      }
    }

    const parseError = new Error('Model returned invalid JSON after recovery attempt.');
    parseError.rawOutput = rawText;
    parseError.cleanedOutput = cleaned;
    throw parseError;
  }
}

async function getConcallSummary(transcriptText, options = {}) {
  const requestId = options.requestId || 'na';
  const modelName = process.env.MODEL_NAME || 'gemini-2.5-flash';

  if (!process.env.GEMINI_API_KEY) {
    console.error(`[ai:${requestId}] stage=config_error reason=missing_api_key`);
    throw new Error('Missing GEMINI_API_KEY in environment');
  }

  const fullPrompt = buildConcallPrompt(transcriptText);
  console.info(`[provider_request] request_id=${requestId} model=${modelName}`);

  const endpoint = `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent`;

  let response;
  try {
    const body = buildGeminiBody(fullPrompt);
    response = await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      timeout: 90000,
    });
    console.info(`[provider_success] request_id=${requestId} status=${response.status}`);
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    console.error(
      `[provider_failed] request_id=${requestId} status=${status || 'na'} endpoint=${endpoint} body=`,
      body || error.message
    );

    const err = new Error(
      status ? `Gemini API request failed (${status})` : 'Gemini API request failed'
    );
    err.details = body;
    err.endpoint = endpoint;
    throw err;
  }

  const rawOutput = extractRawTextFromGemini(response.data, requestId);
  return parseJsonWithRecovery(rawOutput, requestId);
}

module.exports = {
  getConcallSummary,
};
