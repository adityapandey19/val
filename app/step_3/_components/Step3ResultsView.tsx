"use client";

import React, { useState } from "react";
import type { ValidationResponse, IndicatorResult } from "@/lib/types";

interface Step3ResultsViewProps {
  data: ValidationResponse;
  sheetDisplayName?: string;
}

type TypeFilter = "ALL" | "SCRAPE" | "FEED" | "REACHABILITY" | "API" | "PDF";
type StatusFilter = "ALL" | "MATCHED" | "MISMATCHED" | "ERROR" | "SKIPPED";

export function Step3ResultsView({ data, sheetDisplayName }: Step3ResultsViewProps) {
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const allResults = data.results ?? [];

  const isReachabilityResult = (r: IndicatorResult) => {
    return (
      r.is_reachability === true ||
      r.display_name.startsWith("[Reachability]") ||
      r.indicator_id.startsWith("reachability_") ||
      r.ui_value === "HTTP 200"
    );
  };

  const isPdfResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    return !isReachabilityResult(r) && (url.endsWith(".pdf") || url.includes(".pdf"));
  };

  const isXmlResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    const id = (r.indicator_id || "").toLowerCase();
    return (
      !isReachabilityResult(r) &&
      (url.includes("/rss") ||
        url.includes(".xml") ||
        id.includes("xml_feed") ||
        id.includes("news_"))
    );
  };

  const isCsvResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    return !isReachabilityResult(r) && (url.endsWith(".csv") || url.includes("format=csv"));
  };

  const isScrapeResult = (r: IndicatorResult) => {
    if (isReachabilityResult(r) || isPdfResult(r) || isXmlResult(r) || isCsvResult(r)) {
      return false;
    }
    const url = (r.source_url || "").toLowerCase();
    return (
      url.includes("pages.stern.nyu.edu") ||
      url.includes("tradingeconomics.com") ||
      url.includes("gsa.gov") ||
      url.includes("greenclimate.fund") ||
      url.includes("iccc.gov.pg")
    );
  };

  const isApiResult = (r: IndicatorResult) => {
    return (
      !isReachabilityResult(r) &&
      !isPdfResult(r) &&
      !isXmlResult(r) &&
      !isCsvResult(r) &&
      !isScrapeResult(r) &&
      (r.source_url || "").startsWith("http")
    );
  };

  const getSourceType = (r: IndicatorResult): { label: string; style: string } => {
    if (isReachabilityResult(r)) {
      return { label: "Reachability", style: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" };
    }
    if (isPdfResult(r)) {
      return { label: "PDF", style: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20" };
    }
    if (isXmlResult(r)) {
      return { label: "Feed", style: "text-purple-400 bg-purple-500/10 border-purple-500/20" };
    }
    if (isCsvResult(r)) {
      return { label: "CSV", style: "text-teal-400 bg-teal-500/10 border-teal-500/20" };
    }
    if (isScrapeResult(r)) {
      return { label: "Scrape", style: "text-amber-400 bg-amber-500/10 border-amber-500/20" };
    }
    if ((r.source_url || "").startsWith("http")) {
      return { label: "API", style: "text-sky-400 bg-sky-500/10 border-sky-500/20" };
    }
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

  const typeCounts = {
    ALL: allResults.length,
    SCRAPE: allResults.filter(isScrapeResult).length,
    FEED: allResults.filter((r) => isXmlResult(r) || isCsvResult(r)).length,
    REACHABILITY: allResults.filter(isReachabilityResult).length,
    API: allResults.filter(isApiResult).length,
    PDF: allResults.filter(isPdfResult).length,
  };

  const filteredResults = allResults.filter((r) => {
    const q = indicatorSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.indicator_id.toLowerCase().includes(q) ||
      r.display_name.toLowerCase().includes(q) ||
      r.source_url.toLowerCase().includes(q) ||
      (r.screen_section || "").toLowerCase().includes(q) ||
      (r.where_it_shows || "").toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (typeFilter === "SCRAPE" && !isScrapeResult(r)) return false;
    if (typeFilter === "FEED" && !(isXmlResult(r) || isCsvResult(r))) return false;
    if (typeFilter === "REACHABILITY" && !isReachabilityResult(r)) return false;
    if (typeFilter === "PDF" && !isPdfResult(r)) return false;
    if (typeFilter === "API" && !isApiResult(r)) return false;

    if (statusFilter === "MATCHED" && !(r.status === "SUCCESS" && r.is_matched)) return false;
    if (statusFilter === "MISMATCHED" && !(r.status === "SUCCESS" && !r.is_matched)) return false;
    if (statusFilter === "ERROR" && r.status !== "ERROR") return false;
    if (statusFilter === "SKIPPED" && r.status !== "SKIPPED") return false;

    return true;
  });

  const summary = data.summary;
  const matchRate =
    summary && summary.total_indicators > 0
      ? Math.round((summary.matched / summary.total_indicators) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Active Sheet Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-zinc-400">Validated Sheet:</span>
          <span className="font-semibold text-white">{sheetDisplayName || "Step 3 Sheet"}</span>
          <span className="text-zinc-500">·</span>
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-medium">
            {data.country} ({data.country_code})
          </span>
          {data.province && (
            <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
              📍 {data.province}
            </span>
          )}
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
              ["REACHABILITY", `Reachability (${typeCounts.REACHABILITY})`],
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
              placeholder="Search Step 3 indicators..."
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
                <th className="py-2.5 px-4">Screen Section & Indicator</th>
                <th className="py-2.5 px-4 w-24">Type</th>
                <th className="py-2.5 px-4">Live Source Value</th>
                <th className="py-2.5 px-4">Target UI</th>
                <th className="py-2.5 px-4">Difference</th>
                <th className="py-2.5 px-4">Source Domain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    No Step 3 indicators match the selected filter.
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

                      {/* Screen Section & Indicator Name */}
                      <td className="py-2.5 px-4 max-w-[280px]">
                        {r.screen_section && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.5 rounded font-mono block w-fit mb-0.5 truncate">
                            {r.screen_section}
                          </span>
                        )}
                        <p className="font-medium text-zinc-200 truncate">{r.display_name}</p>
                        <p className="text-[11px] text-zinc-500 font-mono truncate">{r.indicator_id}</p>
                        {r.where_it_shows && (
                          <span className="text-[10px] text-zinc-500 block truncate">
                            UI: {r.where_it_shows}
                          </span>
                        )}
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
  );
}
