import axios from "axios";
import { BaseProvider } from "../base.provider.js";
import { GithubParser } from "./parser.js";

function extractConfig(params) {
    if (!params) return {};
    let target = params;
    const skipLiveCheck = params.skipLiveCheck ?? params.skipNetworkCheck;
    const timeout = params.timeout;

    if (target.github) {
        target = { ...target.github };
    } else if (target.config) {
        target = target.config.github ? { ...target.config.github } : { ...target.config };
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

function extractToken(config) {
    const target = extractConfig(config);
    const token = target.pat || target.accessToken || target.access_token || target.token;
    return token && typeof token === "string" ? token.trim() : null;
}

function extractBaseUrl(config) {
    const target = extractConfig(config);
    return target.base_url || target.baseUrl || target.githubUrl || "https://api.github.com";
}

export class GithubProvider extends BaseProvider {
    static providerName = "GitHub";

    static {
        this.registerCapability("repos", "getRepositories", {
            aliases: ["repositories", "projects"],
            description: "List repositories accessible to the authenticated user or organization",
        });
        this.registerCapability("prs", "getPullRequests", {
            aliases: ["pull-requests", "pull_requests", "pulls"],
            description: "List pull requests for a repository or user",
        });
        this.registerCapability("branches", "getBranches", {
            aliases: ["branch-list"],
            description: "List branches for a repository",
        });
        this.registerCapability("commits", "getCommits", {
            aliases: ["commit-history"],
            description: "List commits for a repository",
        });
    }

    static _getAuthHeaders(token) {
        return {
            "Authorization": `token ${(token || "").trim()}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "SnapSec-Integration",
        };
    }

    static _getApiUrl(baseUrl, endpoint) {
        let root = (baseUrl || "https://api.github.com").trim().replace(/\/+$/, "");
        if (root.endsWith("/api/v3")) {
            root = root.slice(0, -"/api/v3".length);
        }
        if (root !== "https://api.github.com" && !root.includes("api.github.com")) {
            root = `${root}/api/v3`;
        }
        const cleanedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        return `${root}${cleanedEndpoint}`;
    }

    /**
     * Verifies the GitHub integration configuration.
     * Checks token presence, URL format, and performs a live check against /user.
     */
    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);

        const token = config.pat || config.accessToken || config.access_token || config.token;
        const rawBaseUrl = config.base_url || config.baseUrl || config.githubUrl;

        if (!token || typeof token !== "string" || !token.trim()) {
            throw new Error("Personal Access Token (PAT) is required for GitHub Adapter");
        }

        if (rawBaseUrl && typeof rawBaseUrl === "string" && rawBaseUrl.trim()) {
            const trimmed = rawBaseUrl.trim();
            if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
                throw new Error("Base URL must be a valid HTTP or HTTPS URL");
            }
        }

        if (config.skipLiveCheck) {
            return true;
        }

        try {
            const apiUrl = this._getApiUrl(rawBaseUrl, "/user");
            await axios.get(apiUrl, {
                headers: this._getAuthHeaders(token),
                timeout: config.timeout || 10000,
            });

            return true;
        } catch (error) {
            const reason = error.response?.data?.message || error.message;
            throw new Error(`Invalid GitHub Configuration: ${reason}`);
        }
    }

    /**
     * Capability: Fetch repositories and return normalized schema
     *
     * @param {Object} config - Integration config
     * @param {Object} [params={}] - Options (org, page, per_page, sort, direction, type)
     * @returns {Promise<Array>}
     */
    static async getRepositories(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        const endpoint = params.org
            ? `/orgs/${encodeURIComponent(params.org)}/repos`
            : "/user/repos";

        const apiUrl = this._getApiUrl(baseUrl, endpoint);

        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 30,
            sort: params.sort || "updated",
            direction: params.direction || "desc",
        };
        if (params.type) query.type = params.type;
        if (params.visibility) query.visibility = params.visibility;
        if (params.affiliation) query.affiliation = params.affiliation;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GithubParser.parseRepositories(response.data);
    }

    /**
     * Capability: Fetch pull requests and return normalized schema
     *
     * @param {Object} config - Integration config
     * @param {Object} [params={}] - Options (repo or owner+repo, state, sort, direction, page, per_page)
     * @returns {Promise<Array>}
     */
    static async getPullRequests(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        let owner = params.owner;
        let repo = params.repo || params.repository;
        if (repo && repo.includes("/") && !owner) {
            [owner, repo] = repo.split("/");
        }

        if (owner && repo) {
            const apiUrl = this._getApiUrl(baseUrl, `/repos/${owner}/${repo}/pulls`);
            const query = {
                state: params.state || "open",
                page: parseInt(params.page) || 1,
                per_page: parseInt(params.per_page || params.limit) || 30,
                sort: params.sort || "created",
                direction: params.direction || "desc",
            };
            if (params.head) query.head = params.head;
            if (params.base) query.base = params.base;

            const response = await axios.get(apiUrl, {
                headers: this._getAuthHeaders(token),
                params: query,
                timeout: params.timeout || 15000,
            });

            return GithubParser.parsePullRequests(response.data, { repository: `${owner}/${repo}` });
        }

        // Global PRs for user if no specific repository provided
        const apiUrl = this._getApiUrl(baseUrl, "/search/issues");
        const stateQuery = params.state ? ` state:${params.state}` : "";
        const q = params.query || `is:pr author:@me${stateQuery}`;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: {
                q,
                page: parseInt(params.page) || 1,
                per_page: parseInt(params.per_page || params.limit) || 30,
                sort: params.sort || "updated",
                order: params.direction || "desc",
            },
            timeout: params.timeout || 15000,
        });

        const items = response.data?.items || response.data;
        return GithubParser.parsePullRequests(items);
    }

    /**
     * Capability: Fetch repository branches and return normalized schema
     *
     * @param {Object} config - Integration config
     * @param {Object} params - Options (repo or owner+repo, protected, page, per_page)
     * @returns {Promise<Array>}
     */
    static async getBranches(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        let owner = params.owner;
        let repo = params.repo || params.repository;
        if (repo && repo.includes("/") && !owner) {
            [owner, repo] = repo.split("/");
        }

        if (!owner || !repo) {
            throw new Error("Repository is required to fetch branches (e.g. ?repo=owner/name or ?owner=owner&repo=name)");
        }

        const apiUrl = this._getApiUrl(baseUrl, `/repos/${owner}/${repo}/branches`);
        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 30,
        };
        if (params.protected !== undefined) {
            query.protected = params.protected === "true" || params.protected === true;
        }

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GithubParser.parseBranches(response.data, { repository: `${owner}/${repo}` });
    }

    /**
     * Capability: Fetch repository commits and return normalized schema
     *
     * @param {Object} config - Integration config
     * @param {Object} params - Options (repo or owner+repo, sha, path, author, since, until, page, per_page)
     * @returns {Promise<Array>}
     */
    static async getCommits(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        let owner = params.owner;
        let repo = params.repo || params.repository;
        if (repo && repo.includes("/") && !owner) {
            [owner, repo] = repo.split("/");
        }

        if (!owner || !repo) {
            throw new Error("Repository is required to fetch commits (e.g. ?repo=owner/name or ?owner=owner&repo=name)");
        }

        const apiUrl = this._getApiUrl(baseUrl, `/repos/${owner}/${repo}/commits`);
        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 30,
        };
        if (params.sha || params.branch) query.sha = params.sha || params.branch;
        if (params.path) query.path = params.path;
        if (params.author) query.author = params.author;
        if (params.since) query.since = params.since;
        if (params.until) query.until = params.until;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GithubParser.parseCommits(response.data, { repository: `${owner}/${repo}` });
    }
}

export { GithubParser };
export default GithubProvider;
