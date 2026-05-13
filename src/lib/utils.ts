import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(date: Date | string | null | undefined, fallback = "—") {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return fallback;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatMonthDay(date: Date | string | null | undefined, fallback = "—") {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return fallback;
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
}

export function getInitials(name: string) {
  return name.slice(0, 1);
}
