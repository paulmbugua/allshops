export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface Staff {
  id: string;
  displayName: string;
  phone?: string | null;
  email?: string | null;
  employeeNumber?: string | null;
  jobTitle?: string | null;
  isBookable: boolean;
  isActive: boolean;
  user?: { id: string; name: string; email: string } | null;
  services?: StaffService[];
  branches?: StaffBranch[];
  availability?: Availability[];
}
export interface StaffService {
  id: string;
  serviceProductId: string;
  customDurationMinutes?: number | null;
  customPriceMinor?: number | null;
  isActive: boolean;
  serviceProduct?: {
    id: string;
    name: string;
    priceMinor: number;
    serviceProfile?: { durationMinutes: number } | null;
  };
}
export interface StaffBranch {
  id: string;
  branchId: string;
  isPrimary: boolean;
  isActive: boolean;
  branch?: { id: string; name: string; code: string };
}
export interface Availability {
  id: string;
  branchId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
export interface AppointmentService {
  id: string;
  serviceProductId: string;
  staffProfileId: string;
  serviceNameSnapshot: string;
  priceMinorSnapshot: number;
  durationMinutesSnapshot: number;
  startAt: string;
  endAt: string;
  staffProfile: { id: string; displayName: string };
}
export interface Appointment {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  customerNameSnapshot?: string | null;
  customerPhoneSnapshot?: string | null;
  notes?: string | null;
  branch: { id: string; name: string; code: string };
  customer?: { id: string; name: string; phone?: string | null } | null;
  primaryStaff: { id: string; displayName: string };
  services: AppointmentService[];
  sale?: {
    id: string;
    invoiceNumber: string;
    totalMinor: number;
    paymentStatus: string;
  } | null;
}
export interface CommissionRule {
  id: string;
  staffProfileId: string;
  serviceProductId?: string | null;
  type: "PERCENTAGE" | "FIXED";
  basisPoints?: number | null;
  valueMinor?: number | null;
  priority: number;
  isActive: boolean;
  staffProfile: { id: string; displayName: string };
  serviceProduct?: { id: string; name: string } | null;
}
export interface Commission {
  id: string;
  baseAmountMinor: number;
  commissionAmountMinor: number;
  status: string;
  earnedAt: string;
  staffProfile: { id: string; displayName: string };
  sale: { id: string; invoiceNumber: string };
  saleItem: { productNameSnapshot: string };
}
