import DealEditor from "@/components/deal-editor";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealEditor dealId={id} />;
}
