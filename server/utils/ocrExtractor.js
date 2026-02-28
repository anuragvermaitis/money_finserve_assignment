const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(
        `Command failed: ${command} ${args.join(' ')} (exit=${code}) ${stderr || stdout}`
      );
      error.code = 'COMMAND_FAILED';
      reject(error);
    });
  });
}

async function commandExists(command) {
  try {
    await runCommand('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function ensureOcrDependencies() {
  const hasPdftoppm = await commandExists('pdftoppm');
  const hasTesseract = await commandExists('tesseract');

  if (hasPdftoppm && hasTesseract) return;

  const missing = [];
  if (!hasPdftoppm) missing.push('pdftoppm (poppler-utils)');
  if (!hasTesseract) missing.push('tesseract');

  const error = new Error(`OCR dependencies missing: ${missing.join(', ')}`);
  error.code = 'OCR_DEPENDENCY_MISSING';
  throw error;
}

async function listPageImages(dir, prefix) {
  const files = await fs.readdir(dir);
  return files
    .filter((name) => name.startsWith(prefix) && name.endsWith('.jpg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(dir, name));
}

async function extractTextFromImage(imagePath, lang) {
  const { stdout } = await runCommand('tesseract', [imagePath, 'stdout', '-l', lang, '--psm', '6']);
  return stdout || '';
}

async function extractTextWithOcr(pdfBuffer, options = {}) {
  const maxPages = Number(options.maxPages || 25);
  const dpi = Number(options.dpi || 180);
  const lang = options.lang || 'eng';
  const requestId = options.requestId || 'na';

  await ensureOcrDependencies();

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'concall-ocr-'));
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const imagePrefix = 'page';

  try {
    await fs.writeFile(inputPdfPath, pdfBuffer);

    await runCommand('pdftoppm', [
      '-f',
      '1',
      '-l',
      String(maxPages),
      '-jpeg',
      '-r',
      String(dpi),
      inputPdfPath,
      path.join(tempDir, imagePrefix),
    ]);

    const imagePaths = await listPageImages(tempDir, imagePrefix);
    console.info(`[ocr_started] request_id=${requestId} pages=${imagePaths.length}`);

    if (imagePaths.length === 0) {
      return {
        text: '',
        pagesProcessed: 0,
        method: 'ocr',
      };
    }

    const chunks = [];
    for (let i = 0; i < imagePaths.length; i += 1) {
      const pageText = await extractTextFromImage(imagePaths[i], lang);
      chunks.push(pageText);
    }

    console.info(`[ocr_completed] request_id=${requestId} chars=${chunks.join('\n').length} dpi=${dpi} max_pages=${maxPages}`);

    return {
      text: chunks.join('\n'),
      pagesProcessed: imagePaths.length,
      method: 'ocr',
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  extractTextWithOcr,
};
