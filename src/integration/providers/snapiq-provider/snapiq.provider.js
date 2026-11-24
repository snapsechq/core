import axios from "axios";
import { BaseProvider } from "../base.provider.js";

function extractConfig(params) {
    if (!params) return {};
    let target = params;
    const skipLiveCheck = params.skipLiveCheck ?? params.skipNetworkCheck;
    const timeout = params.timeout || 10000;

    if (target.adapterConfig) {
        target = target.adapterConfig?.config || target.adapterConfig;
    } else if (target.snapiq) {
        target = { ...target.snapiq };
    } else if (target.config) {
        target = target.config.snapiq ? { ...target.config.snapiq } : { ...target.config };
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

export class SnapiqProvider extends BaseProvider {
    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const endpoint = (config.endpoint || config.baseUrl || config.url || "").trim();
        const masterKey = (config.masterKey || config.apiKey || config.token || "").trim();

        if (!endpoint) {
            throw new Error("Endpoint URL is required for SnapIQ adapter");
        }

        if (!masterKey) {
            throw new Error("Master Key is required for SnapIQ adapter");
        }

        let normalizedEndpoint = endpoint.replace(/\/+$/, "");
        if (!/^https?:\/\//i.test(normalizedEndpoint)) {
            normalizedEndpoint = `http://${normalizedEndpoint}`;
        }

        if (config.skipLiveCheck) {
            return {
                valid: true,
                endpoint: normalizedEndpoint,
                models: Array.isArray(config.models) ? config.models : []
            };
        }

        const testUrls = normalizedEndpoint.endsWith("/v1")
            ? [`${normalizedEndpoint}/models`, `${normalizedEndpoint.replace(/\/v1$/, "")}/models`]
            : [`${normalizedEndpoint}/v1/models`, `${normalizedEndpoint}/models`];

        let lastError = null;
        let successfulResponse = null;

        for (const url of testUrls) {
            try {
                const response = await axios.get(url, {
                    headers: {
                        Authorization: `Bearer ${masterKey}`,
                        "x-api-key": masterKey
                    },
                    timeout: config.timeout || 10000
                });

                if (response.status >= 200 && response.status < 300) {
                    successfulResponse = response;
                    break;
                }
            } catch (error) {
                lastError = error;
                if (error?.response?.status === 401 || error?.response?.status === 403) {
                    break;
                }
            }
        }

        if (!successfulResponse) {
            const reason = lastError?.response?.data?.error?.message ||
                           lastError?.response?.data?.message ||
                           lastError?.message ||
                           "Unable to reach LiteLLM inference gateway";
            throw new Error(`Invalid Configuration: ${reason}`);
        }

        let discoveredModels = [];
        if (Array.isArray(successfulResponse.data?.data)) {
            discoveredModels = successfulResponse.data.data
                .map((m) => (typeof m === "string" ? m : m.id))
                .filter(Boolean)
                .map((id) => ({ label: id, value: id }));
        }

        return {
            valid: true,
            endpoint: normalizedEndpoint,
            models: discoveredModels
        };
    }
}
