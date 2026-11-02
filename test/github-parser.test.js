import { describe, it, expect } from "vitest";
import { GithubParser } from "../src/integration/providers/github-provider/parser.js";

describe("GithubParser Unit Tests", () => {
    describe("parseRepository", () => {
        it("normalizes a repository object into { type: 'respository', value: 'xyz/repo-name', properties: { ... } }", () => {
            const raw = {
                id: 123456,
                name: "Hello-World",
                full_name: "octocat/Hello-World",
                description: "This is your first repo!",
                owner: {
                    id: 1,
                    login: "octocat",
                    type: "User",
                    avatar_url: "https://github.com/images/error/octocat_happy.gif",
                    html_url: "https://github.com/octocat",
                },
                private: false,
                html_url: "https://github.com/octocat/Hello-World",
                clone_url: "https://github.com/octocat/Hello-World.git",
                ssh_url: "git@github.com:octocat/Hello-World.git",
                default_branch: "main",
                visibility: "public",
                fork: false,
                archived: false,
                disabled: false,
                language: "JavaScript",
                topics: ["octocat", "atom", "electron", "api"],
                size: 108,
                stargazers_count: 80,
                forks_count: 9,
                open_issues_count: 0,
                watchers_count: 80,
                license: {
                    key: "mit",
                    name: "MIT License",
                    spdx_id: "MIT",
                    url: "https://api.github.com/licenses/mit",
                },
                created_at: "2011-01-26T19:01:12Z",
                updated_at: "2026-01-26T19:14:43Z",
                pushed_at: "2026-01-26T19:06:43Z",
            };

            const parsed = GithubParser.parseRepository(raw);

            expect(parsed).toEqual({
                type: "respository",
                value: "octocat/Hello-World",
                properties: {
                    id: 123456,
                    name: "Hello-World",
                    fullName: "octocat/Hello-World",
                    description: "This is your first repo!",
                    owner: {
                        id: 1,
                        login: "octocat",
                        type: "User",
                        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
                        htmlUrl: "https://github.com/octocat",
                    },
                    htmlUrl: "https://github.com/octocat/Hello-World",
                    cloneUrl: "https://github.com/octocat/Hello-World.git",
                    sshUrl: "git@github.com:octocat/Hello-World.git",
                    defaultBranch: "main",
                    visibility: "public",
                    isPrivate: false,
                    isFork: false,
                    isArchived: false,
                    isDisabled: false,
                    primaryLanguage: "JavaScript",
                    languages: ["JavaScript"],
                    topics: ["octocat", "atom", "electron", "api"],
                    size: 108,
                    starsCount: 80,
                    forksCount: 9,
                    openIssuesCount: 0,
                    watchersCount: 80,
                    license: {
                        key: "mit",
                        name: "MIT License",
                        spdxId: "MIT",
                        url: "https://api.github.com/licenses/mit",
                    },
                    createdAt: "2011-01-26T19:01:12Z",
                    updatedAt: "2026-01-26T19:14:43Z",
                    pushedAt: "2026-01-26T19:06:43Z",
                },
            });
        });

        it("handles missing full_name gracefully using owner.login and name", () => {
            const raw = {
                id: 999,
                name: "custom-repo",
                owner: { login: "custom-org" },
            };

            const parsed = GithubParser.parseRepository(raw);
            expect(parsed.value).toBe("custom-org/custom-repo");
            expect(parsed.type).toBe("respository");
        });

        it("returns empty array when rawList is empty or invalid", () => {
            expect(GithubParser.parseRepositories(null)).toEqual([]);
            expect(GithubParser.parseRepositories([])).toEqual([]);
        });
    });

    describe("parsePullRequest", () => {
        it("normalizes a pull request into { type: 'pull_request', value: 'repo#123', properties: { ... } }", () => {
            const raw = {
                id: 1,
                number: 1347,
                state: "open",
                title: "Amazing new feature",
                body: "Please pull this in!",
                draft: false,
                locked: false,
                user: {
                    id: 1,
                    login: "octocat",
                    type: "User",
                    avatar_url: "https://github.com/images/error/octocat_happy.gif",
                    html_url: "https://github.com/octocat",
                },
                html_url: "https://github.com/octocat/Hello-World/pull/1347",
                head: {
                    ref: "new-topic",
                    sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                    repo: { full_name: "octocat/Hello-World" },
                },
                base: {
                    ref: "main",
                    sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                    repo: { full_name: "octocat/Hello-World" },
                },
                labels: [{ name: "bug" }, "enhancement"],
                assignees: [{ id: 1, login: "octocat", avatar_url: "https://github.com/octocat.png" }],
                requested_reviewers: [{ id: 2, login: "hubot", avatar_url: "https://github.com/hubot.png" }],
                created_at: "2011-01-26T19:01:12Z",
                updated_at: "2011-01-26T19:01:12Z",
            };

            const parsed = GithubParser.parsePullRequest(raw, { repository: "octocat/Hello-World" });

            expect(parsed).toEqual({
                type: "pull_request",
                value: "octocat/Hello-World#1347",
                properties: {
                    id: 1,
                    number: 1347,
                    title: "Amazing new feature",
                    state: "open",
                    isDraft: false,
                    isLocked: false,
                    isMerged: false,
                    repository: "octocat/Hello-World",
                    author: {
                        id: 1,
                        login: "octocat",
                        type: "User",
                        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
                        htmlUrl: "https://github.com/octocat",
                    },
                    body: "Please pull this in!",
                    htmlUrl: "https://github.com/octocat/Hello-World/pull/1347",
                    head: {
                        ref: "new-topic",
                        sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                        repo: "octocat/Hello-World",
                    },
                    base: {
                        ref: "main",
                        sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                        repo: "octocat/Hello-World",
                    },
                    labels: ["bug", "enhancement"],
                    assignees: [{ id: 1, login: "octocat", avatarUrl: "https://github.com/octocat.png" }],
                    requestedReviewers: [{ id: 2, login: "hubot", avatarUrl: "https://github.com/hubot.png" }],
                    mergeCommitSha: null,
                    createdAt: "2011-01-26T19:01:12Z",
                    updatedAt: "2011-01-26T19:01:12Z",
                    closedAt: null,
                    mergedAt: null,
                },
            });
        });
    });

    describe("parseBranch", () => {
        it("normalizes a branch into { type: 'branch', value: 'repo:branch', properties: { ... } }", () => {
            const raw = {
                name: "main",
                commit: {
                    sha: "c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                    url: "https://api.github.com/repos/octocat/Hello-World/commits/c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                },
                protected: true,
                protection_url: "https://api.github.com/repos/octocat/Hello-World/branches/main/protection",
            };

            const parsed = GithubParser.parseBranch(raw, { repository: "octocat/Hello-World" });

            expect(parsed).toEqual({
                type: "branch",
                value: "octocat/Hello-World:main",
                properties: {
                    name: "main",
                    repository: "octocat/Hello-World",
                    isProtected: true,
                    commit: {
                        sha: "c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                        url: "https://api.github.com/repos/octocat/Hello-World/commits/c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                    },
                    protectionUrl: "https://api.github.com/repos/octocat/Hello-World/branches/main/protection",
                },
            });
        });
    });

    describe("parseCommit", () => {
        it("normalizes a commit into { type: 'commit', value: 'repo@sha', properties: { ... } }", () => {
            const raw = {
                sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                commit: {
                    author: {
                        name: "Monalisa Octocat",
                        email: "support@github.com",
                        date: "2011-04-14T16:00:49Z",
                    },
                    committer: {
                        name: "Monalisa Octocat",
                        email: "support@github.com",
                        date: "2011-04-14T16:00:49Z",
                    },
                    message: "Fix all the bugs",
                    verification: {
                        verified: true,
                    },
                },
                author: {
                    login: "octocat",
                    avatar_url: "https://github.com/images/error/octocat_happy.gif",
                },
                committer: {
                    login: "octocat",
                },
                html_url: "https://github.com/octocat/Hello-World/commit/6dcb09b5b57875f334f61aebed695e2e4193db5e",
                parents: [
                    { sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e" },
                ],
            };

            const parsed = GithubParser.parseCommit(raw, { repository: "octocat/Hello-World" });

            expect(parsed).toEqual({
                type: "commit",
                value: "octocat/Hello-World@6dcb09b5b57875f334f61aebed695e2e4193db5e",
                properties: {
                    sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
                    repository: "octocat/Hello-World",
                    message: "Fix all the bugs",
                    author: {
                        name: "Monalisa Octocat",
                        email: "support@github.com",
                        date: "2011-04-14T16:00:49Z",
                        login: "octocat",
                        avatarUrl: "https://github.com/images/error/octocat_happy.gif",
                    },
                    committer: {
                        name: "Monalisa Octocat",
                        email: "support@github.com",
                        date: "2011-04-14T16:00:49Z",
                        login: "octocat",
                    },
                    htmlUrl: "https://github.com/octocat/Hello-World/commit/6dcb09b5b57875f334f61aebed695e2e4193db5e",
                    isVerified: true,
                    parents: ["6dcb09b5b57875f334f61aebed695e2e4193db5e"],
                },
            });
        });
    });

    describe("generic parse method", () => {
        it("routes to appropriate parser by type string", () => {
            const rawRepo = { id: 1, name: "repo", full_name: "org/repo" };
            const rawPR = { id: 2, number: 1, title: "pr" };
            const rawBranch = { name: "main" };
            const rawCommit = { sha: "abc" };

            expect(GithubParser.parse("repos", [rawRepo])[0].type).toBe("respository");
            expect(GithubParser.parse("prs", [rawPR])[0].type).toBe("pull_request");
            expect(GithubParser.parse("branches", [rawBranch])[0].type).toBe("branch");
            expect(GithubParser.parse("commits", [rawCommit])[0].type).toBe("commit");
        });
    });
});
