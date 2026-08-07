import type { ImplementationDnsCheck } from "@/lib/implementation-dns";

export const IMPLEMENTATION_APPOINTMENT_TYPES = ["on_site", "remote"] as const;
export type ImplementationAppointmentType = typeof IMPLEMENTATION_APPOINTMENT_TYPES[number];

export const IMPLEMENTATION_APPOINTMENT_STATUSES = ["planned", "completed"] as const;
export type ImplementationAppointmentStatus = typeof IMPLEMENTATION_APPOINTMENT_STATUSES[number];

export type ImplementationAppointmentWorkItem = {
  key: string;
  group: string;
  label: string;
};

export type ImplementationAppointment = {
  id: string;
  implementationId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentType: ImplementationAppointmentType;
  title: string;
  customerNote: string;
  workItems: ImplementationAppointmentWorkItem[];
  status: ImplementationAppointmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ImplementationPortalAccess = {
  id: string;
  implementationId: string;
  publicUrl: string;
  active: boolean;
  expiresAt: string;
  revokedAt: string | null;
  lastViewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicImplementationItem = {
  key: string;
  label: string;
  description?: string;
  customerApprovedAt: string | null;
  workItems: Array<{
    key: string;
    label: string;
    completed: boolean;
    customerApprovedAt: string | null;
  }>;
  completed: boolean;
};

export type PublicImplementationPortal = {
  customerName: string;
  quoteTitle: string;
  packageName: string;
  statusLabel: string;
  consultantName: string;
  consultantEmail: string;
  implementationStartDate: string | null;
  plannedGoLiveDate: string | null;
  actualGoLiveDate: string | null;
  updatedAt: string;
  progressPercentage: number;
  dnsDomain: string;
  dnsCheck: ImplementationDnsCheck | null;
  dnsCheckMessage: string;
  baseItems: PublicImplementationItem[];
  items: PublicImplementationItem[];
  appointments: ImplementationAppointment[];
};

export function isImplementationAppointmentType(
  value: unknown,
): value is ImplementationAppointmentType {
  return IMPLEMENTATION_APPOINTMENT_TYPES.includes(value as ImplementationAppointmentType);
}

export function isImplementationAppointmentStatus(
  value: unknown,
): value is ImplementationAppointmentStatus {
  return IMPLEMENTATION_APPOINTMENT_STATUSES.includes(value as ImplementationAppointmentStatus);
}
