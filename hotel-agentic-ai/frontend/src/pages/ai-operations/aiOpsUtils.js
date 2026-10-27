/**
 * Date, time, and text formatting helpers for AI Operations page
 */

/**
 * Format an ISO timestamp string to the browser's local time (e.g. 10:58)
 */
export function formatLocalTime(isoString, includeSeconds = false) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });
  } catch {
    return '—';
  }
}

/**
 * Format relative time (e.g. "8 sec ago", "2 min ago")
 */
export function formatTimeAgo(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return 'just now';

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      return `${Math.max(1, diffSec)} sec ago`;
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return `${diffMin} min ago`;
    }
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `${diffHours} hr ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return '—';
  }
}

/**
 * Clean detail text:
 * - Replace "Ai Agent" with "AI Agent"
 * - Avoid repeating the room number if already present in parent context
 * - Strip raw ISO timestamps and raw technical usernames
 */
export function cleanDetailText(text, roomNumber) {
  if (!text) return '';
  let cleaned = String(text);

  // Normalize "Ai Agent" to "AI Agent"
  cleaned = cleaned.replace(/\bAi Agent\b/g, 'AI Agent');

  // Remove any raw ISO timestamps (e.g. 2026-10-12T14:30:00.000Z or 2026-10-12 14:30:00)
  cleaned = cleaned.replace(/\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g, '');

  // Strip technical usernames/emails like admin@voyage.internal or user_123
  cleaned = cleaned.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '');
  cleaned = cleaned.replace(/\buser_[a-zA-Z0-9_]+\b/g, '');

  // If text has repeated room mentions (e.g. "Reported issue in Room 101 · Room 101")
  if (roomNumber) {
    // If it has duplicated Room mention like "Room 101 ... Room 101", collapse duplicate
    const doubleRoomPattern = new RegExp(`(Room\\s+${roomNumber}[^·•]*)[·•]\\s*Room\\s+${roomNumber}`, 'gi');
    cleaned = cleaned.replace(doubleRoomPattern, '$1').trim();

    // If text accidentally got cut down to "Reported issue in", restore the room
    if (/^Reported issue in$/i.test(cleaned.trim())) {
      cleaned = `Reported issue in Room ${roomNumber}`;
    }
  }

  // Clean up any trailing dangling "in" or bullets or empty separators
  cleaned = cleaned.replace(/\s+in$/i, roomNumber ? ` in Room ${roomNumber}` : '').trim();
  cleaned = cleaned.replace(/^[·•\s-]+|[·•\s-]+$/g, '').trim();
  cleaned = cleaned.replace(/[·•]\s*[·•]/g, '·').trim();

  return cleaned;
}

