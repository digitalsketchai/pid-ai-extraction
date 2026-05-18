# pid-ai-extraction

P&ID Data Extraction Node.js Sample Code

## Node.js Sample Code for P&ID Digitization

Extract structured data from P&ID drawings into JSON format using AI-powered document and drawing analysis.

This sample Node.js client demonstrates how to upload images or multi-page PDF drawings, run a P&ID extraction pipeline, and save structured results as JSON output.

The workflow supports automated extraction of equipment, line data, instruments, tags, annotations, and other engineering information from P&ID documents.

---

## Features

- Single-image upload support (PNG, JPG, JPEG, BMP)
- Multi-page PDF processing
- AI-based extraction and digitization pipeline
- Automatic polling for processing and pipeline status
- Structured JSON output generation per page
- Configurable polling intervals and timeout settings via environment variables
- Batch-friendly workflow for large engineering document sets

---

## Prerequisites

- Node.js 14 or newer
- npm (comes with Node.js)
- Access to a compatible P&ID extraction API or AI processing service
- API credentials or authentication token (required)

---

## Output

The extraction pipeline generates structured JSON files containing detected engineering entities and relationships from the P&ID drawings.

Typical extracted data may include:

- Equipment tags
- Instrumentation
- Pipelines and connections
- Valves
- Process annotations
- Symbols and labels
- Metadata and page-level information

Output files are saved in the `output/` directory.

---

## Typical Workflow

1. Upload image or PDF drawings
2. Start extraction pipeline
3. Monitor processing status
4. Retrieve structured predictions
5. Save results as JSON

---

## Supported File Types

- PNG
- JPG / JPEG
- BMP
- PDF (multi-page supported)

---

## Use Cases

- Engineering document digitization
- Asset inventory generation
- P&ID modernization projects
- Data migration into asset management systems
- AI-assisted engineering workflows
- Searchable engineering documentation

Official Node.js sample code for the [DigitalSketch.ai](https://digitalsketch.ai) P&ID digitization API.

- Website: [digitalsketch.ai](https://digitalsketch.ai)
- API base: [api.digitalsketch.ai](https://api.digitalsketch.ai)
- API docs: [api.digitalsketch.ai/documentation](https://api.digitalsketch.ai/documentation)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/digitalsketch-nodejs-sample.git
cd digitalsketch-nodejs-sample

npm install
```

### 2. Configure your API key

Copy `.env.example` to `.env` and add your key:

```env
DIGITALSKETCH_API_KEY=your_digitalsketch.ai_api_key_here
DIGITALSKETCH_API_BASE=https://api.digitalsketch.ai

# Optional polling / timeout overrides (defaults shown)
PIPELINE_STATUS_POLL_INTERVAL_SECONDS=40
PIPELINE_STATUS_TIMEOUT_SECONDS=7200
RUN_ID_POLL_INTERVAL_SECONDS=15
RUN_ID_TIMEOUT_SECONDS=600
PDF_POLL_INTERVAL_SECONDS=2
PDF_TIMEOUT_SECONDS=900
```

### 3. Run the extractor

Place a P&ID file in the `sample/` folder (PNG, JPG, JPEG, BMP, or PDF).

```bash
# Process specific file
node extract_predictions.js Sample.png
node extract_predictions.js multipage.pdf
node extract_predictions.js sample.jpg

# Via npm
npm start -- Sample.png
```

### 4. Inspect the output

Predictions are written to `output/` as JSON:

```
# Single image
output/<name>_<imageid>_predictions.json

# Multi-page PDF (one file per page)
output/<name>_page1_<imageid>_predictions.json
output/<name>_page2_<imageid>_predictions.json
```

---

## How the Pipeline Works

| Step | Endpoint | Purpose |
|------|----------|---------|
| 1 | `POST /digitalsketch/uploadimage` | Upload a single image (base64) |
| 1 | `POST /digitalsketch/uploadpdf/multipart` | Upload a multi-page PDF |
| 2 | `POST /digitalsketch/uploadpdfstatus` | Poll PDF processing, get per-page `imageid`s |
| 3 | `POST /digitalsketch/{imageid}/imagedetails` | Get metadata for an uploaded image |
| 4 | `POST /digitalsketch/pipeline/start` | Start the digitization pipeline |
| 4 | `POST /digitalsketch/pipeline/id` | Resolve `run_id` if not returned synchronously |
| 5 | `POST /digitalsketch/pipeline/status` | Poll pipeline status by `run_id` |
| 6 | `POST /digitalsketch/diagram/predictions/all` | Retrieve final structured predictions |

Full reference: [api.digitalsketch.ai/documentation](https://api.digitalsketch.ai/documentation)

---

## Repository Layout

```
.
|-- extract_predictions.js    # End-to-end pipeline client
|-- package.json              # Node.js dependencies
|-- .env.example              # Template for environment variables
|-- .gitignore                # Git ignore rules
|-- README.md                 # This file
|-- sample/                   # Drop your P&ID images / PDFs here
|   |-- sample.jpg
|   |-- sample.pdf
|   `-- multipage.pdf
`-- output/                   # Predictions written here (gitignored)
```

---

## Troubleshooting

- **`ERROR: DIGITALSKETCH_API_KEY is not set`** - Create `.env` from `.env.example` and add your key. Close and reopen terminal after editing.
- **`HTTP 401 / 403`** - Verify your API key is valid at [api.digitalsketch.ai/documentation](https://api.digitalsketch.ai/documentation).
- **Pipeline timeout** - Large PDFs may need higher `PIPELINE_STATUS_TIMEOUT_SECONDS` in `.env`.
- **"Image size too small" warning** - The corresponding PDF page could not be extracted; an empty predictions file is written and processing continues for the remaining pages.
- **File not found error** - Use explicit filename: `node extract_predictions.js Sample.png`

---

## License

(c) 2025 DigitalSketch.ai, Inc. All rights reserved.
