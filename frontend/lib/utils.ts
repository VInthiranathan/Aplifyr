import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLocation(addr: { municipality?: string | null; region?: string | null } | null | undefined) {
  if (!addr) return ''
  const m = addr.municipality ?? ''
  const r = addr.region ?? ''
  if (m && r) return `${m}, ${r}`
  if (m) return m
  if (r) return r
  return ''
}