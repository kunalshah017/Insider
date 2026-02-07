/**
 * Polymarket URL parsing utilities
 */

export interface ParsedPolymarketUrl {
  type: 'event' | 'market' | 'unknown';
  slug: string;
  fullUrl: string;
}

/**
 * Clean a slug by removing trailing ellipsis and other truncation artifacts
 * Twitter often truncates long URLs and adds "…" at the end
 */
function cleanSlug(slug: string): string {
  // Decode URI components first
  let cleaned = slug;
  try {
    cleaned = decodeURIComponent(slug);
  } catch {
    // If decoding fails, use as-is
  }

  // Remove trailing ellipsis (both Unicode and HTML entity forms)
  cleaned = cleaned.replace(/[…]+$/, '');
  cleaned = cleaned.replace(/\.{3,}$/, '');

  // Remove any trailing special characters
  cleaned = cleaned.replace(/[^\w-]+$/, '');

  return cleaned;
}

/**
 * Check if a URL is a Polymarket URL
 */
export function isPolymarketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'polymarket.com' || parsed.hostname === 'www.polymarket.com';
  } catch {
    // Check if it's a partial URL like "polymarket.com/event/..."
    return url.includes('polymarket.com');
  }
}

/**
 * Parse a Polymarket URL to extract the type and slug
 *
 * URL formats:
 * - Event: https://polymarket.com/event/{slug}
 * - Market: https://polymarket.com/market/{slug}
 */
export function parsePolymarketUrl(url: string): ParsedPolymarketUrl | null {
  if (!isPolymarketUrl(url)) {
    return null;
  }

  // Handle both full URLs and partial text
  let pathname: string;

  try {
    const parsed = new URL(url);
    pathname = parsed.pathname;
  } catch {
    // Try to extract pathname from partial URL
    const match = url.match(/polymarket\.com(\/[^\s?#]*)/);
    if (match) {
      pathname = match[1];
    } else {
      return null;
    }
  }

  // Parse event URLs: /event/{slug}
  const eventMatch = pathname.match(/^\/event\/([^/?#]+)/);
  if (eventMatch) {
    const slug = cleanSlug(eventMatch[1]);
    return {
      type: 'event',
      slug,
      fullUrl: `https://polymarket.com/event/${slug}`,
    };
  }

  // Parse market URLs: /market/{slug}
  const marketMatch = pathname.match(/^\/market\/([^/?#]+)/);
  if (marketMatch) {
    const slug = cleanSlug(marketMatch[1]);
    return {
      type: 'market',
      slug,
      fullUrl: `https://polymarket.com/market/${slug}`,
    };
  }

  return null;
}

/**
 * Extract Polymarket URLs from a text string
 */
export function extractPolymarketUrls(text: string): ParsedPolymarketUrl[] {
  const urlRegex = /(?:https?:\/\/)?(?:www\.)?polymarket\.com\/(?:event|market)\/[^\s?#]+/gi;
  const matches = text.match(urlRegex) || [];

  return matches.map(parsePolymarketUrl).filter((parsed): parsed is ParsedPolymarketUrl => parsed !== null);
}

/**
 * Format a price as a percentage (e.g., 0.65 -> "65%")
 */
export function formatPriceAsPercent(price: number): string {
  return `${Math.round(price * 100)}%`;
}

/**
 * Format a price in cents (e.g., 0.65 -> "65¢")
 */
export function formatPriceAsCents(price: number): string {
  return `${Math.round(price * 100)}¢`;
}

/**
 * Format a large number with suffixes (K, M, B)
 */
export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) {
    return `$${(volume / 1_000_000_000).toFixed(1)}B`;
  }
  if (volume >= 1_000_000) {
    return `$${(volume / 1_000_000).toFixed(1)}M`;
  }
  if (volume >= 1_000) {
    return `$${(volume / 1_000).toFixed(1)}K`;
  }
  return `$${volume.toFixed(0)}`;
}

/**
 * Format a date for display
 */
export function formatEndDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'Ended';
  }
  if (diffDays === 0) {
    return 'Ends today';
  }
  if (diffDays === 1) {
    return 'Ends tomorrow';
  }
  if (diffDays <= 7) {
    return `Ends in ${diffDays} days`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
