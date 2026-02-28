const pdfParse = require('pdf-parse');
const { cleanTranscript } = require('../utils/textCleaner');
const { extractTextWithOcr } = require('../utils/ocrExtractor');
const { getConcallSummary } = require('../aiService');
const { normalizeSummary } = require('../summaryFormatter');
const { saveSummary } = require('./summaryStore');

function hasUsableText(text) {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 120) return false;

  const alphaNumeric = normalized.replace(/[^a-zA-Z0-9]/g, '');
  return alphaNumeric.length >= 80;
}

async function processTranscriptFile(file, requestId) {
  if (!file) {
    const err = new Error('No PDF uploaded. Use field name: transcript');
    err.statusCode = 400;
    throw err;
  }

  const looksLikePdf =
    file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');

  if (!looksLikePdf) {
    const err = new Error('Only PDF files are supported');
    err.statusCode = 400;
    throw err;
  }

  const parsed = await pdfParse(file.buffer);
  const extractedText = parsed?.text || '';
  const directUsable = hasUsableText(extractedText);

  let finalText = extractedText;
  let extractionMethod = 'pdf-parse';
  let ocrPagesProcessed = 0;

  if (!directUsable) {
    try {
      const ocrResult = await extractTextWithOcr(file.buffer, {
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
        const err = new Error(
          'Could not extract text from PDF. PDF looks scanned, and OCR dependencies are missing on server.'
        );
        err.statusCode = 400;
        err.details = ocrError.message;
        throw err;
      }
      throw ocrError;
    }
  }

  if (!hasUsableText(finalText)) {
    const err = new Error('Could not extract usable text from PDF, even after OCR.');
    err.statusCode = 400;
    throw err;
  }

  const cleaned = cleanTranscript(finalText, 12000);
  const rawSummary = await getConcallSummary(cleaned.cleanedText, { requestId });
  const summary = normalizeSummary(rawSummary);

  const meta = {
    request_id: requestId,
    original_chars: cleaned.originalChars,
    cleaned_chars: cleaned.cleanedChars,
    max_chars: cleaned.maxChars,
    was_truncated: cleaned.truncated,
    extraction_method: extractionMethod,
    ocr_pages_processed: ocrPagesProcessed,
  };

  const summaryId = saveSummary({
    summary,
    meta,
  });

  return {
    summary,
    meta: {
      ...meta,
      summary_id: summaryId,
    },
  };
}

module.exports = {
  processTranscriptFile,
};

