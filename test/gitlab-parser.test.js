import { describe, it, expect } from "vitest";
import { GitlabParser } from "../src/integration/providers/gitlab-provider/parser.js";

describe("GitlabParser Unit Tests", () => {
    describe("parseRepository", () => {
        it("normalizes a GitLab project into { type: 'respository', value: 'group/project', properties: { ... } }", () => {
            const raw = {
                id: 42,
                name: "diaspora-client",
                path: "diaspora-client",
                path_with_namespace: "diaspora/diaspora-client",
                description: "A diaspora client for Android",
                default_branch: "master",
                tag_list: ["android", "client"],
                topics: ["android", "client"],
                ssh_url_to_repo: "git@gitlab.example.com:diaspora/diaspora-client.git",
                http_url_to_repo: "https://gitlab.example.com/diaspora/diaspora-client.git",
                web_url: "https://gitlab.example.com/diaspora/diaspora-client",
                avatar_url: "https://gitlab.example.com/uploads/project/avatar/42/avatar.png",
                star_count: 5,
                forks_count: 2,
                open_issues_count: 3,
                created_at: "2020-01-01T00:00:00.000Z",
                last_activity_at: "2026-01-01T12:00:00.000Z",
                archived: false,
                visibility: "public",
                owner: {
                    id: 3,
                    name: "Diaspora",
                    username: "diaspora",
                    avatar_url: "https://gitlab.example.com/uploads/user/avatar/3/avatar.png",
                    web_url: "https://gitlab.example.com/diaspora",
                },
                statistics: {
                    repository_size: 1048576,
                },
                license: {
                    key: "mit",
                    name: "MIT License",
                    nickname: "MIT",
                    url: "https://opensource.org/licenses/MIT",
                },
            };

            const parsed = GitlabParser.parseRepository(raw);

            expect(parsed).toEqual({
                type: "respository",
                value: "diaspora/diaspora-client",
                properties: {
                    id: 42,
                    name: "diaspora-client",
                    fullName: "diaspora/diaspora-client",
                    description: "A diaspora client for Android",
                    owner: {
                        id: 3,
                        login: "diaspora",
                        type: "User",
                        avatarUrl: "https://gitlab.example.com/uploads/user/avatar/3/avatar.png",
                        htmlUrl: "https://gitlab.example.com/diaspora",
                    },
                    htmlUrl: "https://gitlab.example.com/diaspora/diaspora-client",
                    cloneUrl: "https://gitlab.example.com/diaspora/diaspora-client.git",
                    sshUrl: "git@gitlab.example.com:diaspora/diaspora-client.git",
                    defaultBranch: "master",
                    visibility: "public",
                    isPrivate: false,
                    isFork: false,
                    isArchived: false,
                    isDisabled: false,
                    primaryLanguage: null,
                    languages: [],
                    topics: ["android", "client"],
                    size: 1048576,
                    starsCount: 5,
                    forksCount: 2,
                    openIssuesCount: 3,
                    watchersCount: 5,
                    license: {
                        key: "mit",
                        name: "MIT License",
                        spdxId: "MIT",
                        url: "https://opensource.org/licenses/MIT",
                    },
                    createdAt: "2020-01-01T00:00:00.000Z",
                    updatedAt: null,
                    pushedAt: "2026-01-01T12:00:00.000Z",
                },
            });
        });

        it("handles missing path_with_namespace gracefully using namespace and path", () => {
            const raw = {
                id: 10,
                name: "my-service",
                path: "my-service",
                namespace: { path: "backend-team" },
            };

            const parsed = GitlabParser.parseRepository(raw);
            expect(parsed.value).toBe("backend-team/my-service");
            expect(parsed.type).toBe("respository");
        });
    });

    describe("parsePullRequest", () => {
        it("normalizes a GitLab merge request into { type: 'pull_request', value: 'group/project#iid', properties: { ... } }", () => {
            const raw = {
                id: 155,
                iid: 22,
                project_id: 42,
                title: "Support dark mode",
                description: "Implements CSS variables for dark mode",
                state: "opened",
                created_at: "2026-01-05T00:00:00.000Z",
                updated_at: "2026-01-06T00:00:00.000Z",
                merged_at: null,
                closed_at: null,
                target_branch: "main",
                source_branch: "feature/dark-mode",
                sha: "c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                merge_commit_sha: null,
                draft: false,
                work_in_progress: false,
                discussion_locked: false,
                web_url: "https://gitlab.example.com/diaspora/diaspora-client/-/merge_requests/22",
                labels: ["ui", "frontend"],
                author: {
                    id: 7,
                    username: "john_doe",
                    name: "John Doe",
                    avatar_url: "https://gitlab.example.com/uploads/user/avatar/7/avatar.png",
                    web_url: "https://gitlab.example.com/john_doe",
                },
                assignees: [
                    { id: 8, username: "jane_doe", avatar_url: "https://gitlab.example.com/jane.png" },
                ],
                reviewers: [
                    { id: 9, username: "code_reviewer", avatar_url: "https://gitlab.example.com/reviewer.png" },
                ],
            };

            const parsed = GitlabParser.parsePullRequest(raw);

            expect(parsed).toEqual({
                type: "pull_request",
                value: "diaspora/diaspora-client#22",
                properties: {
                    id: 155,
                    number: 22,
                    title: "Support dark mode",
                    state: "open",
                    isDraft: false,
                    isLocked: false,
                    isMerged: false,
                    repository: "diaspora/diaspora-client",
                    author: {
                        id: 7,
                        login: "john_doe",
                        type: "User",
                        avatarUrl: "https://gitlab.example.com/uploads/user/avatar/7/avatar.png",
                        htmlUrl: "https://gitlab.example.com/john_doe",
                    },
                    body: "Implements CSS variables for dark mode",
                    htmlUrl: "https://gitlab.example.com/diaspora/diaspora-client/-/merge_requests/22",
                    head: {
                        ref: "feature/dark-mode",
                        sha: "c5b97d5ae6c19d5c5df71a34c7fbeeda2479ccbc",
                        repo: "diaspora/diaspora-client",
                    },
                    base: {
                        ref: "main",
                        sha: null,
                        repo: "diaspora/diaspora-client",
                    },
                    labels: ["ui", "frontend"],
                    assignees: [{ id: 8, login: "jane_doe", avatarUrl: "https://gitlab.example.com/jane.png" }],
                    requestedReviewers: [{ id: 9, login: "code_reviewer", avatarUrl: "https://gitlab.example.com/reviewer.png" }],
                    mergeCommitSha: null,
                    createdAt: "2026-01-05T00:00:00.000Z",
                    updatedAt: "2026-01-06T00:00:00.000Z",
                    closedAt: null,
                    mergedAt: null,
                },
            });
        });
    });

    describe("parseBranch", () => {
        it("normalizes a GitLab branch into { type: 'branch', value: 'repo:branch', properties: { ... } }", () => {
            const raw = {
                name: "main",
                protected: true,
                commit: {
                    id: "7b5c3cc8be40ee161ae897bc763132121e1c9e4c",
                    web_url: "https://gitlab.example.com/diaspora/diaspora-client/-/commit/7b5c3cc8be40ee161ae897bc763132121e1c9e4c",
                },
            };

            const parsed = GitlabParser.parseBranch(raw, { repository: "diaspora/diaspora-client" });

            expect(parsed).toEqual({
                type: "branch",
                value: "diaspora/diaspora-client:main",
                properties: {
                    name: "main",
                    repository: "diaspora/diaspora-client",
                    isProtected: true,
                    commit: {
                        sha: "7b5c3cc8be40ee161ae897bc763132121e1c9e4c",
                        url: "https://gitlab.example.com/diaspora/diaspora-client/-/commit/7b5c3cc8be40ee161ae897bc763132121e1c9e4c",
                    },
                    protectionUrl: null,
                },
            });
        });
    });

    describe("parseCommit", () => {
        it("normalizes a GitLab commit into { type: 'commit', value: 'repo@sha', properties: { ... } }", () => {
            const raw = {
                id: "ed899a2f4b50b4370feeea94676502b42383c746",
                short_id: "ed899a2f4b5",
                title: "Fix database connection pooling",
                author_name: "Dmitriy Zaporozhets",
                author_email: "dmitriy@example.com",
                authored_date: "2026-01-10T11:43:00.000Z",
                committer_name: "Dmitriy Zaporozhets",
                committer_email: "dmitriy@example.com",
                committed_date: "2026-01-10T11:43:00.000Z",
                message: "Fix database connection pooling\n\nCloses #123",
                parent_ids: ["6104942438c14ec7bd21c60a49b5592ec33679d0"],
                web_url: "https://gitlab.example.com/diaspora/diaspora-client/-/commit/ed899a2f4b50b4370feeea94676502b42383c746",
            };

            const parsed = GitlabParser.parseCommit(raw, { repository: "diaspora/diaspora-client" });

            expect(parsed).toEqual({
                type: "commit",
                value: "diaspora/diaspora-client@ed899a2f4b50b4370feeea94676502b42383c746",
                properties: {
                    sha: "ed899a2f4b50b4370feeea94676502b42383c746",
                    repository: "diaspora/diaspora-client",
                    message: "Fix database connection pooling\n\nCloses #123",
                    author: {
                        name: "Dmitriy Zaporozhets",
                        email: "dmitriy@example.com",
                        date: "2026-01-10T11:43:00.000Z",
                        login: null,
                        avatarUrl: null,
                    },
                    committer: {
                        name: "Dmitriy Zaporozhets",
                        email: "dmitriy@example.com",
                        date: "2026-01-10T11:43:00.000Z",
                        login: null,
                    },
                    htmlUrl: "https://gitlab.example.com/diaspora/diaspora-client/-/commit/ed899a2f4b50b4370feeea94676502b42383c746",
                    isVerified: false,
                    parents: ["6104942438c14ec7bd21c60a49b5592ec33679d0"],
                },
            });
        });
    });

    describe("generic parse method", () => {
        it("routes to appropriate parser by type string", () => {
            const rawRepo = { id: 1, name: "repo", path_with_namespace: "org/repo" };
            const rawMR = { id: 2, iid: 1, title: "mr" };
            const rawBranch = { name: "main" };
            const rawCommit = { id: "abc" };

            expect(GitlabParser.parse("repos", [rawRepo])[0].type).toBe("respository");
            expect(GitlabParser.parse("prs", [rawMR])[0].type).toBe("pull_request");
            expect(GitlabParser.parse("branches", [rawBranch])[0].type).toBe("branch");
            expect(GitlabParser.parse("commits", [rawCommit])[0].type).toBe("commit");
        });
    });
});
