import axios from "axios";
import { BaseProvider } from "../base.provider.js";

function extractConfig(params) {
    if (!params) return {};
    let target = params;
    const skipLiveCheck = params.skipLiveCheck ?? params.skipNetworkCheck;
    const timeout = params.timeout || 10000;

    if (target.adapterConfig) {
        target = target.adapterConfig?.config || target.adapterConfig;
    } else if (target.openrouter) {
        target = { ...target.openrouter };
    } else if (target.config) {
        target = target.config.openrouter ? { ...target.config.openrouter } : { ...target.config };
    } else {
        target = { ...target };
    }

    if (skipLiveCheck !== undefined && target.skipLiveCheck === undefined) {
        target.skipLiveCheck = skipLiveCheck;
    }
    if (timeout !== undefined && target.timeout === undefined) {
        target.timeout = timeout;
    }
    return target;
}

export class OpenrouterProvider extends BaseProvider {
    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const apiKey = config.apiKey || config.api_key || config.token;

        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
            throw new Error("API Key is required for OpenRouter Adapter");
        }

        if (config.skipLiveCheck) {
            return true;
        }

        try {
            await axios.get("https://openrouter.ai/api/v1/auth/key", {
                headers: {
                    Authorization: `Bearer ${apiKey.trim()}`,
                    "HTTP-Referer": "https://snapsec.co",
                    "X-Title": "SnapSec"
                },
                timeout: config.timeout || 10000
            });
            return true;
        } catch (error) {
            try {
                await axios.get("https://openrouter.ai/api/v1/models", {
                    headers: {
                        Authorization: `Bearer ${apiKey.trim()}`,
                        "HTTP-Referer": "https://snapsec.co",
                        "X-Title": "SnapSec"
                    },
                    timeout: config.timeout || 10000
                });
                return true;
            } catch (fallbackError) {
                const reason = error?.response?.data?.error?.message ||
                               fallbackError?.response?.data?.error?.message ||
                               error.message;
                throw new Error(`Invalid Configuration: ${reason}`);
            }
        }
    }
}
