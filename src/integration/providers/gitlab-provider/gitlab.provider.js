import axios from "axios";
import { BaseProvider } from "../base.provider.js";
import { GitlabParser } from "./parser.js";

function extractConfig(params) {
    if (!params) return {};
    let target = params;
    const skipLiveCheck = params.skipLiveCheck ?? params.skipNetworkCheck;
    const timeout = params.timeout;

    if (target.gitlab) {
        target = { ...target.gitlab };
    } else if (target.config) {
        target = target.config.gitlab ? { ...target.config.gitlab } : { ...target.config };
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
    return target.base_url || target.baseUrl || target.gitlabUrl || "https://gitlab.com";
}

export class GitlabProvider extends BaseProvider {
    static providerName = "GitLab";

    static {
        this.registerCapability("repos", "getProjects", {
            aliases: ["projects", "repositories"],
            description: "List projects accessible to the authenticated user or group",
        });
        this.registerCapability("prs", "getMergeRequests", {
            aliases: ["mrs", "merge-requests", "merge_requests"],
            description: "List merge requests for a project or across accessible projects",
        });
        this.registerCapability("branches", "getBranches", {
            aliases: ["branch-list"],
            description: "List branches for a project",
        });
        this.registerCapability("commits", "getCommits", {
            aliases: ["commit-history"],
            description: "List commits for a project",
        });
    }

    static _getAuthHeaders(token) {
        return {
            "PRIVATE-TOKEN": (token || "").trim(),
            "Accept": "application/json",
            "User-Agent": "SnapSec-Integration",
        };
    }

    static _getApiUrl(baseUrl, endpoint) {
        let root = (baseUrl || "https://gitlab.com").trim().replace(/\/+$/, "");
        if (root.endsWith("/api/v4")) {
            root = root.slice(0, -"/api/v4".length);
        }
        const cleanedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        return `${root}/api/v4${cleanedEndpoint}`;
    }

    /**
     * Verifies the GitLab integration configuration.
     */
    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);

        const token = config.pat || config.accessToken || config.access_token || config.token;
        const rawBaseUrl = config.base_url || config.baseUrl || config.gitlabUrl;

        if (!token || typeof token !== "string" || !token.trim()) {
            throw new Error("Personal Access Token (PAT) is required for GitLab Adapter");
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
            const reason = error.response?.data?.message || error.response?.data?.error || error.message;
            throw new Error(`Invalid GitLab Configuration: ${reason}`);
        }
    }

    /**
     * Capability: Fetch projects/repositories and return normalized schema
     */
    static async getProjects(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        const endpoint = (params.group_id || params.group)
            ? `/groups/${encodeURIComponent(params.group_id || params.group)}/projects`
            : "/projects";

        const apiUrl = this._getApiUrl(baseUrl, endpoint);

        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 20,
        };
        if (params.membership !== undefined) query.membership = params.membership;
        else if (!params.group_id && !params.group) query.membership = true;
        if (params.search) query.search = params.search;
        if (params.order_by) query.order_by = params.order_by;
        if (params.sort) query.sort = params.sort;
        if (params.visibility) query.visibility = params.visibility;
        if (params.archived !== undefined) query.archived = params.archived;
        if (params.owned !== undefined) query.owned = params.owned;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GitlabParser.parseRepositories(response.data);
    }

    /**
     * Capability: Fetch merge requests and return normalized schema
     */
    static async getMergeRequests(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        const projectId = params.projectId || params.project || params.repo || params.repository;
        const endpoint = projectId
            ? `/projects/${encodeURIComponent(projectId)}/merge_requests`
            : "/merge_requests";

        const apiUrl = this._getApiUrl(baseUrl, endpoint);

        const query = {
            state: params.state || "opened",
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 20,
        };
        if (params.scope) query.scope = params.scope;
        if (params.order_by) query.order_by = params.order_by;
        if (params.sort) query.sort = params.sort;
        if (params.author_id) query.author_id = params.author_id;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GitlabParser.parsePullRequests(response.data, { repository: projectId });
    }

    /**
     * Capability: Fetch project branches and return normalized schema
     */
    static async getBranches(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        const projectId = params.projectId || params.project || params.repo || params.repository;
        if (!projectId) {
            throw new Error("Project ID or path is required to fetch branches (e.g. ?projectId=123 or ?repo=group/project)");
        }

        const apiUrl = this._getApiUrl(baseUrl, `/projects/${encodeURIComponent(projectId)}/repository/branches`);
        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 20,
        };
        if (params.search) query.search = params.search;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GitlabParser.parseBranches(response.data, { repository: projectId });
    }

    /**
     * Capability: Fetch project commits and return normalized schema
     */
    static async getCommits(config, params = {}) {
        const token = extractToken(config);
        if (!token) throw new Error("Personal Access Token (PAT) is required");
        const baseUrl = extractBaseUrl(config);

        const projectId = params.projectId || params.project || params.repo || params.repository;
        if (!projectId) {
            throw new Error("Project ID or path is required to fetch commits (e.g. ?projectId=123 or ?repo=group/project)");
        }

        const apiUrl = this._getApiUrl(baseUrl, `/projects/${encodeURIComponent(projectId)}/repository/commits`);
        const query = {
            page: parseInt(params.page) || 1,
            per_page: parseInt(params.per_page || params.limit) || 20,
        };
        if (params.ref_name) query.ref_name = params.ref_name;
        if (params.since) query.since = params.since;
        if (params.until) query.until = params.until;
        if (params.path) query.path = params.path;
        if (params.all !== undefined) query.all = params.all;

        const response = await axios.get(apiUrl, {
            headers: this._getAuthHeaders(token),
            params: query,
            timeout: params.timeout || 15000,
        });

        return GitlabParser.parseCommits(response.data, { repository: projectId });
    }
}

export { GitlabParser };
export default GitlabProvider;
