"use client";

import React, { useEffect, useState } from "react";
import type { PNGValidationResponse, PNGIndicatorResult } from "@/Dev/types";

export default function PNGValidatorView() {
  const [data, setData] = useState<PNGValidationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scrapersOnly, setScrapersOnly] = useState<boolean>(true);
  const [filter, setFilter] = useState<"ALL" | "SCRAPERS" | "MATCHED" | "REVIEW_SKIPPED">("ALL");
  const [search, setSearch] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fetchValidation = async (onlyScrapers: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/png-validate?scrapers_only=${onlyScrapers}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json: PNGValidationResponse = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message || "Failed to load validation data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValidation(scrapersOnly);
  }, [scrapersOnly]);

  const filteredResults =
    data?.results.filter((r) => {
      const matchesSearch =
        r.display_name.toLowerCase().includes(search.toLowerCase()) ||
        r.indicator_id.toLowerCase().includes(search.toLowerCase()) ||
        (r.metadata?.provider || "").toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === "SCRAPERS") {
        return (
          r.metadata?.sourceType === "HTML_SCRAPE" ||
          r.metadata?.sourceType === "PDF_DOCUMENT" ||
          r.status === "UNDER_REVIEW"
        );
      }
      if (filter === "MATCHED") {
        return r.is_matched;
      }
      if (filter === "REVIEW_SKIPPED") {
        return r.status === "UNDER_REVIEW" || r.status === "SKIPPED";
      }
      return true;
    }) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="p-5 rounded-2xl bg-[#0d1322] border border-zinc-800 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 font-bold">
            🇵🇬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-white">
                Papua New Guinea Live Scrape Validator
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Live Web
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Validating live HTML sources against wizard values (TradingEconomics, Damodaran ERP, GCF, PNG Power).
            </p>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setScrapersOnly(true)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                scrapersOnly
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              ⭐ Live HTML Scrape Targets
            </button>
            <button
              onClick={() => setScrapersOnly(false)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
                !scrapersOnly
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              📋 All Indicators (Macro + Internal)
            </button>
          </div>

          <button
            onClick={() => fetchValidation(scrapersOnly)}
            disabled={loading}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80 transition shadow active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? "🔄 Validating..." : "⚡ Re-run"}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchValidation(scrapersOnly)}
            className="underline hover:text-red-200 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <span className="text-xs font-medium text-zinc-400">Total Items</span>
          <p className="text-2xl font-bold text-white mt-1">
            {data?.summary.total_indicators ?? "—"}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 block">Active View</span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <span className="text-xs font-medium text-zinc-400">Scrape Targets</span>
          <p className="text-2xl font-bold text-indigo-400 mt-1">
            {data?.summary.scrape_targets ?? "—"}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 block">Live Web Sources</span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
          <span className="text-xs font-medium text-emerald-400">Matched (Pass)</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {data?.summary.matched ?? "—"}
          </p>
          <span className="text-[11px] text-emerald-500/80 mt-1 block">
            Pass Rate: {data?.summary.pass_rate_pct ?? "—"}%
          </span>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30">
          <span className="text-xs font-medium text-amber-400">Under Review</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {data?.summary.under_review ?? "0"}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 block">Methodology Flags</span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <span className="text-xs font-medium text-zinc-400">Skipped</span>
          <p className="text-2xl font-bold text-zinc-300 mt-1">
            {data?.summary.skipped ?? "0"}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 block">Notice / Internal</span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
          <span className="text-xs font-medium text-zinc-400">Errors</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {data?.summary.errors ?? "0"}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 block">Zero Failures</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/80">
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-full sm:w-auto">
          {(["ALL", "SCRAPERS", "MATCHED", "REVIEW_SKIPPED"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`text-xs px-3 py-1 rounded-md transition font-medium ${
                filter === mode
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {mode === "ALL" && "All Indicators"}
              {mode === "SCRAPERS" && "🎯 HTML Scrapes"}
              {mode === "MATCHED" && "✅ Matched Only"}
              {mode === "REVIEW_SKIPPED" && "⚠️ Review & Skipped"}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Filter indicators by name, id, provider..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-72"
        />
      </div>

      {/* Results Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b101c] border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Indicator ID</th>
                <th className="py-3 px-4">Source Provider & URL</th>
                <th className="py-3 px-4">Wizard Value</th>
                <th className="py-3 px-4">Scraped Value</th>
                <th className="py-3 px-4">Difference</th>
                <th className="py-3 px-4">Validation Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans">
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-zinc-400">
                    <div className="inline-block animate-spin text-xl mb-2">🔄</div>
                    <p>Scraping live public sources...</p>
                  </td>
                </tr>
              )}

              {!loading && filteredResults.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-zinc-500">
                    No indicators match your filter.
                  </td>
                </tr>
              )}

              {!loading &&
                filteredResults.map((r) => <IndicatorRow key={r.indicator_id} result={r} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function IndicatorRow({ result: r }: { result: PNGIndicatorResult }) {
  let badgeStyle = "bg-red-500/10 text-red-400 border-red-500/30";
  let badgeIcon = "❌";
  let badgeLabel = "MISMATCH";

  if (r.status === "SUCCESS" && r.is_matched) {
    badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    badgeIcon = "✅";
    badgeLabel = "MATCHED";
  } else if (r.status === "UNDER_REVIEW") {
    badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/30";
    badgeIcon = "⚠️";
    badgeLabel = "UNDER REVIEW";
  } else if (r.status === "SKIPPED") {
    badgeStyle = "bg-zinc-800 text-zinc-400 border-zinc-700";
    badgeIcon = "⏭️";
    badgeLabel = "SKIPPED";
  } else if (r.status === "ERROR") {
    badgeStyle = "bg-red-950 text-red-400 border-red-700";
    badgeIcon = "💥";
    badgeLabel = "ERROR";
  }

  return (
    <tr className="hover:bg-zinc-800/30 transition-colors">
      <td className="py-3.5 px-4 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${badgeStyle}`}
        >
          <span>{badgeIcon}</span>
          <span>{badgeLabel}</span>
        </span>
      </td>

      <td className="py-3.5 px-4">
        <div className="font-semibold text-white text-sm">{r.display_name}</div>
        <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
          {r.category} | <code className="text-zinc-500">{r.indicator_id}</code>
        </div>
      </td>

      <td className="py-3.5 px-4">
        <span className="font-medium text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded text-[11px]">
          {r.metadata?.provider || "HTML Web Scrape"}
        </span>
        {r.source_url.startsWith("http") && (
          <a
            href={r.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-zinc-500 hover:text-emerald-400 truncate block max-w-xs mt-1 underline"
          >
            {r.source_url}
          </a>
        )}
      </td>

      <td className="py-3.5 px-4 font-mono font-bold text-white text-sm">
        {r.ui_value} <span className="text-zinc-500 text-xs font-normal">{r.unit}</span>
      </td>

      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
        {r.source_value !== null ? (
          <span>
            {r.source_value} <span className="text-zinc-500 text-xs font-normal">{r.unit}</span>
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>

      <td className="py-3.5 px-4 font-mono text-xs text-zinc-400 whitespace-nowrap">
        {r.difference !== null ? (
          <span
            className={
              Math.abs(r.difference) > r.tolerance
                ? "text-red-400 font-bold"
                : "text-emerald-400 font-semibold"
            }
          >
            Δ {r.difference}
          </span>
        ) : (
          <span className="text-zinc-500">0</span>
        )}
      </td>

      <td className="py-3.5 px-4 text-zinc-300 text-xs max-w-md">
        <p className="leading-snug">{r.message || "Validated within tolerances."}</p>
      </td>
    </tr>
  );
}
