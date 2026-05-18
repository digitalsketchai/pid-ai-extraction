import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import 'dotenv/config';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_DIR = path.join(__dirname, 'sample');
const OUTPUT_DIR = path.join(__dirname, 'output');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp']);
const PDF_EXT = new Set(['.pdf']);
const SUPPORTED_EXT = new Set([...IMAGE_EXT, ...PDF_EXT]);

const STATUS_TEXT = {
  '-1': 'queued',
  '0': 'running',
  '1': 'complete',
  '2': 'error',
  '3': 'stopped',
  '4': 'timeout',
  '5': 'unknown',
};

let CONFIG = {};

function getConfig() {
  return {
    pipeline_status_poll_interval: parseInt(process.env.PIPELINE_STATUS_POLL_INTERVAL_SECONDS || '40'),
    run_id_poll_interval: parseInt(process.env.RUN_ID_POLL_INTERVAL_SECONDS || '15'),
    pipeline_status_timeout: parseInt(process.env.PIPELINE_STATUS_TIMEOUT_SECONDS || '7200'),
    run_id_timeout: parseInt(process.env.RUN_ID_TIMEOUT_SECONDS || '600'),
    pdf_poll_interval: parseInt(process.env.PDF_POLL_INTERVAL_SECONDS || '2'),
    pdf_timeout: parseInt(process.env.PDF_TIMEOUT_SECONDS || '900'),
  };
}

CONFIG = getConfig();

function pickSampleFile(filename = null) {
  if (!fs.existsSync(SAMPLE_DIR)) {
    throw new Error(`Sample directory not found: ${SAMPLE_DIR}`);
  }

  // Require filename argument - do not auto-detect
  if (!filename) {
    console.error('');
    console.error('ERROR: No P&ID file specified');
    console.error('');
    console.error('USAGE:');
    console.error('  node extract_predictions.js <filename>');
    console.error('');
    console.error('SUPPORTED FORMATS:');
    console.error('  - Single images: PNG, JPG, JPEG, BMP');
    console.error('  - Multi-page: PDF');
    console.error('');
    console.error('EXAMPLES:');
    console.error('  node extract_predictions.js sample.pdf');
    console.error('  node extract_predictions.js drawing.jpg');
    console.error('  node extract_predictions.js Sample.png');
    console.error('');
    console.error('FILES IN sample/ FOLDER:');
    try {
      const availableFiles = fs.readdirSync(SAMPLE_DIR)
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return SUPPORTED_EXT.has(ext) && fs.statSync(path.join(SAMPLE_DIR, file)).isFile();
        })
        .sort();

      if (availableFiles.length > 0) {
        availableFiles.forEach(f => console.error(`  - ${f}`));
      } else {
        console.error('  (no supported files found)');
      }
    } catch (e) {
      console.error('  (unable to list files)');
    }
    console.error('');
    process.exit(1);
  }

  const filepath = path.join(SAMPLE_DIR, filename);
  if (fs.existsSync(filepath) && fs.statSync(filepath).isFile()) {
    return filepath;
  }
  throw new Error(`File not found: ${filepath}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadImage(baseUrl, apiKey, imagePath) {
  const url = `${baseUrl}/digitalsketch/uploadimage`;
  console.log(`  POST ${url}`);

  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');
  const mimeType = getMimeType(imagePath);

  console.log(`  File: ${imagePath}, Size: ${imageData.length} bytes, Type: ${mimeType}`);
  console.log(`  API Key loaded: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);

  const body = {
    api_key: apiKey,
    base64_image: base64Image,
  };

  if (mimeType) {
    body.mime_type = mimeType;
  }

  try {
    const resp = await axios.post(url, body, { timeout: 180000 });
    const payload = resp.data;

    if (!payload.success || !payload.imageid) {
      throw new Error(`Image upload failed: ${JSON.stringify(payload)}`);
    }

    return payload.imageid;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.error('');
      console.error('============================================');
      console.error('ERROR: API Authentication Failed (401)');
      console.error('============================================');
      console.error('');
      console.error('Your API key is being rejected by the server.');
      console.error('This typically means:');
      console.error('');
      console.error('MOST LIKELY:');
      console.error('  Your API key is invalid, expired, or a test key');
      console.error('');
      console.error('DEBUG INFO:');
      console.error(`  ✓ API Key found: ${apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET'}`);
      console.error(`  ✓ Base URL: ${baseUrl}`);
      console.error(`  ✓ File loaded: ${imageData.length} bytes (valid)`);
      console.error('');
      console.error('REQUIRED ACTIONS:');
      console.error('  1. Go to: https://api.digitalsketch.ai');
      console.error('  2. Sign in to your account');
      console.error('  3. Check your API keys in the dashboard');
      console.error('  4. Verify the key is ACTIVE (not expired/revoked)');
      console.error('  5. Copy the FULL key (including any prefix like sk_live_)');
      console.error('  6. Update .env: DIGITALSKETCH_API_KEY=<full_key>');
      console.error('  7. Close this terminal and open a NEW terminal');
      console.error('  8. Run: node extract_predictions.js');
      console.error('');
      console.error('IMPORTANT: Terminal must be CLOSED and REOPENED');
      console.error('           after updating .env for changes to take effect');
      console.error('');
      process.exit(1);
    }
    throw error;
  }
}

async function uploadPdf(baseUrl, apiKey, pdfPath) {
  const url = `${baseUrl}/digitalsketch/uploadpdf/multipart`;
  console.log(`  POST ${url}`);

  const form = new FormData();
  form.append('pdf_file', fs.createReadStream(pdfPath), path.basename(pdfPath));
  form.append('api_key', apiKey);

  const resp = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: 300000,
  });

  const payload = resp.data;
  const pdfid = payload.pdfid;

  if (!payload.success || !pdfid) {
    throw new Error(`PDF upload failed: ${JSON.stringify(payload)}`);
  }

  return pdfid;
}

function getMimeType(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || null;
}

async function waitForPdf(baseUrl, apiKey, pdfid) {
  const url = `${baseUrl}/digitalsketch/uploadpdfstatus`;
  const deadline = Date.now() + CONFIG.pdf_timeout * 1000;
  let lastPayload = {};
  let checkCount = 0;

  while (Date.now() < deadline) {
    checkCount++;
    console.log(`  POST ${url} (Check #${checkCount})`);

    const resp = await axios.post(url, { api_key: apiKey, pdfid }, { timeout: 60000 });
    lastPayload = resp.data;

    const status = lastPayload.status;
    const statusText = lastPayload.status_text || STATUS_TEXT[status] || 'unknown';
    const pagecount = lastPayload.pagecount;
    const imageids = lastPayload.imageids || [];

    console.log(`    status: ${statusText}, pages: ${pagecount}, imageids: ${imageids.length}`);

    if (status === 1) {
      if (!imageids || imageids.length === 0) {
        throw new Error(`PDF processed but no imageids returned: ${JSON.stringify(lastPayload)}`);
      }
      console.log(`  Multi-Page PDF Detected: Found ${imageids.length} pages`);
      return imageids;
    }

    if ([2, 3, 4].includes(status)) {
      throw new Error(`PDF processing ended with status ${statusText}: ${JSON.stringify(lastPayload)}`);
    }

    await sleep(CONFIG.pdf_poll_interval * 1000);
  }

  throw new Error(`PDF processing did not complete within ${CONFIG.pdf_timeout}s. Last: ${JSON.stringify(lastPayload)}`);
}

async function getImageDetails(baseUrl, apiKey, imageid) {
  const url = `${baseUrl}/digitalsketch/${imageid}/imagedetails`;
  console.log(`  POST ${url}`);
  const resp = await axios.post(url, { api_key: apiKey }, { timeout: 60000 });
  return resp.data;
}

async function startPipeline(baseUrl, apiKey, imageid) {
  const url = `${baseUrl}/digitalsketch/pipeline/start`;
  console.log(`  POST ${url}`);
  const resp = await axios.post(
    url,
    { api_key: apiKey, imageid },
    { timeout: 60000 }
  );
  return resp.data;
}

async function resolveRunId(baseUrl, apiKey, imageid, startPayload) {
  let runId = startPayload.run_id || startPayload.runid;
  if (runId) {
    return runId;
  }

  const url = `${baseUrl}/digitalsketch/pipeline/id`;
  const deadline = Date.now() + CONFIG.run_id_timeout * 1000;
  let lastPayload = {};
  let checkCount = 0;

  while (Date.now() < deadline) {
    const remaining = (deadline - Date.now()) / 1000;
    if (remaining <= 0) break;

    checkCount++;
    console.log(`  5.5. POST ${url} (Check #${checkCount})`);

    try {
      const resp = await axios.post(url, { api_key: apiKey, imageid }, { timeout: 60000 });
      lastPayload = resp.data;

      if (!lastPayload.success) {
        console.log(`    error: ${lastPayload.message || 'Unknown error'}`);
      } else {
        runId = lastPayload.run_id || lastPayload.runid;
        if (runId) {
          console.log(`    run_id assigned: ${runId}`);
          return runId;
        }
        const status = lastPayload.status;
        const statusText = lastPayload.status_text || STATUS_TEXT[status] || 'unknown';
        console.log(`    status: ${statusText}, waiting for run_id assignment...`);
      }
    } catch (e) {
      console.log(`    request error: ${e.message}`);
    }

    const waitRemaining = (deadline - Date.now()) / 1000;
    if (waitRemaining > 0) {
      const countdown = Math.min(CONFIG.run_id_poll_interval, Math.ceil(waitRemaining));
      for (let sec = countdown; sec > 0; sec--) {
        process.stdout.write(`    waiting ${sec}s...\r`);
        await sleep(1000);
      }
      process.stdout.write('                  \r');
    }
  }

  throw new Error(
    `run_id not assigned within ${CONFIG.run_id_timeout}s for image ${imageid}. Last: ${JSON.stringify(lastPayload)}`
  );
}

async function waitForPipeline(baseUrl, apiKey, runId) {
  const url = `${baseUrl}/digitalsketch/pipeline/status`;
  const deadline = Date.now() + CONFIG.pipeline_status_timeout * 1000;
  let lastPayload = {};
  let checkCount = 0;

  while (Date.now() < deadline) {
    const remaining = (deadline - Date.now()) / 1000;
    if (remaining <= 0) break;

    checkCount++;
    console.log(`  POST ${url} (Check #${checkCount})`);

    try {
      const resp = await axios.post(url, { api_key: apiKey, run_id: runId }, { timeout: 60000 });
      lastPayload = resp.data;

      if (!lastPayload.success) {
        console.log(`    error: ${lastPayload.message || 'Unknown error'}`);
        await sleep(CONFIG.pipeline_status_poll_interval * 1000);
        continue;
      }

      const status = lastPayload.status;
      const statusText = lastPayload.status_text || STATUS_TEXT[status] || 'unknown';
      const completion = lastPayload.completion;
      const progress = completion ? ` (${completion})` : '';
      console.log(`    status: ${statusText}${progress}`);

      if (status === 1) {
        console.log('    pipeline complete!');
        return lastPayload;
      }

      if ([2, 3, 4].includes(status)) {
        const errorMsg = lastPayload.message || lastPayload.error || 'Unknown error';
        console.log(`    error message: ${errorMsg}`);
        throw new Error(
          `Pipeline ended with status ${statusText}. Error: ${errorMsg}. Full response: ${JSON.stringify(lastPayload)}`
        );
      }
    } catch (e) {
      if (e.message.includes('Pipeline ended')) throw e;
      console.log(`    request error: ${e.message}`);
    }

    const waitRemaining = (deadline - Date.now()) / 1000;
    if (waitRemaining > 0) {
      const countdown = Math.min(CONFIG.pipeline_status_poll_interval, Math.ceil(waitRemaining));
      for (let sec = countdown; sec > 0; sec--) {
        process.stdout.write(`    waiting ${sec}s...\r`);
        await sleep(1000);
      }
      process.stdout.write('                  \r');
    }
  }

  throw new Error(
    `Pipeline did not complete within ${CONFIG.pipeline_status_timeout}s. Last: ${JSON.stringify(lastPayload)}`
  );
}

async function getAllPredictions(baseUrl, apiKey, imageid) {
  const url = `${baseUrl}/digitalsketch/diagram/predictions/all`;
  console.log(`  POST ${url}`);
  const resp = await axios.post(url, { api_key: apiKey, imageid }, { timeout: 120000 });
  return resp.data;
}

async function processImage(baseUrl, apiKey, imageid, pageNum, totalPages) {
  const label = `[Page ${pageNum}/${totalPages}]`;
  console.log(`${label} 4. GET /digitalsketch/{imageid}/imagedetails`);

  const details = await getImageDetails(baseUrl, apiKey, imageid);
  const imageSize = details.imagesize;
  console.log(`  image_name=${details.image_name} ext=${details.extension} size=${imageSize}`);

  if (imageSize && imageSize < 100) {
    console.log(`  WARNING: Image size is only ${imageSize} bytes - image may be corrupted!`);
    console.log(`  Returning empty predictions for this page.`);
    return {
      success: false,
      imageid,
      predictions: [],
      count: 0,
      error: `Image size too small (${imageSize} bytes), likely corrupted from PDF extraction`,
      timestamp: '',
    };
  }

  console.log(`${label} 5. POST /digitalsketch/pipeline/start`);
  const startPayload = await startPipeline(baseUrl, apiKey, imageid);
  const runId = await resolveRunId(baseUrl, apiKey, imageid, startPayload);
  console.log(`  run_id: ${runId}`);

  console.log(`${label} 6. POST /digitalsketch/pipeline/status`);
  await waitForPipeline(baseUrl, apiKey, runId);

  console.log(`${label} 7. GET /digitalsketch/diagram/predictions/all`);
  return await getAllPredictions(baseUrl, apiKey, imageid);
}

async function main() {
  const apiKey = process.env.DIGITALSKETCH_API_KEY;
  const baseUrl = (process.env.DIGITALSKETCH_API_BASE || 'https://api.digitalsketch.ai').replace(/\/$/, '');

  if (!apiKey) {
    console.error('');
    console.error('ERROR: DIGITALSKETCH_API_KEY is not set');
    console.error('');
    console.error('SETUP REQUIRED:');
    console.error('  1. Copy .env.example to .env');
    console.error('     copy .env.example .env');
    console.error('');
    console.error('  2. Edit .env and add your API key:');
    console.error('     DIGITALSKETCH_API_KEY=your_api_key_here');
    console.error('');
    console.error('  3. Get your API key from:');
    console.error('     https://api.digitalsketch.ai/documentation');
    console.error('');
    return 1;
  }

  console.log(
    `Config: PIPELINE_STATUS_POLL_INTERVAL=${CONFIG.pipeline_status_poll_interval}s (timeout ${CONFIG.pipeline_status_timeout}s), RUN_ID_POLL_INTERVAL=${CONFIG.run_id_poll_interval}s (timeout ${CONFIG.run_id_timeout}s)`
  );
  console.log();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const filename = process.argv[2] || null;
  const samplePath = pickSampleFile(filename);
  const ext = path.extname(samplePath).toLowerCase();
  console.log();
  console.log(`Processing: ${path.basename(samplePath)}`);
  console.log();

  let imageids;

  if (PDF_EXT.has(ext)) {
    console.log('2. POST /digitalsketch/uploadpdf/multipart');
    const pdfid = await uploadPdf(baseUrl, apiKey, samplePath);
    console.log(`  pdfid: ${pdfid}`);
    console.log('3. POST /digitalsketch/uploadpdfstatus');
    imageids = await waitForPdf(baseUrl, apiKey, pdfid);
  } else {
    console.log('1. POST /digitalsketch/uploadimage');
    const imageid = await uploadImage(baseUrl, apiKey, samplePath);
    console.log(`  imageid: ${imageid}`);
    imageids = [imageid];
  }

  console.log();
  const totalPages = imageids.length;
  const isPdf = PDF_EXT.has(ext);
  console.log(`Processing ${totalPages} page(s):`);
  console.log();

  for (let idx = 0; idx < imageids.length; idx++) {
    const imageid = imageids[idx];
    const pageNum = idx + 1;

    console.log('='.repeat(70));
    console.log(`Processing Page ${pageNum} of ${totalPages}`);
    console.log('='.repeat(70));

    const predictions = await processImage(baseUrl, apiKey, imageid, pageNum, totalPages);

    let outPath;
    const basename = path.basename(samplePath, path.extname(samplePath));
    if (isPdf) {
      outPath = path.join(OUTPUT_DIR, `${basename}_page${pageNum}_${imageid}_predictions.json`);
    } else {
      outPath = path.join(OUTPUT_DIR, `${basename}_${imageid}_predictions.json`);
    }

    fs.writeFileSync(outPath, JSON.stringify(predictions, null, 2), 'utf-8');
    console.log(`Saved to: ${outPath}`);
    console.log();
  }

  console.log('='.repeat(70));
  console.log(`Completed processing all ${totalPages} page(s)`);
  console.log('='.repeat(70));
  return 0;
}

main().then(code => process.exit(code)).catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
