import type { Metadata } from "next";
import DealApprovalForm from "@/components/deal-approval-form";

export const metadata: Metadata = {
  title: "Offerte akkoord | Smart Trade",
  description: "Bekijk en bevestig uw Smart Trade-offerte.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DealApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ approvalId: string }>;
  searchParams: Promise<{ token?: string; v?: string }>;
}) {
  const { approvalId } = await params;
  const query = await searchParams;

  return (
    <DealApprovalForm
      approvalId={approvalId}
      token={query.token ?? ""}
      tokenVersion={Number(query.v ?? 0)}
    />
  );
}
