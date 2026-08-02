import ImplementationEditor from "@/components/implementation-editor";

export default async function ImplementationDetailPage({
  params,
}: {
  params: Promise<{ implementationId: string }>;
}) {
  const { implementationId } = await params;

  return <ImplementationEditor implementationId={implementationId} />;
}
