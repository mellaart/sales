import type { Metadata } from "next";
import CustomerIntakeForm from "@/components/customer-intake-form";

export const metadata: Metadata = {
  title: "Gegevens nieuwe klanten | Smart Trade",
  description: "Vul de klantgegevens voor de inrichting van Smart Trade in.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CustomerIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ intakeId: string }>;
  searchParams: Promise<{ token?: string; v?: string }>;
}) {
  const { intakeId } = await params;
  const query = await searchParams;

  return (
    <CustomerIntakeForm
      intakeId={intakeId}
      token={query.token ?? ""}
      tokenVersion={Number(query.v ?? 0)}
    />
  );
}
