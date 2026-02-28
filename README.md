# Concall Intelligence Engine

## Project Overview
Concall Intelligence Engine is a research extraction prototype for earnings-call transcripts. It accepts uploaded PDF transcripts, extracts and cleans text, generates structured summary JSON through Gemini 2.5 Flash, and renders an investor-ready report view with downloadable PDF output.

## Architecture
- `public/index.html`: Upload UI and summary presentation.
- `server/index.js`: Express bootstrap, static hosting, health route, API mounting.
- `server/routes/upload.js`: PDF upload handling, extraction flow, model call orchestration, response payload.
- `server/routes/download.js`: PDF export endpoint for generated summaries.
- `server/aiService.js`: Gemini request handling, response extraction, JSON parsing and recovery.
- `server/summaryFormatter.js`: Schema normalization, cross-section deduplication, sentiment explanation generation.
- `server/utils/textCleaner.js`: Transcript cleanup and bounded input sizing.
- `server/utils/ocrExtractor.js`: OCR fallback for scanned PDFs (`pdftoppm` + `tesseract`).
- `server/utils/pdfGenerator.js`: Professional PDF report generation (`pdfkit`).
- `server/services/summaryStore.js`: In-memory summary storage for PDF download retrieval.

## Processing Flow
1. User uploads a transcript PDF through `/api/upload`.
2. Server extracts text via `pdf-parse`; if extraction is weak, OCR fallback is triggered.
3. Transcript text is normalized (header/footer cleanup, page-number filtering, whitespace collapse).
4. Clean text is passed to Gemini (`models/gemini-2.5-flash:generateContent`).
5. Model output is cleaned, parsed, and recovered if partially malformed.
6. Summary is validated, deduplicated across sections, and enriched with deterministic sentiment explanation.
7. Response is rendered in UI and cached in memory for `/download-summary/:id` PDF export.

## Prompt Strategy
The prompt enforces a strict JSON contract and fixed schema with explicit enum values and array fields. It includes hard instructions to return raw JSON only, with no markdown wrappers or explanatory text, and to return complete JSON with all brackets and arrays closed.

## JSON Validation Strategy
- Gemini output is read strictly from `candidates[0].content.parts[0].text`.
- Markdown code fences are removed before parse.
- Primary parse uses `JSON.parse` on cleaned content.
- Recovery parse trims trailing content up to the last closing brace (`}`) for partial-output recovery.
- If parse remains invalid, the request returns a structured error with raw model output for diagnostics.

## Determinism Approach
- `temperature` is fixed at `0`.
- Parsing and post-processing are rule-based.

## Error Handling
- Invalid upload/file type: `400`.

## Limitations
- OCR quality depends on scan clarity, language quality, and page artifacts.
- In-memory summary storage is process-local and non-persistent.
- Very long transcripts are truncated by configured cleaner limit.
- Summary quality depends on transcript quality and extraction fidelity.

## Future Improvements
- Persistent summary storage (Redis/PostgreSQL) for download history.
- Evidence linking from bullets to source spans.
- Asynchronous job queue for large OCR workloads.
- Access controls and audit logging for multi-user deployment.
- CI checks for schema-conformance regression testing.

## Deployment Instructions
1. Install dependencies:
   - `npm install`
2. Configure environment values in `.env`.
3. Start server:
   - `npm run dev` (development)
   - `npm start` (production run)
4. Access UI at:
   - `http://localhost:3000`

## Environment Variables
- `GEMINI_API_KEY`: Google Generative Language API key.
- `MODEL_NAME`: Gemini model name (`gemini-2.5-flash`).
- `PORT`: Server port.
- `OCR_MAX_PAGES`: Maximum pages processed in OCR fallback.
- `OCR_DPI`: OCR rasterization DPI.
- `OCR_LANG`: OCR language code (`eng` by default).
