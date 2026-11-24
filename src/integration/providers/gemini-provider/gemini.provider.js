import axios from "axios";
import { BaseProvider } from "../base.provider.js";

function extractConfig(params) {
    if (!params) return {};
    let target = params;
    const skipLiveCheck = params.skipLiveCheck ?? params.skipNetworkCheck;
    const timeout = params.timeout || 10000;

    if (target.adapterConfig) {
        target = target.adapterConfig?.config || target.adapterConfig;
    } else if (target.gemini) {
        target = { ...target.gemini };
    } else if (target.config) {
        target = target.config.gemini ? { ...target.config.gemini } : { ...target.config };
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

export class GeminiProvider extends BaseProvider {
    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const apiKey = config.apiKey || config.api_key || config.token;

        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
            throw new Error("API Key is required for Google Gemini Adapter");
        }

        if (config.skipLiveCheck) {
            return true;
        }

        try {
            await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`, {
                timeout: config.timeout || 10000
            });
            return true;
        } catch (error) {
            const reason = error?.response?.data?.error?.message || error.message;
            throw new Error(`Invalid Configuration: ${reason}`);
        }
    }
}
