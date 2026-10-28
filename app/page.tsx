"use client";

import { useState, useEffect } from "react";
import type { ValidationResponse, IndicatorResult } from "@/helper/types";

type ModeType = "wizard" | "pdf" | "custom";
type TypeFilter = "ALL" | "SCRAPE" | "FEED" | "PDF" | "API";
type StatusFilter = "ALL" | "MATCHED" | "MISMATCHED" | "ERROR" | "SKIPPED";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [currentMode, setCurrentMode] = useState<ModeType>("wizard");
  const [showCustomTester, setShowCustomTester] = useState(false);
  const [customJson, setCustomJson] = useState("");

  async function runValidation(mode: ModeType = currentMode) {
    setLoading(true);
    setError(null);
    setCurrentMode(mode);
    try {
      let res: Response;
      if (mode === "custom") {
        let body: unknown;
        try {
          body = JSON.parse(customJson);
        } catch {
          throw new Error("Invalid JSON payload. Please check the syntax.");
        }
        res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else if (mode === "pdf") {
        res = await fetch("/api/data?pdf_only=true");
      } else {
        res = await fetch("/api/data?wizard=true");
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status}`);
      }

      const json: ValidationResponse = await res.json();
      setData(json);
      if (mode === "custom") {
        setShowCustomTester(false);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/data?wizard=true")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ValidationResponse) => {
        if (!ignore) setData(json);
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load validation data.");
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

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

  const allResults = data?.results ?? [];

  const typeCounts = {
    ALL: allResults.length,
    SCRAPE: allResults.filter(isScrapeResult).length,
    FEED: allResults.filter((r) => isXmlResult(r) || isCsvResult(r)).length,
    PDF: allResults.filter(isPdfResult).length,
    API: allResults.filter(isApiResult).length,
  };

  const filteredResults = allResults.filter((r) => {
    const q = search.trim().toLowerCase();
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
                {data?.country ?? "Papua New Guinea"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Live source audit and benchmark tolerance validation
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
                        project_metadata: { country: "Papua New Guinea", country_code: "PG" },
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

            <button
              onClick={() => runValidation(currentMode)}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
            >
              <svg
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
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
              <span>{loading ? "Validating..." : "Re-validate"}</span>
            </button>
          </div>
        </header>

        {/* Dataset Segmented Control */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 bg-zinc-900/90 rounded-lg border border-zinc-800/80 text-xs">
            {(
              [
                ["wizard", "Wizard Step 1", "34"],
                ["pdf", "PDF Documents", "18"],
                ...(currentMode === "custom"
                  ? [["custom", "Custom Payload", String(allResults.length)] as const]
                  : []),
              ] as const
            ).map(([key, label, count]) => {
              const active = currentMode === key && !showCustomTester;
              return (
                <button
                  key={key}
                  onClick={() => runValidation(key)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    active
                      ? "bg-zinc-800 text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                  <span
                    className={`ml-1.5 text-[10px] ${
                      active ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {summary && (
            <div className="text-xs text-zinc-500 self-center">
              Test Run: <span className="text-zinc-400 font-mono">{data?.test_run_id}</span>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-200 ml-3"
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
                  Execute validation for any custom indicators via POST /api/data
                </p>
              </div>
              <button
                onClick={() => runValidation("custom")}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? "Validating..." : "Execute Test"}
              </button>
            </div>
            <textarea
              value={customJson}
              onChange={(e) => setCustomJson(e.target.value)}
              rows={10}
              className="w-full font-mono text-xs bg-zinc-950 p-3 rounded-lg border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
        )}

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

        {/* Filter and Search Bar */}
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

          {/* Right: Search & Status dropdown */}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Minimal Table */}
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
                {loading && filteredResults.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      <div className="inline-flex items-center gap-2">
                        <svg className="w-4 h-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Extracting live data...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredResults.length === 0 ? (
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
                  setSearch("");
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
    </div>
  );
}
