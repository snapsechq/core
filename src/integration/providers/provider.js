import { BaseProvider, capability } from "./base.provider.js";
import { ConfigResolver } from "../config-resolver.js";
import { GcpProvider } from "./gcp-provider/gcp.provider.js";
import { AwsProvider } from "./aws-provider/aws.provider.js";
import { AzureProvider } from "./azure-provider/azure.provider.js";
import { OracleProvider } from "./oracle-provider/oracle.provider.js";
import { GithubProvider, GithubParser } from "./github-provider/index.js";
import { GitlabProvider, GitlabParser } from "./gitlab-provider/index.js";

const ProviderRegistry = {
    "gcp": GcpProvider,
    "aws": AwsProvider,
    "azure": AzureProvider,
    "oracle": OracleProvider,
    "github": GithubProvider,
    "gitlab": GitlabProvider,
};

export class Provider {

    static isProviderAvailable(integrationId) {
        if (!integrationId || typeof integrationId !== "string") {
            return false;
        }

        const providers = Object.keys(ProviderRegistry);
        return providers.includes(integrationId.toLowerCase());
    }

    static getProvider(integrationId, options = {})  {
        const { integration } = options;
        if (!this.isProviderAvailable(integrationId)) {
            throw new Error(`${integrationId} is not supported.`);
        }

        const provider = ProviderRegistry[integrationId.toLowerCase()];

        if (integration)
            return ConfigResolver.create(provider, { integration }); // resolves the config from the provided instanceId if not, then passes through the config
        else
            return provider;
    }

    /**
     * Get list of capabilities supported by an integration.
     *
     * @param {string} integrationId
     * @returns {Array<{ slug: string, method: string, aliases: string[], description: string }>}
     */
    static getCapabilities(integrationId) {
        const provider = this.getProvider(integrationId);
        if (typeof provider.getCapabilities === "function") {
            return provider.getCapabilities();
        }
        return [];
    }

    /**
     * Check if a specific capability is supported by an integration.
     *
     * @param {string} integrationId
     * @param {string} methodSlug
     * @returns {boolean}
     */
    static hasCapability(integrationId, methodSlug) {
        const provider = this.getProvider(integrationId);
        if (typeof provider.hasCapability === "function") {
            return provider.hasCapability(methodSlug);
        }
        return false;
    }

    /**
     * Executes a capability on a supported provider.
     *
     * @param {string} integrationId - Integration identifier (e.g. "github", "gitlab")
     * @param {string} methodSlug - Capability method slug or alias (e.g. "repos", "prs", "branches")
     * @param {Object} config - Decrypted configuration credentials
     * @param {Object} [params={}] - Options and query/body parameters
     * @returns {Promise<any>}
     */
    static async executeCapability(integrationId, methodSlug, config, params = {}) {
        const provider = this.getProvider(integrationId);
        if (typeof provider.executeCapability !== "function") {
            throw new Error(`Provider for integration ${integrationId} does not support executing capabilities.`);
        }
        return await provider.executeCapability(methodSlug, config, params);
    }

}

export {
    BaseProvider,
    capability,
    ProviderRegistry,
    GcpProvider,
    AwsProvider,
    AzureProvider,
    OracleProvider,
    GithubProvider,
    GithubParser,
    GitlabProvider,
    GitlabParser,
};
