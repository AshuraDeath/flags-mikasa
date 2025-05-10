(function (global) {
    "use strict";

    /**
     * Configuration options for the flag service.
     */
    const config = {
        API_URL:
            "http://127.0.0.1:8787/getFlag",
        TIMEOUT: 5000, // Maximum fetch time in milliseconds.
        RETRY_COUNT: 3, // Number of retry attempts for failed requests.
        RETRY_DELAY: 500, // Initial delay (in ms) for retries; doubles on each attempt.
        CACHE_TTL: 3600000, // Cache Time-To-Live in milliseconds (e.g., 1 hour).
    };

    // In-memory cache: country -> { url: string, expiry: number }
    const cache = new Map();
    // Pending requests: country -> Promise resolving to the flag URL.
    const pendingRequests = new Map();

    /**
     * Fetch wrapper that enforces a timeout using AbortController.
     *
     * @param {string} url - The URL to fetch.
     * @param {object} options - Fetch options.
     * @param {number} timeout - Timeout in milliseconds.
     * @returns {Promise<Response>}
     */
    async function fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(id);
        }
    }

    /**
     * Attempts a fetch call with retry logic and exponential backoff.
     *
     * @param {string} url - The URL to fetch.
     * @param {object} options - Fetch options.
     * @param {number} retries - Number of retry attempts.
     * @param {number} retryDelay - Initial delay in milliseconds.
     * @returns {Promise<Response>}
     */
    async function retryableFetch(url, options, retries, retryDelay) {
        let attempt = 0;
        while (attempt <= retries) {
            try {
                return await fetchWithTimeout(url, options, config.TIMEOUT);
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }
                // Exponential backoff delay.
                await new Promise((resolve) =>
                    setTimeout(resolve, retryDelay * Math.pow(2, attempt))
                );
                attempt++;
            }
        }
    }

    /**
     * Fetches the secure flag URL for a given country code with caching and retry logic.
     *
     * @param {string} country - The ISO country code.
     * @returns {Promise<string|null>} - Resolves to the flag URL or null on failure.
     */
    async function fetchFlag(country) {
        if (!country) {
            console.error("Country code is required.");
            return null;
        }

        // Return cached URL if still valid.
        const cached = cache.get(country);
        if (cached && cached.expiry > Date.now()) {
            return cached.url;
        }

        // If a request is already in-flight for this country, return its promise.
        if (pendingRequests.has(country)) {
            return pendingRequests.get(country);
        }

        // Build URL using URLSearchParams for safe encoding.
        const url = new URL(config.API_URL);
        url.searchParams.append("country", country);

        // Wrap the fetch logic in a promise for pending request sharing.
        const fetchPromise = (async () => {
            try {
                const response = await retryableFetch(
                    url.toString(),
                    {
                        method: "GET",
                        headers: {
                            "Content-Type": "application/json",
                        },
                    },
                    config.RETRY_COUNT,
                    config.RETRY_DELAY
                );

                if (!response.ok) {
                    console.error(
                        `HTTP error: ${response.status} - ${response.statusText}`
                    );
                    return null;
                }

                const data = await response.json();

                if (data.success && data.secureUrl) {
                    // Cache the response with a TTL.
                    cache.set(country, {
                        url: data.secureUrl,
                        expiry: Date.now() + config.CACHE_TTL,
                    });
                    return data.secureUrl;
                } else {
                    console.error("API error:", data.message || "Unknown error");
                    return null;
                }
            } catch (error) {
                console.error("Error fetching flag:", error);
                return null;
            } finally {
                // Clean up the pending request.
                pendingRequests.delete(country);
            }
        })();

        pendingRequests.set(country, fetchPromise);
        return fetchPromise;
    }

    /**
     * Retrieves the flag for the specified country and assigns it to the given image element.
     *
     * @param {string} country - The ISO country code.
     * @param {string} imgElementId - The DOM ID of the image element.
     * @returns {Promise<void>}
     */
    async function getCountryFlag(country, imgElementId) {
        const flagUrl = await fetchFlag(country);
        if (flagUrl) {
            const imgElement = document.getElementById(imgElementId);
            if (imgElement) {
                imgElement.src = flagUrl;
            } else {
                console.error(`Image element with ID '${imgElementId}' not found.`);
            }
        }
    }

    // Expose only the necessary API to the global scope.
    global.getCountryFlag = getCountryFlag;
})(window);

//    <-- The above script is a self-contained module that fetches country flag URLs from a Cloudflare Worker API and assigns them to image elements on the page. It includes a cache to store flag URLs for a limited time, retry logic for failed requests, and a timeout mechanism to prevent hanging fetch calls.
//     The script is designed to be included in a client-side HTML page and exposes a single function  getCountryFlag(country, imgElementId)  that takes a country code and the ID of an image element to update. The function fetches the flag URL for the specified country and assigns it to the image element’s  src  attribute.
//     To use the script, include it in your HTML file and call  getCountryFlag(country, imgElementId)  with the desired country code and image element ID. For example:
//     <!-- clients/country-flag-html-cdn/index.html -->


/* Why Users Are Often Unsatisfied
Intermittent Downtime & Slow Responses

Users report the API being unavailable or extremely slow, causing dependent applications to error out 
GitHub

In integrations (e.g. Make.com), slow response times regularly cause scenarios to fail 
Make Community

Lack of Calling-Code Search

Many developers need to look up a country by its phone dialing code—but must download the full payload and filter client-side 
DevSecOps AI Platform

Incomplete Data Coverage

Some fields promised in earlier versions (postal-code formats, capital coordinates) are “hidden” or omitted in v3.1 
DevSecOps AI Platform

Inconsistent presence of certain fields across countries (e.g. missing coatOfArms for some nations).

No Embedded Pagination or Rate-Limit Headers

Large “/all” requests can become unwieldy—there’s no way to page through data or know when you’re being throttled 
DevSecOps AI Platform

No Official Support or SLA

As a free, donation-supported project, there’s no formal guarantee of uptime or performance.

With ~120 GB/day of bandwidth costs, service sustainability is a constant concern  */


/* https://res.cloudinary.com/your-cloud/image/fetch/w_64,h_36,f_auto,q_auto/https://flag-source/za.png
 */