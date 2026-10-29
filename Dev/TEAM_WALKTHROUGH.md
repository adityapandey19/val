# Team Walkthrough & Handover Guide
## Papua New Guinea Scrape Validator — Milestone 1 (POC)

---

## 1. What Was Built & The Core Problem It Solves

### The Challenge
The **RXBE Wizard** takes clean energy financial inputs (macroeconomics, country risk, tariffs, tax, fx rates) to generate project models for Papua New Guinea (and later other countries). Previously, only a subset of indicators could be validated via standard JSON APIs (World Bank, open exchange rates). Key country indicators were stored as **raw public HTML pages** or unstructured web data and were skipped.

### The Solution Built
We designed and implemented a **modular HTML Scraper Validator** inside the dedicated [`Dev/`](file:///c:/Users/KIIT0001/Desktop/rxbe_val/val/Dev) folder on the `dev` branch:
1. **Isolated Architecture**: Danish's prior work in `app/` and `helper/` remains untouched so development continues cleanly without conflicts.
2. **Resilient Public HTML Scrapers**: Zero-dependency, lightweight DOM/table parsers for TradingEconomics, Green Climate Fund, and NYU Stern Damodaran.
3. **Dual Execution Engine**:
   - **Live Web Mode**: Directly fetches external sources with browser-standard headers.
   - **Offline Fixture Mode**: Uses pre-saved snapshots in `Dev/fixtures/` so the system can run offline, in CI/CD, or during demonstrations without rate limits or 403 blocks.
4. **Interactive Web Dashboard + CLI Runner**: A developer/team visual dashboard and a terminal runner for immediate demonstration and reporting.

---

## 2. Architecture & File Structure

Here is how the project is organized inside [`Dev/`](file:///c:/Users/KIIT0001/Desktop/rxbe_val/val/Dev):

```
c:\Users\KIIT0001\Desktop\rxbe_val\val\
│
├── Dev/                               # 📁 Isolated workspace for Milestone 1
│   ├── fixtures/                      # 📦 Saved offline HTML copies of external pages
│   │   ├── tradingeconomics_interest_rate.html
│   │   ├── tradingeconomics_tax.html
│   │   ├── gcf_png.html
│   │   ├── damodaran_ctryprem.html
│   │   ├── pwc_png_tax.html
│   │   └── pngpower_tariff_notice54.html
│   │
│   ├── scrapers/                      # 🛠️ Individual scraper modules
│   │   ├── htmlHelper.ts              # Lightweight HTML & table row parser
│   │   ├── tradingEconomicsScraper.ts # Scrapes Repo Rate (5.00%) & Corporate Tax (30.00%)
│   │   ├── gcfScraper.ts              # Scrapes GCF Eligibility ("Yes") & $85.4M portfolio
│   │   ├── damodaranScraper.ts        # Scrapes NYU Stern ERP (11.35%) & calculates Ke (16.0%)
│   │   ├── pwcTaxScraper.ts           # PwC Worldwide Tax fallback (30.0%)
│   │   ├── powerTariffScraper.ts      # Checks PNG Power notice 54 & flags image/PDF status
│   │   ├── dieselScraper.ts           # Evaluates pump price vs generator LCOE
│   │   └── index.ts                   # Universal scraper dispatcher + offline fallback
│   │
│   ├── validator/                     # ⚙️ Validation logic
│   │   ├── toleranceEngine.ts         # Dual-mode tolerance comparison (absolute + relative)
│   │   └── pngValidator.ts            # Orchestrates validation across all indicators
│   │
│   ├── tests/                         # 🧪 Test datasets and runners
│   │   ├── png_test_dataset.json      # Complete curated indicator dataset for PNG
│   │   └── run_png_validation.ts      # Terminal CLI runner with ANSI table & report export
│   │
│   ├── results/                       # 📊 Auto-generated validation run outputs
│   │   ├── png_validation_report.json # Structured machine-readable results
│   │   └── png_validation_report.md   # Markdown summary report
│   │
│   ├── types.ts                       # Extended TypeScript types for statuses & providers
│   └── README.md                      # Milestone 1 overview
│
├── app/                               # 🌐 Web UI & API
│   ├── api/png-validate/route.ts      # API endpoint (GET / POST) running PNG validation
│   └── page.tsx                       # Interactive visual dashboard
```

---

## 3. Step-by-Step Actions: How to See & Demo It

### Step A: View the Web Dashboard in Your Browser
The Next.js development server is currently running in the background.

1. Open your browser to:
   **[http://localhost:3000](http://localhost:3000)**
2. What you will see:
   - **Summary Cards**: Displays Total Indicators (22), Scrape Targets (6), Matched (16), Under Review (1), Skipped (4), and Pass Rate (**94.1%**).
   - **Mode Switcher**: Click between **🌐 Live Scrape** (real-time external requests) and **📦 Offline Fixtures** (instant offline validation).
   - **Filter Tabs**: Click **"Scrape Targets"** to isolate the Milestone 1 targets, or **"Review / Skipped"** to see diesel and power tariff notices.
   - **Audit Table**: Shows side-by-side comparisons of the Wizard Value, Source Value, Tolerance, Difference, and verification notes.

---

### Step B: Run the Terminal CLI Runner
You can run the validator directly from PowerShell or Command Prompt at any time:

1. **Live Mode** (fetches live websites):
   ```powershell
   npx tsx Dev/tests/run_png_validation.ts --mode=live
   ```
2. **Offline Fixture Mode** (fast, deterministic, zero-network):
   ```powershell
   npx tsx Dev/tests/run_png_validation.ts --mode=fixture
   ```
*This generates a clean table directly in the terminal and updates `Dev/results/png_validation_report.json` and `Dev/results/png_validation_report.md`.*

---

## 4. Key Findings to Share with Your Team

When presenting this to Danish and the team, here are the critical facts and reconciliations established:

### 1. TradingEconomics: Repo Rate & Corporate Tax
- **Central Bank Repo Rate** (`tradingeconomics.com/papua-new-guinea/interest-rate`):
  - Extracted Live: **`5.00 %`**
  - Wizard Value: **`5.00 %`**
  - **Verdict**: Exact Match (✅ **MATCHED**).
- **Corporate Tax Rate** (`tradingeconomics.com/papua-new-guinea/corporate-tax-rate`):
  - Extracted Live: **`30.00 %`**
  - Wizard Value: **`30.0 %`**
  - **Verdict**: Exact Match (✅ **MATCHED**). (Also cross-verified against PwC Tax Summaries).

### 2. Green Climate Fund (GCF)
- **URL**: `https://www.greenclimate.fund/countries/papua-new-guinea`
- **Extracted**: Country is an active GCF partner with **$85.4M** approved funding across 4 projects.
- **Wizard Value**: `"Yes"`
- **Verdict**: Exact Match (✅ **MATCHED**).

### 3. Cost of Equity via Damodaran (NYU Stern)
- **URL**: `https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html`
- **Extracted**: Papua New Guinea sovereign rating `B2`, default spread `4.67%`, Total Equity Risk Premium (ERP) `11.35%`.
- **Calculation**: Standard Ke baseline $R_f (4.65\%) + \text{ERP} (11.35\%) = 16.0\%$.
- **Wizard Value**: **`16.0 %`**
- **Verdict**: Exact Match (✅ **MATCHED**).

### 4. PNG Power Tariff Schedule (`pngpower.com.pg/notices/54`)
- **Inspection Finding**: Notice 54 does **not** provide an HTML data table. It presents an announcement graphic (`revised-2026-amended-tariff-schedule-preview.png`) and links to a PDF document.
- **Action**: Per user guidelines, automated PDF extraction is deferred for Milestone 1. Marked as **`SKIPPED`** with a documented note.

### 5. Diesel Displacement Cost (`diesel_displacement_cost`)
- **Investigation Finding**:
  - The official ICCC fuel price notice lists unsubsidized retail diesel in Port Moresby at **`K6.68 / Liter`** (≈ **`0.44 USD/kWh`** raw fuel at 33% generator efficiency).
  - The Wizard UI uses **`0.65 USD/kWh`**.
  - **The Discrepancy Explained**: `0.65` is a derived generator **LCOE** (which factors in generator capital depreciation, lubricant oil, major overhaul maintenance, and island logistics), whereas ICCC publishes retail pump price.
  - **Action**: Correctly classified as **`UNDER_REVIEW`** so the team can decide whether the validator should test raw pump price or include the LCOE conversion formula.

---

## 5. Next Steps for Continuing Development

1. **Team Alignment Discussion with Danish**:
   - Review the `Dev/` branch changes together.
   - Align on the Diesel displacement methodology (keep as generator LCOE with documented conversion vs. raw pump price).
2. **Milestone 2 (PDF Extraction)**:
   - Once HTML scraping is formally signed off, add PDF parsing for PNG Power tariff notices and World Bank loan terms (e.g., using `pdf-parse`).
3. **Multi-Country Scaling**:
   - Generalize the scraper registry (`Dev/scrapers/index.ts`) so country ISO codes (e.g., Fiji `FJ`, Solomon Islands `SB`, Kenya `KE`) dynamically parameterize the URLs and scrapers.
