"use client";

import { useState, useEffect } from "react";
import type {
  ValidationResponse,
  IndicatorResult,
  WorkbookInfo,
} from "@/helper/types";
import {
  getAvailableCountryOptions,
  type CountryOption,
} from "@/helper/country-config";
import PNGValidatorView from "@/Dev/validator/PNGValidatorView";

type TypeFilter = "ALL" | "SCRAPE" | "FEED" | "PDF" | "API";
type StatusFilter = "ALL" | "MATCHED" | "MISMATCHED" | "ERROR" | "SKIPPED";

export default function Home() {
  const [workbooks, setWorkbooks] = useState<WorkbookInfo[]>([]);
  const [loadingWorkbooks, setLoadingWorkbooks] = useState(true);
  const [validatingKey, setValidatingKey] = useState<string | null>(null);
  const [activeSheetInfo, setActiveSheetInfo] = useState<{
    filePath: string;
    sheetName: string;
    displayName: string;
    country: string;
    countryCode: string;
    province: string;
  } | null>(null);

  // Upload modal & form states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(() =>
    getAvailableCountryOptions()
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState("PG");
  const [selectedProvince, setSelectedProvince] = useState(
    "National Capital District"
  );
  const [customCountryName, setCustomCountryName] = useState("");
  const [customProvinceName, setCustomProvinceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Table filtering states
  const [sheetSearch, setSheetSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [provinceFilter, setProvinceFilter] = useState<string>("ALL");

  // Validation results states
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Indicators filters
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Custom JSON modal
  const [showCustomTester, setShowCustomTester] = useState(false);

  // View mode: multi-sheet validator or live PNG scrape validator
  const [viewMode, setViewMode] = useState<"sheets" | "png">("sheets");
  const [customJson, setCustomJson] = useState("");
  const [customLoading, setCustomLoading] = useState(false);

  // Initial load: fetch workbooks & available countries — does NOT validate automatically
  async function loadWorkbooks() {
    setLoadingWorkbooks(true);
    try {
      const res = await fetch("/api/sheets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setWorkbooks(json.workbooks || []);
      if (Array.isArray(json.availableCountries) && json.availableCountries.length > 0) {
        setCountryOptions(json.availableCountries);
      }
    } catch (err: unknown) {
      console.error("Failed to load workbooks:", err);
    } finally {
      setLoadingWorkbooks(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/sheets")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        if (!ignore) {
          setWorkbooks(json.workbooks || []);
          if (Array.isArray(json.availableCountries) && json.availableCountries.length > 0) {
            setCountryOptions(json.availableCountries);
          }
          setLoadingWorkbooks(false);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load workbooks on mount:", err);
        if (!ignore) setLoadingWorkbooks(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Update provinces dropdown when country changes
  const currentCountryConfig = countryOptions.find(
    (c) => c.code === selectedCountryCode
  );
  const currentProvinces = currentCountryConfig?.provinces || [];

  const handleCountryChange = (code: string) => {
    setSelectedCountryCode(code);
    if (code === "CUSTOM") {
      setSelectedProvince("CUSTOM");
    } else {
      const matched = countryOptions.find((c) => c.code === code);
      if (matched && matched.provinces.length > 0) {
        setSelectedProvince(matched.defaultProvince || matched.provinces[0]);
      }
    }
  };

  // Directory preview calculation
  const effectiveCountry =
    selectedCountryCode === "CUSTOM"
      ? customCountryName.trim() || "Custom_Country"
      : currentCountryConfig?.name || "Papua_New_Guinea";

  const effectiveProvince =
    selectedProvince === "CUSTOM"
      ? customProvinceName.trim() || "Custom_State"
      : selectedProvince;

  const effectiveCountryDir = effectiveCountry
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");

  const effectiveStateDir = effectiveProvince
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");

  // Handle Excel file upload submission
  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select an Excel file (.xlsx or .xls) to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("country", effectiveCountry);
      formData.append(
        "countryCode",
        selectedCountryCode === "CUSTOM" ? "CUSTOM" : selectedCountryCode
      );
      formData.append("province", effectiveProvince);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with HTTP ${res.status}`);
      }

      await loadWorkbooks();
      setShowUploadModal(false);
      setSelectedFile(null);
      setCustomCountryName("");
      setCustomProvinceName("");
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Handle uploaded workbook deletion
  async function handleDeleteWorkbook(filePath: string, displayName: string) {
    if (!confirm(`Delete workbook "${displayName}" from its directory?`)) return;

    try {
      const res = await fetch(
        `/api/upload?filePath=${encodeURIComponent(filePath)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to delete file.");
      }
      await loadWorkbooks();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete file.");
    }
  }

  // Validate a specific sheet with country & state details
  async function handleValidateSheet(
    filePath: string,
    sheetName: string,
    workbookDisplay: string,
    country?: string,
    countryCode?: string,
    province?: string
  ) {
    const key = `${filePath}::${sheetName}`;
    setValidatingKey(key);
    setError(null);

    try {
      const res = await fetch("/api/validate-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          sheetName,
          country,
          countryCode,
          province,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const json: ValidationResponse = await res.json();
      setData(json);
      setActiveSheetInfo({
        filePath,
        sheetName,
        displayName: `${workbookDisplay} — ${sheetName}`,
        country: json.country || country || "Papua New Guinea",
        countryCode: json.country_code || countryCode || "PG",
        province: json.province || province || "National Capital District",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sheet validation failed.");
    } finally {
      setValidatingKey(null);
    }
  }

  // Re-validate the currently active sheet
  async function revalidateActiveSheet() {
    if (!activeSheetInfo) return;
    await handleValidateSheet(
      activeSheetInfo.filePath,
      activeSheetInfo.sheetName,
      activeSheetInfo.displayName.split(" — ")[0] || activeSheetInfo.sheetName,
      activeSheetInfo.country,
      activeSheetInfo.countryCode,
      activeSheetInfo.province
    );
  }

  // Run Custom JSON payload validation
  async function runCustomValidation() {
    setCustomLoading(true);
    setError(null);
    try {
      let body: unknown;
      try {
        body = JSON.parse(customJson);
      } catch {
        throw new Error("Invalid JSON payload. Please check the syntax.");
      }

      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }

      const json: ValidationResponse = await res.json();
      setData(json);
      setActiveSheetInfo({
        filePath: "",
        sheetName: "Custom Payload",
        displayName: "Custom Request Payload",
        country: json.country || "Papua New Guinea",
        countryCode: json.country_code || "PG",
        province: json.province || "National Capital District",
      });
      setShowCustomTester(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setCustomLoading(false);
    }
  }

  // Indicator type helpers
  const isPdfResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    return url.endsWith(".pdf") || url.includes(".pdf");
  };

  const isXmlResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    const id = (r.indicator_id || "").toLowerCase();
    return (
      url.includes("/rss") ||
      url.includes(".xml") ||
      url.includes("news.google.com") ||
      id.includes("xml_feed") ||
      id.includes("xml_news") ||
      id.includes("news_")
    );
  };

  const isCsvResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    const id = (r.indicator_id || "").toLowerCase();
    return url.endsWith(".csv") || url.includes("format=csv") || id.includes("csv_");
  };

  const isScrapeResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    const id = (r.indicator_id || "").toLowerCase();
    return (
      !isPdfResult(r) &&
      !isXmlResult(r) &&
      !isCsvResult(r) &&
      (url.includes("tradingeconomics.com") ||
        url.includes("greenclimate.fund") ||
        url.includes("iccc.gov.pg") ||
        url.includes("pngpower.com.pg") ||
        id.includes("repo") ||
        id.includes("tax") ||
        id.includes("tariff") ||
        id.includes("displacement") ||
        id.includes("gcf") ||
        id.includes("tradingeconomics"))
    );
  };

  const isApiResult = (r: IndicatorResult) => {
    return (
      !isPdfResult(r) &&
      !isXmlResult(r) &&
      !isCsvResult(r) &&
      !isScrapeResult(r) &&
      (r.source_url || "").startsWith("http")
    );
  };

  const getSourceType = (r: IndicatorResult): { label: string; style: string } => {
    if (isPdfResult(r)) return { label: "PDF", style: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
    if (isXmlResult(r)) return { label: "RSS Feed", style: "text-purple-400 bg-purple-500/10 border-purple-500/20" };
    if (isCsvResult(r)) return { label: "CSV", style: "text-teal-400 bg-teal-500/10 border-teal-500/20" };
    if (isScrapeResult(r)) return { label: "Scrape", style: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    if (r.source_url.startsWith("http")) return { label: "API", style: "text-sky-400 bg-sky-500/10 border-sky-500/20" };
    return { label: "Internal", style: "text-zinc-400 bg-zinc-800/60 border-zinc-700/40" };
  };

  const getDomainFromUrl = (url: string): string => {
    try {
      if (!url.startsWith("http")) return url;
      const parsed = new URL(url);
      return parsed.hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  // Filter available workbooks & sheets
  const filteredWorkbooks = workbooks
    .filter((wb) => {
      if (countryFilter !== "ALL") {
        if ((wb.countryCode || "").toUpperCase() !== countryFilter.toUpperCase() &&
            (wb.country || "").toLowerCase() !== countryFilter.toLowerCase()) {
          return false;
        }
      }
      if (provinceFilter !== "ALL") {
        if ((wb.province || "").toLowerCase() !== provinceFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    })
    .map((wb) => {
      const q = sheetSearch.trim().toLowerCase();
      if (!q) return wb;
      const matchesWb =
        wb.displayName.toLowerCase().includes(q) ||
        wb.fileName.toLowerCase().includes(q) ||
        (wb.country || "").toLowerCase().includes(q) ||
        (wb.province || "").toLowerCase().includes(q);

      if (matchesWb) return wb;

      const matchedSheets = wb.sheets.filter((s) =>
        s.name.toLowerCase().includes(q)
      );
      return { ...wb, sheets: matchedSheets };
    })
    .filter((wb) => wb.sheets.length > 0);

  // Indicators filtered list
  const allResults = data?.results ?? [];

  const typeCounts = {
    ALL: allResults.length,
    SCRAPE: allResults.filter(isScrapeResult).length,
    FEED: allResults.filter((r) => isXmlResult(r) || isCsvResult(r)).length,
    PDF: allResults.filter(isPdfResult).length,
    API: allResults.filter(isApiResult).length,
  };

  const filteredResults = allResults.filter((r) => {
    const q = indicatorSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.indicator_id.toLowerCase().includes(q) ||
      r.display_name.toLowerCase().includes(q) ||
      r.source_url.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    // Type filter
    if (typeFilter === "SCRAPE" && !isScrapeResult(r)) return false;
    if (typeFilter === "FEED" && !(isXmlResult(r) || isCsvResult(r))) return false;
    if (typeFilter === "PDF" && !isPdfResult(r)) return false;
    if (typeFilter === "API" && !isApiResult(r)) return false;

    // Status filter
    if (statusFilter === "MATCHED" && !(r.status === "SUCCESS" && r.is_matched)) return false;
    if (statusFilter === "MISMATCHED" && !(r.status === "SUCCESS" && !r.is_matched)) return false;
    if (statusFilter === "ERROR" && r.status !== "ERROR") return false;
    if (statusFilter === "SKIPPED" && r.status !== "SKIPPED") return false;

    return true;
  });

  const summary = data?.summary;
  const matchRate =
    summary && summary.total_indicators > 0
      ? Math.round((summary.matched / summary.total_indicators) * 100)
      : 0;

  const isCurrentlyValidating = validatingKey !== null || customLoading;

  // Extract unique countries and provinces present in loaded workbooks
  const distinctWorkbookCountries = Array.from(
    new Set(workbooks.map((wb) => wb.country || "Papua New Guinea"))
  );
  const distinctWorkbookProvinces = Array.from(
    new Set(workbooks.map((wb) => wb.province || "National Capital District"))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                RXBE Validator
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                {activeSheetInfo
                  ? `${activeSheetInfo.country} · ${activeSheetInfo.province}`
                  : data?.country ?? "Multi-Country & State"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Country-organized Excel workbook sheets, live source audit, and benchmark tolerance validation
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowCustomTester(!showCustomTester);
                if (!customJson) {
                  setCustomJson(
                    JSON.stringify(
                      {
                        request_id: "REQ-CUSTOM-TEST",
                        project_metadata: {
                          country: activeSheetInfo?.country || "Papua New Guinea",
                          country_code: activeSheetInfo?.countryCode || "PG",
                          province: activeSheetInfo?.province || "National Capital District",
                        },
                        indicators: [
                          {
                            indicator_id: "central_bank_repo_rate",
                            category: "Country Indicators",
                            display_name: "Kina Facility Rate",
                            source_url: "https://tradingeconomics.com/papua-new-guinea/interest-rate",
                            json_path: null,
                            ui_value: 5.0,
                            tolerance: 0,
                          },
                        ],
                      },
                      null,
                      2
                    )
                  );
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              {showCustomTester ? "Close Payload" : "Custom JSON"}
            </button>

            {activeSheetInfo && (
              <button
                onClick={revalidateActiveSheet}
                disabled={isCurrentlyValidating}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isCurrentlyValidating ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{isCurrentlyValidating ? "Validating..." : "Re-validate Sheet"}</span>
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("sheets")}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  viewMode === "sheets"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                📊 Sheets
              </button>
              <button
                onClick={() => setViewMode("png")}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                  viewMode === "png"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🇵🇬 PNG Scrapers
              </button>
            </div>
          </div>
        </header>

        {viewMode === "png" ? (
          <PNGValidatorView />
        ) : (
          <>
            {/* Global Error Banner */}
            {error && (
              <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-200 ml-3 text-sm"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Custom JSON Drawer */}
            {showCustomTester && (
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-200">Custom Request Payload</h3>
                    <p className="text-[11px] text-zinc-500">
                      Execute validation for any custom indicator array via POST /api/data
                    </p>
                  </div>
                  <button
                    onClick={runCustomValidation}
                    disabled={customLoading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {customLoading ? "Validating..." : "Execute Test"}
                  </button>
                </div>
            <textarea
              value={customJson}
              onChange={(e) => setCustomJson(e.target.value)}
              rows={8}
              className="w-full font-mono text-xs bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
        )}

        {/* Upload Modal with Country & State Selection */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Upload Excel Sheet</h3>
                  <p className="text-xs text-zinc-400">
                    Select country and state to save sheet in <code className="text-zinc-300 font-mono">uploads/&lt;country&gt;/&lt;state&gt;/</code>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadError(null);
                  }}
                  className="text-zinc-500 hover:text-zinc-300 text-lg leading-none p-1"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
                {uploadError && (
                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300">
                    {uploadError}
                  </div>
                )}

                {/* Country Selection */}
                <div className="space-y-1.5">
                  <label className="block font-medium text-zinc-300">Country</label>
                  <select
                    value={selectedCountryCode}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600 text-xs"
                  >
                    {countryOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                    <option value="CUSTOM">Custom / Other Country...</option>
                  </select>

                  {selectedCountryCode === "CUSTOM" && (
                    <input
                      type="text"
                      placeholder="Enter Country Name"
                      value={customCountryName}
                      onChange={(e) => setCustomCountryName(e.target.value)}
                      className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                      required
                    />
                  )}
                </div>

                {/* State / Province Selection */}
                <div className="space-y-1.5">
                  <label className="block font-medium text-zinc-300">State / Province</label>
                  {selectedCountryCode !== "CUSTOM" ? (
                    <select
                      value={selectedProvince}
                      onChange={(e) => setSelectedProvince(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600 text-xs"
                    >
                      {currentProvinces.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      <option value="CUSTOM">Custom / Other State...</option>
                    </select>
                  ) : null}

                  {(selectedCountryCode === "CUSTOM" || selectedProvince === "CUSTOM") && (
                    <input
                      type="text"
                      placeholder="Enter State / Province / District"
                      value={customProvinceName}
                      onChange={(e) => setCustomProvinceName(e.target.value)}
                      className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                      required
                    />
                  )}
                </div>

                {/* File Picker */}
                <div className="space-y-1.5">
                  <label className="block font-medium text-zinc-300">Excel File (.xlsx, .xls)</label>
                  <div className="border border-dashed border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 bg-zinc-950/40 transition-colors">
                    <input
                      type="file"
                      id="modal-file-input"
                      accept=".xlsx,.xls"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label
                      htmlFor="modal-file-input"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      {selectedFile ? (
                        <div>
                          <p className="font-semibold text-zinc-200">{selectedFile.name}</p>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-zinc-300 font-medium">Click to browse or drop Excel file</p>
                          <p className="text-[11px] text-zinc-500">Supports .xlsx and .xls workbooks</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Directory Destination Preview */}
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1 font-mono text-[11px]">
                  <span className="text-zinc-500 block text-[10px] uppercase tracking-wider font-sans font-medium">
                    Saving destination:
                  </span>
                  <div className="text-emerald-400 break-all flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span>uploads/{effectiveCountryDir}/{effectiveStateDir}/{selectedFile ? selectedFile.name : "&lt;sheet.xlsx&gt;"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadError(null);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                  >
                    {uploading && (
                      <svg className="w-3.5 h-3.5 animate-spin text-zinc-900" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    <span>{uploading ? "Saving..." : "Upload & Save Sheet"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Workbooks & Sheets Section */}
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <span>Excel Workbooks & Sheets</span>
                <span className="text-[11px] font-normal text-zinc-400">
                  ({workbooks.reduce((acc, wb) => acc + wb.sheets.length, 0)} sheets found)
                </span>
              </h2>
              <p className="text-xs text-zinc-500">
                Organized by country and states. Select any sheet to validate using location-specific benchmarks.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowUploadModal(true);
                  setUploadError(null);
                }}
                disabled={uploading || isCurrentlyValidating}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Upload Excel</span>
              </button>
            </div>
          </div>

          {/* Filter Bar for Sheets Table */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Country Filter */}
              <select
                value={countryFilter}
                onChange={(e) => {
                  setCountryFilter(e.target.value);
                  setProvinceFilter("ALL");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
              >
                <option value="ALL">All Countries ({distinctWorkbookCountries.length})</option>
                {distinctWorkbookCountries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* State/Province Filter */}
              <select
                value={provinceFilter}
                onChange={(e) => setProvinceFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
              >
                <option value="ALL">All States/Provinces ({distinctWorkbookProvinces.length})</option>
                {distinctWorkbookProvinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              {(countryFilter !== "ALL" || provinceFilter !== "ALL") && (
                <button
                  onClick={() => {
                    setCountryFilter("ALL");
                    setProvinceFilter("ALL");
                  }}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Reset location
                </button>
              )}
            </div>

            {/* Quick search inside sheets table */}
            <div className="relative min-w-[200px]">
              <input
                type="text"
                placeholder="Search sheets or workbooks..."
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
              />
              <svg
                className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {sheetSearch && (
                <button
                  onClick={() => setSheetSearch("")}
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Sheets List Table */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 px-3.5 w-48">Country & State</th>
                    <th className="py-2.5 px-3.5">Workbook File</th>
                    <th className="py-2.5 px-3.5">Sheet Name</th>
                    <th className="py-2.5 px-3.5 w-24">Rows / Cols</th>
                    <th className="py-2.5 px-3.5 w-28">Status</th>
                    <th className="py-2.5 px-3.5 w-32 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {loadingWorkbooks ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        <div className="inline-flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Discovering workbooks & sheets in country directories...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredWorkbooks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No workbooks match the selected filters. Click &quot;Upload Excel&quot; to add a new sheet.
                      </td>
                    </tr>
                  ) : (
                    filteredWorkbooks.flatMap((wb) =>
                      wb.sheets.map((sheet) => {
                        const key = `${wb.filePath}::${sheet.name}`;
                        const isThisValidating = validatingKey === key;
                        const isActive =
                          activeSheetInfo?.filePath === wb.filePath &&
                          activeSheetInfo?.sheetName === sheet.name;

                        return (
                          <tr
                            key={key}
                            className={`hover:bg-zinc-800/20 transition-colors ${
                              isActive ? "bg-zinc-850/30" : ""
                            }`}
                          >
                            {/* Country & State */}
                            <td className="py-2.5 px-3.5">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">
                                    {wb.countryCode || "PG"}
                                  </span>
                                  <span className="font-medium text-zinc-200 truncate">
                                    {wb.country || "Papua New Guinea"}
                                  </span>
                                </div>
                                <span className="text-[11px] text-zinc-400 block truncate">
                                  📍 {wb.province || "National Capital District"}
                                </span>
                              </div>
                            </td>

                            {/* Workbook File Info */}
                            <td className="py-2.5 px-3.5 max-w-[220px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-zinc-200 truncate" title={wb.displayName}>
                                  {wb.displayName}
                                </span>
                                {wb.isDefault ? (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0">
                                    Default
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                                    Uploaded
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono block truncate" title={wb.filePath}>
                                {wb.filePath}
                              </span>
                            </td>

                            {/* Sheet Name */}
                            <td className="py-2.5 px-3.5 font-medium text-zinc-300">
                              <span className="inline-flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {sheet.name}
                              </span>
                            </td>

                            {/* Rows & Columns */}
                            <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                              {sheet.rowCount} rows · {sheet.columnCount} cols
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              {isThisValidating ? (
                                <span className="inline-flex items-center gap-1.5 text-sky-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                                  Validating...
                                </span>
                              ) : isActive ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Active Sheet
                                </span>
                              ) : (
                                <span className="text-zinc-500">Ready</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() =>
                                    handleValidateSheet(
                                      wb.filePath,
                                      sheet.name,
                                      wb.displayName,
                                      wb.country,
                                      wb.countryCode,
                                      wb.province
                                    )
                                  }
                                  disabled={isCurrentlyValidating}
                                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                    isActive
                                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60"
                                  } disabled:opacity-50`}
                                >
                                  {isThisValidating ? (
                                    <span className="flex items-center gap-1">
                                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                      </svg>
                                      Running
                                    </span>
                                  ) : (
                                    "Validate Sheet"
                                  )}
                                </button>

                                {!wb.isDefault && (
                                  <button
                                    onClick={() => handleDeleteWorkbook(wb.filePath, wb.displayName)}
                                    title="Delete uploaded file"
                                    disabled={isCurrentlyValidating}
                                    className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/20 transition-colors disabled:opacity-50"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Validation Results Section */}
        {data ? (
          <div className="space-y-4">
            {/* Active Sheet Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-400">Validated Sheet:</span>
                <span className="font-semibold text-white">{activeSheetInfo?.sheetName}</span>
                <span className="text-zinc-500">·</span>
                <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
                  {activeSheetInfo?.country} ({activeSheetInfo?.countryCode})
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                  📍 {activeSheetInfo?.province}
                </span>
              </div>
              <div className="text-zinc-500 font-mono text-[11px]">
                Run ID: <span className="text-zinc-300">{data.test_run_id}</span>
              </div>
            </div>

            {/* Minimal Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-xs">
              <div className="px-3 py-1.5 border-r border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 text-[11px] block">Indicators</span>
                <span className="text-base font-semibold text-zinc-100">
                  {summary?.total_indicators ?? "—"}
                </span>
              </div>

              <div className="px-3 py-1.5 border-r border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 text-[11px] block">Matched</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-semibold text-emerald-400">
                    {summary?.matched ?? "—"}
                  </span>
                  {summary && summary.total_indicators > 0 && (
                    <span className="text-[11px] text-zinc-500">({matchRate}%)</span>
                  )}
                </div>
              </div>

              <div className="px-3 py-1.5 border-r border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 text-[11px] block">Mismatches</span>
                <span
                  className={`text-base font-semibold ${
                    (summary?.mismatched ?? 0) > 0 ? "text-amber-400" : "text-zinc-500"
                  }`}
                >
                  {summary?.mismatched ?? "—"}
                </span>
              </div>

              <div className="px-3 py-1.5 border-r border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 text-[11px] block">Errors</span>
                <span
                  className={`text-base font-semibold ${
                    (summary?.errors ?? 0) > 0 ? "text-red-400" : "text-zinc-500"
                  }`}
                >
                  {summary?.errors ?? "—"}
                </span>
              </div>

              <div className="px-3 py-1.5 col-span-2 sm:col-span-1 flex flex-col justify-center">
                <span className="text-zinc-500 text-[11px] block">Overall Status</span>
                <div>
                  {summary ? (
                    summary.overall_status ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Passed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Review Required
                      </span>
                    )
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter and Search Bar for Indicator Results */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              {/* Source Type Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {(
                  [
                    ["ALL", `All (${typeCounts.ALL})`],
                    ["SCRAPE", `Scrape (${typeCounts.SCRAPE})`],
                    ["FEED", `Feeds (${typeCounts.FEED})`],
                    ["PDF", `PDF (${typeCounts.PDF})`],
                    ["API", `APIs (${typeCounts.API})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTypeFilter(key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      typeFilter === key
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Search & Status dropdown */}
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                >
                  <option value="ALL">All Status</option>
                  <option value="MATCHED">Matched</option>
                  <option value="MISMATCHED">Mismatched</option>
                  <option value="ERROR">Errors</option>
                  <option value="SKIPPED">Skipped</option>
                </select>

                <div className="relative min-w-[200px] sm:min-w-[240px]">
                  <input
                    type="text"
                    placeholder="Search indicators..."
                    value={indicatorSearch}
                    onChange={(e) => setIndicatorSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                  <svg
                    className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  {indicatorSearch && (
                    <button
                      onClick={() => setIndicatorSearch("")}
                      className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Indicators Results Table */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/70 text-zinc-400 font-medium border-b border-zinc-800/80">
                    <tr>
                      <th className="py-2.5 px-4 w-28">Status</th>
                      <th className="py-2.5 px-4">Indicator</th>
                      <th className="py-2.5 px-4 w-24">Type</th>
                      <th className="py-2.5 px-4">Source Value</th>
                      <th className="py-2.5 px-4">Target UI</th>
                      <th className="py-2.5 px-4">Difference</th>
                      <th className="py-2.5 px-4">Source Domain</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-zinc-500">
                          No indicators match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((r, index) => {
                        const type = getSourceType(r);
                        const domain = getDomainFromUrl(r.source_url);

                        return (
                          <tr
                            key={`${r.indicator_id}-${index}`}
                            className="hover:bg-zinc-800/30 transition-colors"
                          >
                            {/* Status */}
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              {r.status === "SUCCESS" && r.is_matched && (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  Matched
                                </span>
                              )}
                              {r.status === "SUCCESS" && !r.is_matched && (
                                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                  Mismatch
                                </span>
                              )}
                              {r.status === "SKIPPED" && (
                                <span className="inline-flex items-center gap-1.5 text-zinc-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                                  Skipped
                                </span>
                              )}
                              {r.status === "ERROR" && (
                                <div>
                                  <span className="inline-flex items-center gap-1.5 text-red-400 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                    Error
                                  </span>
                                  {r.message && (
                                    <p
                                      className="text-[10px] text-red-400/80 max-w-[140px] truncate"
                                      title={r.message}
                                    >
                                      {r.message}
                                    </p>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Indicator Name & ID */}
                            <td className="py-2.5 px-4 max-w-[280px]">
                              <p className="font-medium text-zinc-200 truncate">{r.display_name}</p>
                              <p className="text-[11px] text-zinc-500 font-mono truncate">{r.indicator_id}</p>
                            </td>

                            {/* Source Type Badge */}
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${type.style}`}
                              >
                                {type.label}
                              </span>
                            </td>

                            {/* Extracted Live Value */}
                            <td className="py-2.5 px-4 whitespace-nowrap font-mono">
                              <span
                                className={
                                  r.source_value === null
                                    ? "text-zinc-600"
                                    : r.is_matched
                                      ? "text-emerald-400 font-medium"
                                      : "text-amber-400 font-medium"
                                }
                              >
                                {r.source_value !== null ? String(r.source_value) : "—"}
                              </span>
                            </td>

                            {/* Target UI Value */}
                            <td className="py-2.5 px-4 whitespace-nowrap font-mono text-zinc-300">
                              {String(r.ui_value)}
                            </td>

                            {/* Difference & Tolerance */}
                            <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-zinc-400">
                              {r.difference !== null ? (
                                <span>
                                  {r.difference > 0 ? `+${r.difference}` : r.difference}
                                  <span className="text-zinc-500 text-[10px] ml-1">
                                    (±{r.tolerance})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>

                            {/* Source URL / Domain */}
                            <td className="py-2.5 px-4 max-w-[180px] whitespace-nowrap">
                              {r.source_url.startsWith("http") ? (
                                <a
                                  href={r.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 truncate max-w-full"
                                  title={r.source_url}
                                >
                                  <span className="truncate">{domain}</span>
                                  <svg
                                    className="w-3 h-3 text-zinc-500 shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-zinc-500 font-mono text-[11px]">{r.source_url}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer Count */}
              <div className="py-2 px-4 bg-zinc-900/50 border-t border-zinc-800/60 text-[11px] text-zinc-500 flex items-center justify-between">
                <span>
                  Showing {filteredResults.length} of {allResults.length} indicators
                </span>
                {filteredResults.length < allResults.length && (
                  <button
                    onClick={() => {
                      setIndicatorSearch("");
                      setTypeFilter("ALL");
                      setStatusFilter("ALL");
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Empty / Initial State */
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 py-16 px-4 text-center space-y-2">
            <svg
              className="w-8 h-8 text-zinc-600 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xs font-semibold text-zinc-300">No Sheet Validated Yet</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Select any sheet from the table above and click <span className="text-zinc-300 font-medium">Validate Sheet</span> to extract indicators and audit against live sources for that country and state.
            </p>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
