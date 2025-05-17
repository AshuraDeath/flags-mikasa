export interface Env {
    FLAG_CACHE: KVNamespace;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
}

// Updated to 24 hours (86400 seconds)
const TTL_SECONDS: number = 24 * 60 * 60;
const RATE_LIMIT_KEY_PREFIX: string = "rl_";
const RATE_LIMIT_MAX: number = 100;
const RATE_LIMIT_WINDOW_SEC: number = 900;

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        return handleRequest(req, env);
    }
};

async function handleRequest(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(),
        });
    }

    const url: URL = new URL(req.url);
    
    // Handle direct image serving (CDN-style path)
    if (url.pathname.startsWith("/flag/")) {
        return handleDirectImageProxy(req, env);
    }
    
    // Handle JSON API endpoint
    if (url.pathname === "/api/getFlag") {
        return handleGetFlag(req, env);
    }

    return createJsonResponse(
        { success: false, status: "Service unavailable", message: "Not Found" },
        404
    );
}

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function createJsonResponse(data: object, statusCode: number): Response {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
        },
    });
}

function getRateLimitKey(req: Request): string {
    const ip: string = req.headers.get("CF-Connecting-IP") || "unknown_ip";
    return `${RATE_LIMIT_KEY_PREFIX}${ip}`;
}

async function isRateLimited(req: Request, env: Env): Promise<boolean> {
    const key: string = getRateLimitKey(req);
    const requestCount: string | null = await env.FLAG_CACHE.get(key);
    const count: number = requestCount ? parseInt(requestCount) : 0;

    if (count >= RATE_LIMIT_MAX) {
        return true;
    }

    await env.FLAG_CACHE.put(key, (count + 1).toString(), {
        expirationTtl: RATE_LIMIT_WINDOW_SEC,
    });

    return false;
}

/**
 * Direct Image Proxy - CDN-style endpoint
 * Format: /flag/{countryCode}/[width]/[height]/[format]
 * Example: /flag/US/256/auto/svg
 */
async function handleDirectImageProxy(req: Request, env: Env): Promise<Response> {
    if (await isRateLimited(req, env)) {
        return new Response("Rate limit exceeded", { status: 429 });
    }

    const url: URL = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Check if we have enough path segments
    if (pathParts.length < 2) {
        return new Response("Invalid flag URL format", { status: 400 });
    }
    
    // Extract parameters from the URL path
    // /flag/{countryCode}/[width]/[height]/[format]
    const countryCode = pathParts[1]?.toUpperCase();
    const width = pathParts[2] || "auto";
    const height = pathParts[3] || "auto";
    const format = pathParts[4] || "svg";
    
    // Convert country name to code if needed
    const country = await atomMiddleware(countryCode);
    if (!country) {
        return new Response("Invalid country name or code", { status: 400 });
    }
    
    try {
        // Get Cloudinary URL
        const cacheKey = `flag_${country}_${width}_${height}_${format}_${Math.floor(Date.now() / 1000 / TTL_SECONDS)}`;
        const cachedUrl = await env.FLAG_CACHE.get(cacheKey);
        
        let imageUrl: string;
        if (cachedUrl) {
            imageUrl = cachedUrl;
        } else {
            imageUrl = await getCloudinaryUrl(country, env, width, height, format);
            if (!imageUrl) {
                return new Response("Failed to generate image URL", { status: 500 });
            }
            
            // Cache the URL
            await env.FLAG_CACHE.put(cacheKey, imageUrl, {
                expirationTtl: TTL_SECONDS,
            });
        }
        
        // Proxy the request to Cloudinary and return the image directly
        return await proxyImageRequest(imageUrl);
    } catch (error) {
        return new Response((error as Error).message, { status: 500 });
    }
}

/**
 * Proxy the request to the Cloudinary URL and return the image
 */
async function proxyImageRequest(imageUrl: string): Promise<Response> {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            return new Response("Failed to fetch image", { status: response.status });
        }
        
        // Create a new response with the image and proper headers
        const headers = new Headers();
        
        // Copy content-type header
        const contentType = response.headers.get("content-type");
        if (contentType) {
            headers.set("content-type", contentType);
        }
        
        // Set caching headers
        headers.set("cache-control", `public, max-age=${TTL_SECONDS}`);
        
        // Add CORS headers
        Object.entries(corsHeaders()).forEach(([key, value]) => {
            headers.set(key, value);
        });
        
        return new Response(response.body, {
            status: response.status,
            headers
        });
    } catch (error) {
        return new Response("Error proxying image", { status: 500 });
    }
}

async function atomMiddleware(countryParam: string): Promise<string | null> {
    const normalizedInput: string = countryParam.trim().toUpperCase();

    if (/^[A-Z]{2}$/.test(normalizedInput)) {
        return normalizedInput; // Already a valid country code
    }

    try {
        const response: Response = await fetch(
            `https://restcountries.com/v3.1/name/${encodeURIComponent(
                normalizedInput
            )}`
        );
        const data: any = await response.json();

        if (Array.isArray(data) && data.length > 0 && data[0].cca2) {
            return data[0].cca2.toUpperCase();
        }
    } catch (error) {
        console.error(
            `AtomMiddleware: Failed to convert country '${normalizedInput}' -`,
            error
        );
    }

    return null;
}

async function handleGetFlag(req: Request, env: Env): Promise<Response> {
    const url: URL = new URL(req.url);

    if (await isRateLimited(req, env)) {
        return createJsonResponse(
            {
                success: false,
                status: "Rate limited",
                message: "Rate limit exceeded.",
            },
            429
        );
    }

    const countryParam: string | null = url.searchParams.get("country");
    if (!countryParam) {
        return createJsonResponse(
            {
                success: false,
                status: "User error",
                message: "Country parameter is required.",
            },
            400
        );
    }

    // Get additional parameters (with defaults)
    const width = url.searchParams.get("width") || "auto";
    const height = url.searchParams.get("height") || "auto";
    const format = url.searchParams.get("format") || "svg";

    const country: string | null = await atomMiddleware(countryParam);
    if (!country) {
        return createJsonResponse(
            {
                success: false,
                status: "User error",
                message: "Invalid country name or code.",
            },
            400
        );
    }

    // Check if Cloudinary config exists before proceeding
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
        return createJsonResponse(
            {
                success: false,
                status: "Service error",
                message: "Missing Cloudinary configuration",
            },
            500
        );
    }

    try {
        // Generate and return CDN-style URLs rather than direct Cloudinary URLs
        const workerUrl = new URL(req.url);
        const baseUrl = `${workerUrl.protocol}//${workerUrl.host}`;
        
        // Create CDN-style URL
        const proxyUrl = `${baseUrl}/flag/${country}/${width}/${height}/${format}`;
        
        return createJsonResponse(
            { 
                success: true, 
                status: "Success", 
                secureUrl: proxyUrl,
                country: country
            },
            200
        );
    } catch (error) {
        return createJsonResponse(
            {
                success: false,
                status: "Service error",
                message: (error as Error).message,
            },
            500
        );
    }
}

/**
 * Get Cloudinary URL with transformation parameters
 */
async function getCloudinaryUrl(
    country: string,
    env: Env,
    width: string = "auto",
    height: string = "auto",
    format: string = "svg"
): Promise<string> {
    /* Store country code to public ID mappings */
    const countryToPublicId: Record<string, string> = {
        AC: "AC_vjuptx",
        AD: "AD_qkjqya",
        AE: "AE_mlv8dc",
        AF: "AF_z5o1u3",
        AG: "AG_q7k4pf",
        AI: "AI_c3r9wt",
        AL: "AL_g2p6vx",
        AM: "AM_t1o9bz",
        AO: "AO_m5k2dr",
        AQ: "AQ_j3b8lx",
        AR: "AR_p6v4gw",
        AS: "AS_t7m1cz",
        AT: "AT_b9k5lp",
        AU: "AU_f4h2xj",
        AW: "AW_s3t8vp",
        /* Add more country codes as needed */
    };

    // Direct lookup of the public ID for the given country code
    const publicId = countryToPublicId[country];
    if (!publicId) {
        console.error(`No public ID mapping found for country: ${country}`);
        return "";
    }
    
    try {
        // Build transformation string
        const transformations = [];
        
        // Add width and height transformations if not "auto"
        if (width !== "auto") {
            transformations.push(`w_${width}`);
        }
        if (height !== "auto") {
            transformations.push(`h_${height}`);
        }
        
        // Format transformation
        const targetFormat = format.toLowerCase();
        if (targetFormat !== "svg" && ["png", "jpg", "webp"].includes(targetFormat)) {
            transformations.push(`f_${targetFormat}`);
        }
        
        // Quality settings for raster formats
        if (targetFormat !== "svg") {
            transformations.push("q_auto"); // Automatic quality
        }
        
        // Build the transformation string
        const transformationString = transformations.length > 0 
            ? transformations.join(",") + "/"
            : "";
        
        // Build the base URL - using "upload" instead of "private"
        const cloudinaryUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${transformationString}${publicId}.${targetFormat === "svg" ? "svg" : targetFormat}`;
        
        return cloudinaryUrl;
    } catch (error) {
        console.error("Error generating Cloudinary URL:", error);
        return "";
    }
}