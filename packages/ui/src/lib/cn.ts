import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Koşullu class birleştirme + Tailwind çakışma çözümü (shadcn deseni). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
