import axios, { AxiosError } from "axios";

const API_URL =
    "https://cloudflare-worker.ranjitsuryawanshi952.workers.dev/api/getFlag";
const REQUEST_TIMEOUT = 5000; // milliseconds
const CACHE_TTL = 60000; // 1 minute Time-To-Live

// Interface representing the expected API response
interface FlagApiResponse {
    success: boolean;
    secureUrl: string;
}

// Cache entry interface
interface CacheEntry {
    html: string;
    timestamp: number;
}

// In-memory cache
const cache: Map<string, CacheEntry> = new Map();

/**
 * Escapes HTML special characters to prevent XSS.
 * @param unsafe - The unsafe string.
 * @returns The escaped string.
 */
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Checks whether a URL uses HTTPS.
 * @param url - The URL string.
 * @returns True if the URL uses the HTTPS protocol.
 */
function isSecureUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Retrieves and returns the HTML for a country's flag.
 * Implements caching, retries, and input validation for production-level robustness.
 *
 * @param country - The country name.
 * @returns A Promise that resolves to an HTML string containing the flag image.
 * @throws An error if the flag cannot be retrieved.
 */
export async function getFlagHtml(country: string): Promise<string> {
    const trimmedCountry = country?.trim();
    if (!trimmedCountry) {
        throw new Error("Invalid country parameter");
    }

    // Check the cache first (using lower case for case-insensitivity)
    const cacheKey = trimmedCountry.toLowerCase();
    const cachedEntry = cache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_TTL) {
        return cachedEntry.html;
    }

    // Retry logic: up to 3 attempts for a successful API call
    const maxAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await axios.get<FlagApiResponse>(
                `${API_URL}?country=${encodeURIComponent(trimmedCountry)}`,
                { timeout: REQUEST_TIMEOUT }
            );

            const data = response.data;
            if (data.success && data.secureUrl && isSecureUrl(data.secureUrl)) {
                const safeCountry = escapeHtml(trimmedCountry);
                const html = `<img src="${data.secureUrl}" alt="Flag of ${safeCountry}" loading="lazy">`;
                cache.set(cacheKey, { html, timestamp: Date.now() });
                return html;
            }

            throw new Error(`Invalid API response: ${JSON.stringify(data)}`);
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                lastError = new Error(
                    `Attempt ${attempt}: ${error.message} (status: ${error.response?.status || "unknown"
                    })`
                );
            } else {
                lastError = new Error(
                    `Attempt ${attempt}: ${error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            }
        }
    }

    throw lastError || new Error("Failed to fetch flag after multiple attempts.");
}

// Example usage:
// getFlagHtml("India")
//   .then(html => console.log(html))
//   .catch(err => console.error(err));
