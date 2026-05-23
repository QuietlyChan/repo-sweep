export type ProviderName = "gitlab" | "github";

export interface Project {
  id: number | string;
  name: string;
  path: string;
  pathWithNamespace: string;
  httpUrl: string;
  sshUrl: string;
  webUrl: string;
  defaultBranch: string | null;
  archived: boolean;
  emptyRepo?: boolean;
}

export interface ProviderOptions {
  providerName: ProviderName;
  baseUrl: string;
  apiUrl: string;
  token: string;
  skipArchived: boolean;
}

export interface ProviderDefinition {
  name: ProviderName;
  label: string;
  defaultBaseUrl: string;
  defaultGitUsername: string;
  defaultApiUrl(baseUrl: string): string;
  listProjects(options: ProviderOptions): Promise<Project[]>;
}

interface GitLabProjectResponse {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  http_url_to_repo: string;
  ssh_url_to_repo: string;
  web_url: string;
  default_branch: string | null;
  archived: boolean;
  empty_repo?: boolean;
}

interface GitHubRepositoryResponse {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  default_branch: string | null;
  archived: boolean;
  size?: number;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function apiEndpoint(options: ProviderOptions, path: string): URL {
  return new URL(path.replace(/^\/+/, ""), options.apiUrl);
}

function githubApiUrl(baseUrl: string): string {
  const normalized = normalizeUrl(baseUrl);
  const parsed = new URL(normalized);

  if (parsed.hostname === "github.com") {
    return "https://api.github.com/";
  }

  return new URL("api/v3/", normalized).toString();
}

async function fetchProviderJson(
  options: ProviderOptions,
  url: URL,
  headers: HeadersInit,
): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        Accept: "application/json",
        ...headers,
      },
    });
  } catch (error) {
    throw new Error(
      [
        `无法连接 ${getProvider(options.providerName).label}：${options.baseUrl}`,
        "请检查：",
        "1. 当前网络是否可访问该平台，或是否需要内网/VPN。",
        "2. 平台地址是否正确。",
        "3. 浏览器是否能打开该平台地址。",
        "4. 公司代理、防火墙或 DNS 是否阻止访问。",
        "",
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
      ].join("\n"),
    );
  }
}

async function assertOk(
  provider: ProviderDefinition,
  response: Response,
): Promise<void> {
  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(
    [
      `${provider.label} API 请求失败：${response.status} ${response.statusText}`,
      "请检查访问令牌权限、平台地址和 API 地址是否正确。",
      body,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function parseGitHubNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2] === "next") {
      return match[1];
    }
  }

  return null;
}

async function listGitLabProjects(
  options: ProviderOptions,
): Promise<Project[]> {
  const provider = getProvider("gitlab");
  const projects: Project[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = apiEndpoint(options, "projects");
    url.searchParams.set("membership", "true");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("order_by", "path");
    url.searchParams.set("sort", "asc");

    if (options.skipArchived) {
      url.searchParams.set("archived", "false");
    }

    const response = await fetchProviderJson(options, url, {
      "PRIVATE-TOKEN": options.token,
    });
    await assertOk(provider, response);

    const batch = (await response.json()) as GitLabProjectResponse[];
    projects.push(
      ...batch.map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path,
        pathWithNamespace: project.path_with_namespace,
        httpUrl: project.http_url_to_repo,
        sshUrl: project.ssh_url_to_repo,
        webUrl: project.web_url,
        defaultBranch: project.default_branch,
        archived: project.archived,
        emptyRepo: project.empty_repo,
      })),
    );

    const nextPage = response.headers.get("x-next-page");
    if (!nextPage) {
      break;
    }

    page = Number.parseInt(nextPage, 10);
    if (!page) {
      break;
    }
  }

  return projects;
}

async function listGitHubProjects(
  options: ProviderOptions,
): Promise<Project[]> {
  const provider = getProvider("github");
  const projects: Project[] = [];
  let url: URL | null = apiEndpoint(options, "user/repos");
  url.searchParams.set("affiliation", "owner,collaborator,organization_member");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("sort", "full_name");
  url.searchParams.set("direction", "asc");

  while (url) {
    const response = await fetchProviderJson(options, url, {
      Authorization: `Bearer ${options.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    await assertOk(provider, response);

    const batch = (await response.json()) as GitHubRepositoryResponse[];
    projects.push(
      ...batch
        .filter((repo) => !options.skipArchived || !repo.archived)
        .map((repo) => ({
          id: repo.id,
          name: repo.name,
          path: repo.name,
          pathWithNamespace: repo.full_name,
          httpUrl: repo.clone_url,
          sshUrl: repo.ssh_url,
          webUrl: repo.html_url,
          defaultBranch: repo.default_branch,
          archived: repo.archived,
          emptyRepo: repo.size === 0 && !repo.default_branch,
        })),
    );

    const next = parseGitHubNextLink(response.headers.get("link"));
    url = next ? new URL(next) : null;
  }

  return projects;
}

const PROVIDERS: Record<ProviderName, ProviderDefinition> = {
  gitlab: {
    name: "gitlab",
    label: "GitLab",
    defaultBaseUrl: "http://127.0.0.1/",
    defaultGitUsername: "oauth2",
    defaultApiUrl(baseUrl) {
      return new URL("api/v4/", normalizeUrl(baseUrl)).toString();
    },
    listProjects: listGitLabProjects,
  },
  github: {
    name: "github",
    label: "GitHub",
    defaultBaseUrl: "https://github.com/",
    defaultGitUsername: "x-access-token",
    defaultApiUrl: githubApiUrl,
    listProjects: listGitHubProjects,
  },
};

export function parseProviderName(value: string | undefined): ProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "github" || normalized === "gitlab") {
    return normalized;
  }

  if (normalized) {
    throw new Error(`不支持的平台：${value}。可选值：gitlab、github。`);
  }

  return "gitlab";
}

export function getProvider(name: ProviderName): ProviderDefinition {
  return PROVIDERS[name];
}

export function listProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS);
}
