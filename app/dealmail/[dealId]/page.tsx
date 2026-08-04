import DealEditor from "@/components/deal-editor";

export default async function FocusedDealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  return <DealEditor dealId={dealId} focusMode />;
}
