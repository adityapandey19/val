"use client";

import React from "react";

interface StatusBadgeProps {
  status: "MATCHED" | "MISMATCHED" | "REACHABLE" | "ERROR" | "SKIPPED";
  difference?: number | null;
  className?: string;
}

export function StatusBadge({ status, difference, className = "" }: StatusBadgeProps) {
  switch (status) {
    case "MATCHED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          MATCHED
        </span>
      );

    case "REACHABLE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-sm ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          REACHABLE
        </span>
      );

    case "MISMATCHED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          MISMATCHED
          {difference !== null && difference !== undefined && (
            <span className="text-[10px] opacity-75 font-mono">
              ({difference > 0 ? `+${difference}` : difference})
            </span>
          )}
        </span>
      );

    case "ERROR":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          ERROR
        </span>
      );

    case "SKIPPED":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700 shadow-sm ${className}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
          SKIPPED
        </span>
      );

    default:
      return null;
  }
}
