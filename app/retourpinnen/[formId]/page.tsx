import type { Metadata } from "next";
import WorldlineReturnPinForm from "@/components/worldline-return-pin-form";

export const metadata: Metadata = {
  title: "Acceptatieformulier retourpinnen | Smart Trade",
  description: "Beveiligd acceptatieformulier voor het activeren van retourpinnen.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ReturnPinFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<{ token?: string; v?: string }>;
}) {
  const { formId } = await params;
  const query = await searchParams;

  return (
    <WorldlineReturnPinForm
      formId={formId}
      token={query.token ?? ""}
      tokenVersion={Number(query.v ?? 0)}
    />
  );
}
