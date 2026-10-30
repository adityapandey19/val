"use client";

import React, { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Dialog container */}
      <div className="min-h-full flex items-center justify-center p-4">
        <div
          className={`relative w-full ${maxWidth} bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 z-10 transition-all animate-in zoom-in-95 duration-150 space-y-5`}
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-zinc-800/80">
            <div>
              <h3 className="text-base font-semibold text-white">{title}</h3>
              {description && (
                <p className="mt-0.5 text-xs text-zinc-400">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300 text-lg leading-none p-1 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

