"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

export default function PublicDnsRefreshButton({
  className,
  disabled = false,
}: {
  className?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className={isPending ? "implementation-dns-spinner" : ""} size={17} />
      {isPending ? "Controleren..." : "Opnieuw controleren"}
    </button>
  );
}
