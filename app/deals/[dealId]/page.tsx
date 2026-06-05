import DealEditor from "@/components/deal-editor";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  return <DealEditor dealId={dealId} />;
}
