"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFlagHtml = getFlagHtml;
const axios_1 = require("axios");
const API_URL = "https://cloudflare-worker.ranjitsuryawanshi952.workers.dev/api/getFlag";
function getFlagHtml(country) {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(`${API_URL}?country=${encodeURIComponent(country)}`);
            if (response.data.success && response.data.secureUrl) {
                resolve(`<img src="${response.data.secureUrl}" alt="Flag of ${country}" loading="lazy">`);
            }
            else {
                reject("Failed to fetch flag.");
            }
        }
        catch (error) {
            reject("Error fetching flag.");
        }
    }));
}
// Example Usage:
// getFlagHtml("India").then(console.log).catch(console.error);
