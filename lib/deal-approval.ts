export type DealApprovalStatus = "open" | "accepted" | "revoked";

export type DealApprovalQuoteSnapshot = {
  customerName: string;
  quoteTitle: string;
  contactName: string;
  packageName: string;
  totalUsers: number;
  monthlyTotal: number;
  implementationTotal: number;
  salesName: string;
};

export type DealApprovalSummary = {
  id: string;
  dealId: string;
  status: DealApprovalStatus;
  recipientEmail: string;
  contactName: string;
  quote: DealApprovalQuoteSnapshot;
  publicUrl: string;
  expiresAt: string;
  draftedAt: string | null;
  acceptedAt: string | null;
  acceptedByName: string;
  acceptedByEmail: string;
};

export type PublicDealApproval = Omit<DealApprovalSummary, "dealId" | "publicUrl" | "draftedAt">;
