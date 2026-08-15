/**
 * Utility functions for user and agent avatars.
 */

/**
 * Extracts up to two initials from a name.
 *
 * @param name - The full name or title.
 * @returns An uppercase string of 1-2 characters.
 */
export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) {
    return 'AG';
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Generates a deterministic HSL background color based on the initials of a name.
 *
 * @param name - The name from which to derive the color.
 * @returns A CSS HSL color string.
 */
export function getAvatarColor(name?: string | null): string {
  const initials = getInitials(name);
  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 75%, 42%)`;
}
