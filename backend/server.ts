import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cloudinary from "cloudinary";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import { LRUCache } from "lru-cache";
import axios from "axios";
import axiosRetry from "axios-retry";
import asyncHandler from "express-async-handler";
import Joi from "joi";
import winston from "winston"; // Improved Logging

// Load environment variables
dotenv.config();

// Ensure required environment variables are set
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME!;
const API_KEY = process.env.CLOUDINARY_API_KEY!;
const API_SECRET = process.env.CLOUDINARY_API_SECRET!;
const PORT = parseInt(process.env.PORT || "3000", 10);
const MAX_CACHED_ITEMS = Number(process.env.MAX_CACHED_ITEMS) || 500;
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error("Missing required Cloudinary environment variables.");
}

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
});

// Setup Logging (Production-grade logs)
const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [new winston.transports.Console()],
});

// Express App Setup
const app: Application = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan("combined")); // Logging requests

// LRU Cache Configuration (Efficient caching)
const CACHE_TTL = 12 * 60 * 60 * 1000 - 5 * 60 * 1000; // 12 hours minus 5 min buffer
const cache = new LRUCache<string, { url: string; expiresAt: number }>({
    max: MAX_CACHED_ITEMS,
    ttl: CACHE_TTL,
    allowStale: false, // Do not serve expired items
});

// Rate Limiting
const limiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please try again later.",
    },
});
app.use("/api/getFlag", limiter);

// Axios Retry for Cloudinary Requests
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

/**
 * Utility function to send a success response
 */
const successResponse = (
    res: Response,
    data: object,
    message = "Success",
    statusCode = 200
) => res.status(statusCode).json({ success: true, message, ...data });

/**
 * Utility function to handle errors consistently
 */
const catchErrorResponse = (
    res: Response,
    error: unknown,
    message = "Something went wrong",
    statusCode = 500
) => {
    logger.error(`Error: ${message}`, { error });
    res.status(statusCode).json({ success: false, message });
};

/**
 * Joi schema for validating query parameters
 */
const flagQueryValidationSchema = Joi.object({
    country: Joi.string()
        .strict()
        .trim()
        .uppercase()
        .length(2)
        .required()
        .messages({
            "string.base": `"country" must be text`,
            "string.empty": `"country" cannot be empty`,
            "string.length": `"country" must be exactly {#limit} characters long`,
            "any.required": `"country" is required`,
        }),
});

/**
 * Middleware to validate query parameters using Joi
 */
const validateQueryParams = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { error } = flagQueryValidationSchema.validate(req.query);
    if (error) {
        return catchErrorResponse(res, error, error.details[0].message, 400);
    }
    next();
};

/**
 * Get a signed URL for a country flag image
 */
const getFlagHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const country = req.query.country as string;
        const cacheKey = `flag_${country}`;

        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            successResponse(res, { secureUrl: cachedData.url });
            if (Date.now() >= cachedData.expiresAt) {
                fetchAndCacheFlag(country, cacheKey);
            }
            return;
        }

        await fetchAndCacheFlag(country, cacheKey, res);
    } catch (error) {
        next(error);
    }
};

// Track ongoing fetch requests to prevent duplicate requests
const ongoingFetches = new Map<string, Promise<string>>();

const fetchAndCacheFlag = async (
    country: string,
    cacheKey: string,
    res?: Response
) => {
    if (ongoingFetches.has(cacheKey)) {
        const existingFetch = await ongoingFetches.get(cacheKey);
        if (res) successResponse(res, { secureUrl: existingFetch });
        return;
    }

    const fetchPromise = (async () => {
        try {
            const filePath = `flags/${country}.svg`;
            const expiresInSeconds = 12 * 60 * 60;
            const signedUrl = cloudinary.v2.url(filePath, {
                sign_url: true,
                expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
                format: "webp",
            });

            cache.set(cacheKey, {
                url: signedUrl,
                expiresAt: Date.now() + expiresInSeconds * 1000,
            });

            return signedUrl;
        } catch (error) {
            logger.error(`Failed to fetch flag for ${country}`, { error });
            throw new Error("Failed to generate flag URL");
        } finally {
            ongoingFetches.delete(cacheKey);
        }
    })();

    ongoingFetches.set(cacheKey, fetchPromise);

    try {
        const signedUrl = await fetchPromise;
        if (res) successResponse(res, { secureUrl: signedUrl });
    } catch (error) {
        if (res) catchErrorResponse(res, error, "Failed to generate flag URL", 500);
    }
};

// Graceful Shutdown
process.on("SIGINT", () => {
    logger.info("🚀 Server shutting down...");
    process.exit(0);
});

process.on("SIGTERM", () => {
    logger.info("⚡️ Cleaning up resources...");
    process.exit(0);
});

// Define the route with validation middleware first
app.get("/api/getFlag", validateQueryParams, asyncHandler(getFlagHandler));

// Global error handler (catches unhandled errors)
app.use(((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    catchErrorResponse(res, err, err.message || "Unhandled error", 500);
}) as express.ErrorRequestHandler);

// Start the server
app.listen(PORT, () => logger.info(`✅ Server running on port ${PORT}`));

/* npx nodemon server.ts */