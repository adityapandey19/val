"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/step_1");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        Redirecting to Step 1...
      </div>
    </div>
  );
}
