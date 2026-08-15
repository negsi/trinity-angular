/**
 * Utility functions for date formatting.
 */

/**
 * Formats a date into a localized date-time string.
 *
 * @param dateStr - The ISO date string.
 * @returns A localized date and time string.
 */
export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) {
    return '';
  }
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Formats a date object into a relative divider label ('TODAY', 'YESTERDAY', or full date).
 *
 * @param date - The Date instance to evaluate.
 * @returns A relative or localized date header label.
 */
export function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'TODAY';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'YESTERDAY';
  } else {
    return date.toLocaleDateString([], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}
