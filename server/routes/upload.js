const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { cleanTranscript } = require('../utils/textCleaner');
const { extractTextWithOcr } = require('../utils/ocrExtractor');
const { getConcallSummary } = require('../aiService');
const { normalizeSummary } = require('../summaryFormatter');
const { saveSummary } = require('../services/summaryStore');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function makeRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasUsableText(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 120) return false;

  const alphaNumeric = normalized.replace(/[^a-zA-Z0-9]/g, '');
  return alphaNumeric.length >= 80;
}

router.post('/', upload.single('transcript'), async (req, res) => {
  const requestId = makeRequestId();
  const startedAt = Date.now();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF uploaded. Use field name: transcript' });
    }

    const looksLikePdf =
      req.file.mimetype === 'application/pdf' ||
      req.file.originalname.toLowerCase().endsWith('.pdf');

    if (!looksLikePdf) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const parsed = await pdfParse(req.file.buffer);
    const extractedText = parsed?.text || '';
    const directUsable = hasUsableText(extractedText);

    let finalText = extractedText;
    let extractionMethod = 'pdf-parse';
    let ocrPagesProcessed = 0;

    if (!directUsable) {
      try {
        const ocrResult = await extractTextWithOcr(req.file.buffer, {
          requestId,
          maxPages: Number(process.env.OCR_MAX_PAGES || 25),
          dpi: Number(process.env.OCR_DPI || 180),
          lang: process.env.OCR_LANG || 'eng',
        });

        finalText = ocrResult.text || '';
        extractionMethod = ocrResult.method || 'ocr';
        ocrPagesProcessed = ocrResult.pagesProcessed || 0;
      } catch (ocrError) {
        if (ocrError.code === 'OCR_DEPENDENCY_MISSING') {
          return res.status(400).json({
            error:
              'Could not extract text from PDF. PDF looks scanned, and OCR dependencies are missing on server.',
            details: ocrError.message,
            request_id: requestId,
          });
        }
        throw ocrError;
      }
    }

    if (!hasUsableText(finalText)) {
      return res.status(400).json({
        error: 'Could not extract usable text from PDF, even after OCR.',
        request_id: requestId,
      });
    }

    const cleaned = cleanTranscript(finalText, 12000);
    const rawSummary = await getConcallSummary(cleaned.cleanedText, { requestId });
    const summary = normalizeSummary(rawSummary);
    const summaryId = saveSummary({
      summary,
      meta: {
        original_chars: cleaned.originalChars,
        cleaned_chars: cleaned.cleanedChars,
        max_chars: cleaned.maxChars,
        was_truncated: cleaned.truncated,
        extraction_method: extractionMethod,
        ocr_pages_processed: ocrPagesProcessed,
      },
    });

    const durationMs = Date.now() - startedAt;
    console.info(
      `[summary_generated] request_id=${requestId} duration_ms=${durationMs} extraction=${extractionMethod}`
    );

    return res.json({
      summary,
      meta: {
        request_id: requestId,
        summary_id: summaryId,
        original_chars: cleaned.originalChars,
        cleaned_chars: cleaned.cleanedChars,
        max_chars: cleaned.maxChars,
        was_truncated: cleaned.truncated,
        extraction_method: extractionMethod,
        ocr_pages_processed: ocrPagesProcessed,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[summary_failed] request_id=${requestId} duration_ms=${durationMs} error="${error.message}"`);

    if (
      error.message?.includes('Invalid JSON') ||
      error.message?.includes('invalid JSON') ||
      error.message?.includes('invalid json')
    ) {
      return res.status(502).json({
        error: 'Model returned invalid JSON',
        details: error.message,
        raw_output: error.rawOutput || error.cleanedOutput || null,
        request_id: requestId,
      });
    }

    if (error.message?.includes('Gemini API request failed')) {
      return res.status(502).json({
        error: 'Failed to fetch response from Gemini API',
        details: error.message,
        provider_details: error.details || null,
        request_id: requestId,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      request_id: requestId,
    });
  }
});

module.exports = router;
