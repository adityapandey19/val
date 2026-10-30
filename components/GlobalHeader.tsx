"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function GlobalHeader() {
  const pathname = usePathname();

  const isStep1 = pathname === "/step_1" || pathname === "/";
  const isStep3 = pathname === "/step_3";

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <Link href="/step_1" className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-white">
              RXBE Validator
            </span>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
          <Link
            href="/step_1"
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              isStep1
                ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/80"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            Step 1
          </Link>

          <Link
            href="/step_3"
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              isStep3
                ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/80"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
            }`}
          >
            Step 3
          </Link>
        </nav>
      </div>
    </header>
  );
}

