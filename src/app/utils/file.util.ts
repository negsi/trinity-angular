import { DatasourceType } from '../models/datasource.model';

/**
 * Utility functions for file handling and formatting.
 */

/**
 * Formats a byte size number into a human-readable string.
 *
 * @param bytes - Size in bytes.
 * @returns Formatted size string (e.g., '512 KB', '2 MB').
 */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) {
    return '0 KB';
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Determines the category identifier of a file based on its file extension.
 *
 * @param filename - The filename with extension.
 * @returns A categorized file type descriptor ('pdf', 'xls', 'doc').
 */
export function determineFileType(filename?: string | null): DatasourceType {
  if (!filename) {
    return 'doc';
  }
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'xls':
    case 'xlsx':
    case 'csv':
      return 'xls';
    default:
      return 'doc';
  }
}
