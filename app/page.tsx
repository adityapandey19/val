"use client";

import { useState, useEffect } from "react";
import type { ValidationResponse, IndicatorResult } from "@/helper/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "MATCHED" | "MISMATCHED" | "SKIPPED" | "ERROR" | "PDF">("ALL");
  const [activeTab, setActiveTab] = useState<"dashboard" | "json">("dashboard");
  const [customJson, setCustomJson] = useState("");

  async function runValidation(mode: "pdf" | "all" | "custom") {
    setLoading(true);
    setError(null);
    try {
      let res: Response;
      if (mode === "custom") {
        let body: unknown;
        try {
          body = JSON.parse(customJson);
        } catch {
          throw new Error("Invalid custom JSON payload. Please verify syntax.");
        }
        res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else if (mode === "pdf") {
        res = await fetch("/api/data?pdf_only=true");
      } else {
        res = await fetch("/api/data?all=true");
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP ${res.status} ${res.statusText}`);
      }

      const json: ValidationResponse = await res.json();
      setData(json);
      if (mode === "custom") {
        setActiveTab("dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  // Run PDF validation on initial mount
  useEffect(() => {
    let ignore = false;
    fetch("/api/data?pdf_only=true")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ValidationResponse) => {
        if (!ignore) {
          setData(json);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Validation failed.");
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const isPdfResult = (r: IndicatorResult) => {
    const url = (r.source_url || "").toLowerCase();
    return (
      url.endsWith(".pdf") ||
      url.includes(".pdf") ||
      r.indicator_id.includes("blend") ||
      r.indicator_id.includes("tenor") ||
      r.indicator_id.includes("bready") ||
      r.indicator_id.includes("jica") ||
      r.indicator_id.includes("customary") ||
      r.indicator_id.includes("land_act")
    );
  };

  const filteredResults = (data?.results ?? []).filter((r) => {
    const matchesSearch =
      r.indicator_id.toLowerCase().includes(search.toLowerCase()) ||
      r.display_name.toLowerCase().includes(search.toLowerCase()) ||
      r.source_url.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === "MATCHED") return r.status === "SUCCESS" && r.is_matched;
    if (filter === "MISMATCHED") return r.status === "SUCCESS" && !r.is_matched;
    if (filter === "SKIPPED") return r.status === "SKIPPED";
    if (filter === "ERROR") return r.status === "ERROR";
    if (filter === "PDF") return isPdfResult(r);
    return true;
  });

  const summary = data?.summary;
  const matchRate =
    summary && summary.total_indicators > 0
      ? Math.round((summary.matched / summary.total_indicators) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Validation Engine
              </span>
              <span className="text-xs text-slate-400">Next.js 16 • Turbopack</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
              RXBE Indicator & PDF Data Validator
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Extracts data from Excel sources & PDFs, compares against UI JSON data, and validates tolerances with instant audit reporting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => runValidation("pdf")}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-sm transition-colors shadow-lg shadow-emerald-950 flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block animate-spin">⏳</span>
              ) : (
                <span>📄</span>
              )}
              Validate PDF Sources (18)
            </button>
            <button
              onClick={() => runValidation("all")}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium text-sm transition-colors border border-slate-700 flex items-center gap-2 cursor-pointer"
            >
              <span>🌐</span> All Indicators (45)
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "dashboard"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            📊 Validation Dashboard
          </button>
          <button
            onClick={() => {
              setActiveTab("json");
              if (!customJson) {
                setCustomJson(
                  JSON.stringify(
                    {
                      request_id: "REQ-CUSTOM-TEST",
                      project_metadata: { country: "Papua New Guinea", country_code: "PG" },
                      indicators: [
                        {
                          indicator_id: "bready_operational_efficiency",
                          category: "World Bank Business Ready - PNG",
                          display_name: "Operational Efficiency score",
                          source_url:
                            "https://www.worldbank.org/content/dam/sites/b-ready/documents/pdf/economy/2025/papua-new-guinea-2025.pdf",
                          json_path: null,
                          ui_value: 43,
                          unit: "points",
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
            className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "json"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚡ API Request Tester
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/30 text-red-200 text-sm flex items-center gap-3">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {activeTab === "dashboard" ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total</span>
                <p className="text-2xl font-bold text-white mt-1">{summary?.total_indicators ?? "—"}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Matched</span>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{summary?.matched ?? "—"}</p>
                <span className="text-[11px] text-emerald-500/80">{matchRate}% match rate</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Mismatched</span>
                <p className="text-2xl font-bold text-amber-400 mt-1">{summary?.mismatched ?? "—"}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">Skipped</span>
                <p className="text-2xl font-bold text-blue-400 mt-1">{summary?.skipped ?? "—"}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-red-400 uppercase tracking-wider">Errors</span>
                <p className="text-2xl font-bold text-red-400 mt-1">{summary?.errors ?? "—"}</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Overall Status</span>
                <p className="mt-1">
                  {summary ? (
                    summary.overall_status ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        PASSED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        REVIEW NEEDED
                      </span>
                    )
                  ) : (
                    "—"
                  )}
                </p>
                <span className="text-[11px] text-slate-500">{data?.country ?? "Papua New Guinea"}</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                {(
                  [
                    ["ALL", "All"],
                    ["PDF", "📄 PDF Only"],
                    ["MATCHED", "✅ Matched"],
                    ["MISMATCHED", "❌ Mismatch"],
                    ["SKIPPED", "⚠️ Skipped"],
                    ["ERROR", "⛔ Error"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      filter === key
                        ? "bg-emerald-600 text-white shadow"
                        : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[240px]">
                <input
                  type="text"
                  placeholder="Filter by indicator, name, or URL..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Indicator Results Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Indicator</th>
                      <th className="py-3 px-4">Source Type</th>
                      <th className="py-3 px-4">Extracted (Source)</th>
                      <th className="py-3 px-4">Target (UI)</th>
                      <th className="py-3 px-4">Diff / Tol</th>
                      <th className="py-3 px-4">Source URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                          {loading ? "Extracting and validating indicators..." : "No matching indicators found."}
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((r) => {
                        const isPdf = isPdfResult(r);
                        return (
                          <tr key={r.indicator_id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap font-sans">
                              {r.status === "SUCCESS" && r.is_matched && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  ✓ Matched
                                </span>
                              )}
                              {r.status === "SUCCESS" && !r.is_matched && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  ✕ Mismatch
                                </span>
                              )}
                              {r.status === "SKIPPED" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                  Skipped
                                </span>
                              )}
                              {r.status === "ERROR" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                  Error
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <p className="font-semibold text-white font-sans">{r.display_name}</p>
                              <p className="text-[11px] text-slate-400">{r.indicator_id}</p>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap font-sans">
                              {isPdf ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                  📄 PDF Document
                                </span>
                              ) : r.source_url.startsWith("http") ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/20">
                                  🌐 REST API
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                  Internal
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  r.source_value === null
                                    ? "text-slate-600"
                                    : r.is_matched
                                      ? "text-emerald-400"
                                      : "text-amber-400"
                                }`}
                              >
                                {r.source_value !== null ? String(r.source_value) : "—"}
                              </span>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap text-slate-300">
                              {String(r.ui_value)}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                              {r.difference !== null ? (
                                <span>
                                  diff: {r.difference} (tol: {r.tolerance})
                                </span>
                              ) : (
                                <span>—</span>
                              )}
                            </td>

                            <td className="py-3 px-4 max-w-[220px] truncate text-[11px]">
                              {r.source_url.startsWith("http") ? (
                                <a
                                  href={r.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-400 hover:underline hover:text-emerald-300"
                                  title={r.source_url}
                                >
                                  {r.source_url}
                                </a>
                              ) : (
                                <span className="text-slate-500">{r.source_url}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* JSON Request Tester */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Custom JSON Request Payload</h3>
                  <p className="text-xs text-slate-400">
                    Send custom indicators or test specific PDF URLs directly to <code className="text-emerald-400 font-mono">POST /api/data</code>.
                  </p>
                </div>
                <button
                  onClick={() => runValidation("custom")}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow cursor-pointer"
                >
                  {loading ? "Validating..." : "Send Request & Validate"}
                </button>
              </div>

              <textarea
                value={customJson}
                onChange={(e) => setCustomJson(e.target.value)}
                rows={16}
                className="w-full font-mono text-xs bg-slate-950 p-4 rounded-lg border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
