"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-32 text-center">
      <p className="text-lg font-semibold text-[var(--yt-text)] mb-2">Something went wrong</p>
      <p className="text-sm text-[var(--yt-text-2)] mb-6 max-w-sm">
        This page hit an error while loading. Trying again usually clears it.
      </p>
      <Button variant="white" onClick={() => unstable_retry()}>
        <RotateCw className="w-4 h-4" />
        Try again
      </Button>
    </div>
  );
}
