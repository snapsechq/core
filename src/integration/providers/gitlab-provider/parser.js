/**
 * Normalized Parser for GitLab Adapter Data.
 * Formats projects/repositories, merge requests, branches, and commits into the exact
 * same normalized schema as GitHub:
 * { type: string, value: string, properties: Object }
 */

export class GitlabParser {
    /**
     * Parse a single GitLab project into normalized repository schema.
     *
     * @param {Object} raw - Raw GitLab project object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parseRepository(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const fullName = raw.path_with_namespace ||
            raw.full_name ||
            (raw.namespace?.path && raw.path ? `${raw.namespace.path}/${raw.path}` : raw.name) ||
            context.repository ||
            "";

        const ownerObj = raw.owner || raw.namespace;
        const owner = ownerObj ? {
            id: ownerObj.id ?? null,
            login: (ownerObj.username || ownerObj.path || ownerObj.name) || null,
            type: ownerObj.kind || (raw.owner ? "User" : "Group"),
            avatarUrl: ownerObj.avatar_url ?? null,
            htmlUrl: ownerObj.web_url ?? null
        } : null;

        return {
            type: "respository",
            value: fullName,
            properties: {
                id: raw.id ?? null,
                name: raw.name ?? null,
                fullName: fullName,
                description: raw.description ?? null,
                owner: owner,
                htmlUrl: raw.web_url ?? raw.html_url ?? null,
                cloneUrl: raw.http_url_to_repo ?? raw.clone_url ?? null,
                sshUrl: raw.ssh_url_to_repo ?? raw.ssh_url ?? null,
                defaultBranch: raw.default_branch || "main",
                visibility: raw.visibility || (raw.public ? "public" : "private"),
                isPrivate: raw.visibility === "private" || Boolean(raw.private),
                isFork: Boolean(raw.forked_from_project || raw.fork),
                isArchived: Boolean(raw.archived),
                isDisabled: Boolean(raw.empty_repo || raw.disabled),
                primaryLanguage: raw.primary_language || (raw.languages?.[0]?.name) || raw.language || null,
                languages: Array.isArray(raw.languages)
                    ? (typeof raw.languages[0] === "object" ? raw.languages.map(l => l.name) : raw.languages)
                    : (raw.language ? [raw.language] : []),
                topics: Array.isArray(raw.topics)
                    ? raw.topics
                    : (Array.isArray(raw.tag_list) ? raw.tag_list : []),
                size: raw.statistics?.repository_size ?? raw.size ?? 0,
                starsCount: raw.star_count ?? raw.stargazers_count ?? 0,
                forksCount: raw.forks_count ?? 0,
                openIssuesCount: raw.open_issues_count ?? 0,
                watchersCount: raw.star_count ?? raw.watchers_count ?? 0,
                license: raw.license ? {
                    key: raw.license.key ?? null,
                    name: raw.license.name ?? null,
                    spdxId: raw.license.nickname ?? raw.license.spdx_id ?? null,
                    url: raw.license.url ?? null
                } : null,
                createdAt: raw.created_at ?? null,
                updatedAt: raw.updated_at ?? null,
                pushedAt: raw.last_activity_at ?? raw.pushed_at ?? null
            }
        };
    }

    /**
     * Parse multiple GitLab projects.
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
     * Parse a single GitLab merge request into normalized pull_request schema.
     *
     * @param {Object} raw - Raw GitLab merge request object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parsePullRequest(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        let repoFullName = context.repository || "";
        if (!repoFullName && raw.web_url) {
            const match = raw.web_url.match(/https?:\/\/[^\/]+\/(.+?)\/-\/merge_requests\/\d+/);
            if (match) repoFullName = match[1];
        }
        if (!repoFullName && raw.references?.full) {
            const match = raw.references.full.match(/^(.+?)!\d+$/);
            if (match) repoFullName = match[1];
        }

        const number = raw.iid ?? raw.number ?? raw.id;
        const value = repoFullName ? `${repoFullName}#${number}` : String(number);

        const state = raw.state === "opened" ? "open" : (raw.state ?? "open");
        const isMerged = raw.state === "merged" || Boolean(raw.merged_at);

        return {
            type: "pull_request",
            value: value,
            properties: {
                id: raw.id ?? null,
                number: number,
                title: raw.title ?? "",
                state: state,
                isDraft: Boolean(raw.draft || raw.work_in_progress || raw.title?.startsWith("Draft:") || raw.title?.startsWith("WIP:")),
                isLocked: Boolean(raw.discussion_locked || raw.locked),
                isMerged: isMerged,
                repository: repoFullName || (raw.project_id ? String(raw.project_id) : null),
                author: raw.author ? {
                    id: raw.author.id ?? null,
                    login: raw.author.username ?? raw.author.login ?? null,
                    type: "User",
                    avatarUrl: raw.author.avatar_url ?? null,
                    htmlUrl: raw.author.web_url ?? null
                } : null,
                body: raw.description ?? raw.body ?? "",
                htmlUrl: raw.web_url ?? raw.html_url ?? null,
                head: {
                    ref: raw.source_branch ?? raw.head?.ref ?? null,
                    sha: raw.sha ?? raw.diff_head_sha ?? raw.head?.sha ?? null,
                    repo: repoFullName || null
                },
                base: {
                    ref: raw.target_branch ?? raw.base?.ref ?? null,
                    sha: raw.target_branch_sha ?? raw.base?.sha ?? null,
                    repo: repoFullName || null
                },
                labels: Array.isArray(raw.labels)
                    ? raw.labels.map(l => (typeof l === "string" ? l : (l?.name || ""))).filter(Boolean)
                    : [],
                assignees: Array.isArray(raw.assignees)
                    ? raw.assignees.map(a => ({
                        id: a.id ?? null,
                        login: a.username ?? a.login ?? null,
                        avatarUrl: a.avatar_url ?? null
                    }))
                    : (raw.assignee ? [{
                        id: raw.assignee.id ?? null,
                        login: raw.assignee.username ?? raw.assignee.login ?? null,
                        avatarUrl: raw.assignee.avatar_url ?? null
                    }] : []),
                requestedReviewers: Array.isArray(raw.reviewers)
                    ? raw.reviewers.map(r => ({
                        id: r.id ?? null,
                        login: r.username ?? r.login ?? null,
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
     * Parse multiple GitLab merge requests.
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
     * Parse a single GitLab branch into normalized branch schema.
     *
     * @param {Object} raw - Raw GitLab branch object
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
                    sha: raw.commit?.id ?? raw.commit?.sha ?? null,
                    url: raw.commit?.web_url ?? raw.commit?.url ?? null
                },
                protectionUrl: null
            }
        };
    }

    /**
     * Parse multiple GitLab branches.
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
     * Parse a single GitLab commit into normalized commit schema.
     *
     * @param {Object} raw - Raw GitLab commit object
     * @param {Object} [context={}] - Optional context (e.g. repository)
     * @returns {Object|null}
     */
    static parseCommit(raw, context = {}) {
        if (!raw || typeof raw !== "object") return null;

        const repoFullName = context.repository || "";
        const sha = raw.id ?? raw.sha ?? "";
        const value = repoFullName ? `${repoFullName}@${sha}` : sha;

        return {
            type: "commit",
            value: value,
            properties: {
                sha: sha,
                repository: repoFullName || null,
                message: raw.message ?? raw.title ?? "",
                author: {
                    name: raw.author_name ?? raw.commit?.author?.name ?? raw.author?.name ?? null,
                    email: raw.author_email ?? raw.commit?.author?.email ?? null,
                    date: raw.authored_date ?? raw.created_at ?? raw.commit?.author?.date ?? null,
                    login: null,
                    avatarUrl: null
                },
                committer: {
                    name: raw.committer_name ?? raw.commit?.committer?.name ?? raw.author_name ?? null,
                    email: raw.committer_email ?? raw.commit?.committer?.email ?? raw.author_email ?? null,
                    date: raw.committed_date ?? raw.commit?.committer?.date ?? raw.authored_date ?? null,
                    login: null
                },
                htmlUrl: raw.web_url ?? raw.html_url ?? null,
                isVerified: Boolean(raw.signature_type || raw.verification?.verified),
                parents: Array.isArray(raw.parent_ids)
                    ? raw.parent_ids
                    : (Array.isArray(raw.parents) ? raw.parents.map(p => (typeof p === "string" ? p : p.sha)).filter(Boolean) : [])
            }
        };
    }

    /**
     * Parse multiple GitLab commits.
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
            case "mr":
            case "mrs":
            case "merge_requests":
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

export const parseRepository = GitlabParser.parseRepository.bind(GitlabParser);
export const parseRepositories = GitlabParser.parseRepositories.bind(GitlabParser);
export const parsePullRequest = GitlabParser.parsePullRequest.bind(GitlabParser);
export const parsePullRequests = GitlabParser.parsePullRequests.bind(GitlabParser);
export const parseBranch = GitlabParser.parseBranch.bind(GitlabParser);
export const parseBranches = GitlabParser.parseBranches.bind(GitlabParser);
export const parseCommit = GitlabParser.parseCommit.bind(GitlabParser);
export const parseCommits = GitlabParser.parseCommits.bind(GitlabParser);

export default GitlabParser;
