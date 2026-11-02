/**
 * Normalized Parser for GitHub Adapter Data.
 * Formats repositories, pull requests, branches, and commits into a standard schema:
 * { type: string, value: string, properties: Object }
 */

export class GithubParser {
    /**
     * Parse a single GitHub repository into normalized schema.
     *
     * @param {Object} raw - Raw GitHub repository object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parseRepository(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const fullName = raw.full_name ||
            (raw.owner?.login && raw.name ? `${raw.owner.login}/${raw.name}` : raw.name) ||
            context.repository ||
            "";

        return {
            type: "respository",
            value: fullName,
            properties: {
                id: raw.id ?? null,
                name: raw.name ?? null,
                fullName: fullName,
                description: raw.description ?? null,
                owner: raw.owner ? {
                    id: raw.owner.id ?? null,
                    login: raw.owner.login ?? null,
                    type: raw.owner.type ?? null,
                    avatarUrl: raw.owner.avatar_url ?? null,
                    htmlUrl: raw.owner.html_url ?? null
                } : null,
                htmlUrl: raw.html_url ?? null,
                cloneUrl: raw.clone_url ?? null,
                sshUrl: raw.ssh_url ?? null,
                defaultBranch: raw.default_branch || "main",
                visibility: raw.visibility || (raw.private ? "private" : "public"),
                isPrivate: Boolean(raw.private),
                isFork: Boolean(raw.fork),
                isArchived: Boolean(raw.archived),
                isDisabled: Boolean(raw.disabled),
                primaryLanguage: raw.language ?? null,
                languages: Array.isArray(raw.languages)
                    ? raw.languages
                    : (raw.language ? [raw.language] : []),
                topics: Array.isArray(raw.topics) ? raw.topics : [],
                size: typeof raw.size === "number" ? raw.size : 0,
                starsCount: raw.stargazers_count ?? raw.starsCount ?? 0,
                forksCount: raw.forks_count ?? raw.forksCount ?? 0,
                openIssuesCount: raw.open_issues_count ?? raw.openIssuesCount ?? 0,
                watchersCount: raw.watchers_count ?? raw.watchersCount ?? 0,
                license: raw.license ? {
                    key: raw.license.key ?? null,
                    name: raw.license.name ?? null,
                    spdxId: raw.license.spdx_id ?? null,
                    url: raw.license.url ?? null
                } : null,
                createdAt: raw.created_at ?? null,
                updatedAt: raw.updated_at ?? null,
                pushedAt: raw.pushed_at ?? null
            }
        };
    }

    /**
     * Parse multiple GitHub repositories.
     *
     * @param {Array|Object} rawList
     * @param {Object} [context={}]
     * @returns {Array}
     */
    static parseRepositories(rawList, context = {}) {
        const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
        return list.map(item => this.parseRepository(item, context)).filter(Boolean);
    }

    /**
     * Parse a single GitHub pull request into normalized schema.
     *
     * @param {Object} raw - Raw GitHub pull request object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parsePullRequest(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const repoFullName = context.repository ||
            raw.head?.repo?.full_name ||
            raw.base?.repo?.full_name ||
            (raw.repository_url ? raw.repository_url.split("/").slice(-2).join("/") : null) ||
            "";

        const number = raw.number ?? raw.id;
        const value = repoFullName ? `${repoFullName}#${number}` : String(number);

        return {
            type: "pull_request",
            value: value,
            properties: {
                id: raw.id ?? null,
                number: number,
                title: raw.title ?? "",
                state: raw.state ?? "open",
                isDraft: Boolean(raw.draft),
                isLocked: Boolean(raw.locked),
                isMerged: Boolean(raw.merged_at || raw.merged),
                repository: repoFullName || null,
                author: raw.user ? {
                    id: raw.user.id ?? null,
                    login: raw.user.login ?? null,
                    type: raw.user.type ?? null,
                    avatarUrl: raw.user.avatar_url ?? null,
                    htmlUrl: raw.user.html_url ?? null
                } : null,
                body: raw.body ?? "",
                htmlUrl: raw.html_url ?? null,
                head: {
                    ref: raw.head?.ref ?? null,
                    sha: raw.head?.sha ?? null,
                    repo: raw.head?.repo?.full_name ?? repoFullName ?? null
                },
                base: {
                    ref: raw.base?.ref ?? null,
                    sha: raw.base?.sha ?? null,
                    repo: raw.base?.repo?.full_name ?? repoFullName ?? null
                },
                labels: Array.isArray(raw.labels)
                    ? raw.labels.map(l => (typeof l === "string" ? l : (l?.name || ""))).filter(Boolean)
                    : [],
                assignees: Array.isArray(raw.assignees)
                    ? raw.assignees.map(a => ({
                        id: a.id ?? null,
                        login: a.login ?? null,
                        avatarUrl: a.avatar_url ?? null
                    }))
                    : [],
                requestedReviewers: Array.isArray(raw.requested_reviewers)
                    ? raw.requested_reviewers.map(r => ({
                        id: r.id ?? null,
                        login: r.login ?? null,
                        avatarUrl: r.avatar_url ?? null
                    }))
                    : [],
                mergeCommitSha: raw.merge_commit_sha ?? null,
                createdAt: raw.created_at ?? null,
                updatedAt: raw.updated_at ?? null,
                closedAt: raw.closed_at ?? null,
                mergedAt: raw.merged_at ?? null
            }
        };
    }

    /**
     * Parse multiple GitHub pull requests.
     *
     * @param {Array|Object} rawList
     * @param {Object} [context={}]
     * @returns {Array}
     */
    static parsePullRequests(rawList, context = {}) {
        const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
        return list.map(item => this.parsePullRequest(item, context)).filter(Boolean);
    }

    /**
     * Parse a single GitHub branch into normalized schema.
     *
     * @param {Object} raw - Raw GitHub branch object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parseBranch(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const repoFullName = context.repository || "";
        const branchName = raw.name || "";
        const value = repoFullName ? `${repoFullName}:${branchName}` : branchName;

        return {
            type: "branch",
            value: value,
            properties: {
                name: branchName,
                repository: repoFullName || null,
                isProtected: Boolean(raw.protected),
                commit: {
                    sha: raw.commit?.sha ?? null,
                    url: raw.commit?.url ?? null
                },
                protectionUrl: raw.protection_url ?? null
            }
        };
    }

    /**
     * Parse multiple GitHub branches.
     *
     * @param {Array|Object} rawList
     * @param {Object} [context={}]
     * @returns {Array}
     */
    static parseBranches(rawList, context = {}) {
        const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
        return list.map(item => this.parseBranch(item, context)).filter(Boolean);
    }

    /**
     * Parse a single GitHub commit into normalized schema.
     *
     * @param {Object} raw - Raw GitHub commit object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parseCommit(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const repoFullName = context.repository || "";
        const sha = raw.sha || "";
        const value = repoFullName ? `${repoFullName}@${sha}` : sha;

        return {
            type: "commit",
            value: value,
            properties: {
                sha: sha,
                repository: repoFullName || null,
                message: raw.commit?.message ?? raw.message ?? "",
                author: {
                    name: raw.commit?.author?.name ?? raw.author?.login ?? null,
                    email: raw.commit?.author?.email ?? null,
                    date: raw.commit?.author?.date ?? null,
                    login: raw.author?.login ?? null,
                    avatarUrl: raw.author?.avatar_url ?? null
                },
                committer: {
                    name: raw.commit?.committer?.name ?? raw.committer?.login ?? null,
                    email: raw.commit?.committer?.email ?? null,
                    date: raw.commit?.committer?.date ?? null,
                    login: raw.committer?.login ?? null
                },
                htmlUrl: raw.html_url ?? null,
                isVerified: Boolean(raw.commit?.verification?.verified),
                parents: Array.isArray(raw.parents)
                    ? raw.parents.map(p => (typeof p === "string" ? p : p.sha)).filter(Boolean)
                    : []
            }
        };
    }

    /**
     * Parse multiple GitHub commits.
     *
     * @param {Array|Object} rawList
     * @param {Object} [context={}]
     * @returns {Array}
     */
    static parseCommits(rawList, context = {}) {
        const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
        return list.map(item => this.parseCommit(item, context)).filter(Boolean);
    }

    /**
     * Generic parse method based on capability type.
     *
     * @param {string} type - Capability type (repos, prs, branches, commits)
     * @param {Array|Object} data - Raw data
     * @param {Object} [context={}] - Context
     * @returns {Array|Object}
     */
    static parse(type, data, context = {}) {
        switch (String(type).toLowerCase()) {
            case "repo":
            case "repos":
            case "repository":
            case "respository":
            case "projects":
                return Array.isArray(data)
                    ? this.parseRepositories(data, context)
                    : this.parseRepository(data, context);
            case "pr":
            case "prs":
            case "pull_request":
            case "pull_requests":
            case "pulls":
                return Array.isArray(data)
                    ? this.parsePullRequests(data, context)
                    : this.parsePullRequest(data, context);
            case "branch":
            case "branches":
                return Array.isArray(data)
                    ? this.parseBranches(data, context)
                    : this.parseBranch(data, context);
            case "commit":
            case "commits":
                return Array.isArray(data)
                    ? this.parseCommits(data, context)
                    : this.parseCommit(data, context);
            default:
                return data;
        }
    }
}

export const parseRepository = GithubParser.parseRepository.bind(GithubParser);
export const parseRepositories = GithubParser.parseRepositories.bind(GithubParser);
export const parsePullRequest = GithubParser.parsePullRequest.bind(GithubParser);
export const parsePullRequests = GithubParser.parsePullRequests.bind(GithubParser);
export const parseBranch = GithubParser.parseBranch.bind(GithubParser);
export const parseBranches = GithubParser.parseBranches.bind(GithubParser);
export const parseCommit = GithubParser.parseCommit.bind(GithubParser);
export const parseCommits = GithubParser.parseCommits.bind(GithubParser);

export default GithubParser;
