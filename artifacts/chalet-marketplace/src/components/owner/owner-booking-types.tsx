import { Clock, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import type { OwnerPropertyBooking } from "@workspace/api-client-react";


export const statusConfig = {
  pending:        { label: "قيد المراجعة",  icon: <Clock className="w-3.5 h-3.5" />,       className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved:       { label: "تمت الموافقة",  icon: <CheckCircle className="w-3.5 h-3.5" />,  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:       { label: "مرفوض",         icon: <XCircle className="w-3.5 h-3.5" />,      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  needs_revision: { label: "يتطلب تعديل",  icon: <RotateCcw className="w-3.5 h-3.5" />,    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

export interface OwnerBooking {
  checkoutAt: OwnerPropertyBooking["checkoutAt"];
  id: number;
  submissionId?: number | null;
  clientName: string;
  clientPhone?: string | null;
  bookingDate: string;
  durationDays: number;
  source: "platform" | "external";
  notes?: string | null;
  period?: string | null;
  revenueAmount?: string | null;
  totalPrice?: string | null;
  depositPaid?: string | null;
  insuranceFee?: string | null;
  insuranceReceived?: boolean | null;
  balanceCollected: boolean;
  insuranceRefunded: boolean;
  insuranceDeducted?: string | null;
  insuranceDeductReason?: string | null;
  insuranceProofImages?: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  cancelReasonCode?: string | null;
  cancelRefundAmount?: string | null;
  cancelIncome?: string | null;
  ratedAt?: string | null;
  paymentMethod?: "cash" | "transfer" | "pos" | null;
  cashDeposited?: boolean;
  insurancePaymentMethod?: "cash" | "transfer" | null;
  paymentReceiptUrl?: string | null;
  bookedAddons?: Array<{ id: number; name: string; price: string; unit: string }> | null;
  contractSigned?: boolean;
  contractSignerName?: string | null;
  contractSignerId?: string | null;
  contractSignatureDataUrl?: string | null;
  contractSignedAt?: string | null;
  isRescheduled?: boolean;
  originalDate?: string | null;
  rescheduleReason?: string | null;
}

export interface RescheduleLogItem {
  id: number;
  bookingId: number;
  submissionId?: number | null;
  clientName: string;
  clientPhone?: string | null;
  oldDate: string;
  newDate: string;
  oldDuration: number;
  newDuration: number;
  oldPeriod?: string | null;
  newPeriod?: string | null;
  reason: string;
  rescheduledAt: string;
}

export interface ChaletAvailability {
  id: number;
  chaletId: number;
  dateStr: string;
  periodMorning: boolean;
  periodEvening: boolean;
  periodFullDay: boolean;
  notes: string | null;
}

export interface DayPrice { morning?: number; evening?: number; fullDay?: number; }
export interface ChaletSeason {
  id: number;
  submissionId: number;
  nameAr: string;
  startDate: string;
  endDate: string;
  price: string;
  priceMorning: string | null;
  priceEvening: string | null;
  priceFullDay: string | null;
  dailyPrices: Record<string, DayPrice> | null;
  period: string | null;
  createdAt: string;
}

export interface GlobalSeason {
  id: number;
  nameAr: string;
  startDate: string;
  endDate: string;
  color: string;
  isActive: boolean;
  enabled: boolean;
  priceMorning: string | null;
  priceEvening: string | null;
  priceFullDay: string | null;
  dailyPrices: Record<string, DayPrice> | null;
}
