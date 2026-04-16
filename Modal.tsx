import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const CATEGORY_ICONS: Record<string, string> = {
  general: '📦',
  food: '🍽️',
  transport: '🚗',
  accommodation: '🏨',
  entertainment: '🎬',
  shopping: '🛍️',
  utilities: '💡',
  medical: '💊',
  travel: '✈️',
  rent: '🏠',
  groceries: '🛒',
  sports: '⚽',
};

export const GROUP_ICONS = ['🏠', '✈️', '👥', '🎉', '💼', '🍕', '🎮', '🏋️', '🚗', '🌴'];
