# Dev — Active Development Workspace

> **Branch**: `dev`  
> **Lead**: Danish Shamshee (established core API, types, validator logic on `main`)  
> **Collaborator**: Working jointly on scraper milestone and UI  
> **Merge policy**: All work here is reviewed and merged into `main` only after joint discussion with Danish.

---

## Milestone 1 — PNG HTML Scrape Validator

**Goal**: Convert every currently-`SKIPPED` HTML indicator into a validated result with a real `source_value`.

### Indicators in scope

| # | `indicator_id` | Source URL | Target value | Difficulty |
|---|---|---|---|---|
| 1 | `diesel_displacement_cost` | iccc.gov.pg/category/fuel-prices/ | 0.65 USD/kWh | 🟢 Low (static HTML table) |
| 2 | `grid_electricity_tariff` | pngpower.com.pg/notices/54 | 0.28 USD/kWh | 🟢 Low (static page) |
| 3 | `gcf_eligibility` | greenclimate.fund/countries/papua-new-guinea | "Yes" | 🟡 Medium (text match) |
| 4 | `corporate_tax_rate` | taxsummaries.pwc.com/papua-new-guinea/… | 30 % | 🟡 Medium (HTML table) |
| 5 | `cost_of_equity_ke` | pages.stern.nyu.edu/~adamodar/…/ctryprem.html | 16 % | 🟡 Medium (large table, find PNG row) |
| 6 | `central_bank_repo_rate` | tradingeconomics.com/papua-new-guinea/interest-rate | 5.00 % | 🔴 High (anti-bot) |
| 7 | `wind_mean_speed_100m` | globalwindatlas.info/… | 6.5 m/s | 🔴 High (JS SPA) |
| 8 | `wind_plant_load_factor` | globalwindatlas.info/… | 23 % | 🔴 High (JS SPA) |

### Folder layout

```
Dev/
├── README.md                  ← this file
├── scrapers/
│   ├── registry.ts            ← per-host scraper config map
│   ├── iccc.ts                ← diesel fuel price scraper
│   ├── pngpower.ts            ← electricity tariff scraper
│   ├── gcf.ts                 ← GCF eligibility scraper
│   ├── pwc-tax.ts             ← corporate tax rate scraper
│   └── damodaran.ts           ← cost of equity scraper
├── fixtures/                  ← local HTML snapshots for unit tests (never hit live network in tests)
│   ├── iccc-fuel-prices.html
│   ├── pngpower-notice-54.html
│   ├── gcf-png.html
│   ├── pwc-png-tax.html
│   └── damodaran-ctryprem.html
└── tests/
    ├── iccc.test.ts
    ├── pngpower.test.ts
    ├── gcf.test.ts
    ├── pwc-tax.test.ts
    └── damodaran.test.ts
```

---

## Wizard Access

See `WIZARD_ACCESS.md` in this folder for findings on whether the source wizard (the frontend that populates indicator values) is publicly accessible.
