import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import { requireRailwayToken } from "./railway-token.js";

const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

export type RailwayGraphQLError = {
  readonly message: string;
  readonly path?: readonly (string | number)[];
};

export class RailwayApiError extends Error {
  readonly errors: readonly RailwayGraphQLError[];

  constructor(message: string, errors: readonly RailwayGraphQLError[] = []) {
    assert.nonEmptyString(message, "railway api error message must be non-empty");
    assert.array(errors, "railway api errors must be an array");
    super(message);
    this.name = "RailwayApiError";
    this.errors = errors;
  }
}

export class RailwayRateLimitError extends RailwayApiError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, errors: readonly RailwayGraphQLError[] = []) {
    assert.nonEmptyString(message, "railway rate limit message must be non-empty");
    assert.nonNegative(retryAfterMs, "retryAfterMs must be non-negative");
    super(message, errors);
    this.name = "RailwayRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function isRailwayRateLimitError(err: unknown): err is RailwayRateLimitError {
  return err instanceof RailwayRateLimitError;
}

type GraphQLResponse<T> = {
  readonly data?: T;
  readonly errors?: readonly RailwayGraphQLError[];
};

type Edge<T> = { readonly node: T };
type Connection<T> = { readonly edges: readonly Edge<T>[] };

export type RailwayProject = {
  readonly id: string;
  readonly name: string;
  readonly environments: Connection<{ readonly id: string; readonly name: string }>;
  readonly services: Connection<{ readonly id: string; readonly name: string }>;
};

export type RailwayCustomDomain = {
  readonly id: string;
  readonly domain: string;
  readonly status: {
    readonly verificationToken?: string | null;
    readonly certificateStatus?: string | null;
    readonly dnsRecords?: readonly {
      readonly hostlabel: string;
      readonly requiredValue: string;
      readonly currentValue?: string | null;
      readonly status?: string | null;
      readonly recordType?: string | null;
      readonly fqdn?: string | null;
    }[] | null;
  };
};

export type RailwayDnsRecord = {
  readonly hostlabel: string;
  readonly requiredValue: string;
  readonly recordType: "CNAME" | "TXT";
  readonly fqdn: string;
};

export type RailwayProjectContext = {
  readonly projectId: string;
  readonly environmentId: string;
};

type ProjectSummary = { readonly id: string; readonly name: string };

type CachedProjectContext = RailwayProjectContext & { readonly project: RailwayProject };

let listProjectsCache: readonly ProjectSummary[] | null = null;
const projectCache = new Map<string, RailwayProject>();
const projectContextCache = new Map<string, CachedProjectContext>();

let requestChain: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function railwayMinIntervalMs(): number {
  const raw = process.env["RAILWAY_API_MIN_INTERVAL_MS"]?.trim();
  const parsed = raw ? Number(raw) : 400;
  const result = Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
  assert.nonNegative(result, "railway min interval must be non-negative");
  return result;
}

/** Clear process-local Railway read caches (called after mutations). */
export function invalidateRailwayCache(): void {
  listProjectsCache = null;
  projectCache.clear();
  projectContextCache.clear();
  assert.ok(projectCache.size === 0, "railway project cache must be empty after invalidate");
  assert.ok(projectContextCache.size === 0, "railway project context cache must be empty after invalidate");
}

async function paceRailwayRequest(): Promise<void> {
  requestChain = requestChain.then(async () => {
    const wait = Math.max(0, lastRequestAt + railwayMinIntervalMs() - Date.now());
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    lastRequestAt = Date.now();
  });
  await requestChain;
}

export async function waitForRailwayRateLimit(
  error: RailwayRateLimitError,
  options?: { readonly logEveryMs?: number },
): Promise<void> {
  assert.ok(error instanceof RailwayRateLimitError, "wait requires a RailwayRateLimitError");
  assert.nonNegative(error.retryAfterMs, "retryAfterMs must be non-negative");
  const logEveryMs = options?.logEveryMs ?? 30_000;
  assert.nonNegative(logEveryMs, "logEveryMs must be non-negative");
  let remaining = error.retryAfterMs;
  while (remaining > 0) {
    ha.ok(remaining > 0, "remaining rate-limit wait must be positive", { remaining });
    console.log(`  Waiting ${Math.ceil(remaining / 1000)}s for Railway rate limit…`);
    const step = Math.min(remaining, logEveryMs);
    await new Promise((resolve) => setTimeout(resolve, step));
    remaining -= step;
  }
}

function throwRailwayHttpError(
  status: number,
  detail: string,
  response: Response,
  body: string,
  errors: readonly RailwayGraphQLError[] = [],
): never {
  assert.number(status, "railway http status must be a number");
  assert.string(detail, "railway http detail must be a string");
  assert.ok(response instanceof Response, "railway http response must be a Response");
  assert.string(body, "railway http body must be a string");
  assert.array(errors, "railway graphql errors must be an array");
  if (status === 429) {
    const retryAfterMs = parseRetryAfterMs(response, body) ?? 60_000;
    throw new RailwayRateLimitError(
      `Railway API HTTP 429: ${detail}${formatRetryAfter(response, body)}`,
      retryAfterMs,
      errors,
    );
  }
  throw new RailwayApiError(
    `Railway API HTTP ${status}: ${detail}${formatRetryAfter(response, body)}`,
    errors,
  );
}

function parseRetryAfterMs(response: Response, body: string): number | undefined {
  assert.ok(response instanceof Response, "railway response must be a Response");
  assert.string(body, "railway body must be a string");
  const header = response.headers.get("retry-after")?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  const match = body.match(/try again in (\d+(?:\.\d+)?) seconds/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  return undefined;
}

function railwayRetryDelayMs(response: Response, body: string, attempt: number): number {
  assert.ok(response instanceof Response, "railway response must be a Response");
  assert.string(body, "railway body must be a string");
  assert.integer(attempt, "railway retry attempt must be an integer");
  assert.ok(attempt >= 0, "railway retry attempt must be >= 0", { attempt });
  const retryAfterMs = parseRetryAfterMs(response, body);
  if (retryAfterMs != null) return Math.min(retryAfterMs, 120_000);
  return Math.min(1_000 * 2 ** attempt, 30_000);
}

function formatRetryAfter(response: Response, body: string): string {
  const retryAfterMs = parseRetryAfterMs(response, body);
  if (retryAfterMs == null) return "";
  const seconds = Math.ceil(retryAfterMs / 1000);
  return ` Retry after ${seconds}s.`;
}

function shouldRetryRailwayRequest(status: number): boolean {
  // 429 is a quota window — retrying in-process just blocks the CLI for minutes.
  return status === 503;
}

async function railwayRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  assert.nonEmptyString(query, "railway graphql query must be non-empty");
  if (variables !== undefined) assert.record(variables, "railway graphql variables must be a record");
  assert.ok(RAILWAY_GRAPHQL_URL.startsWith("https://"), "railway graphql url must be https");
  const token = requireRailwayToken();
  assert.nonEmptyString(token, "railway token must be non-empty");
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    ha.ok(attempt >= 0 && attempt < maxAttempts, "railway attempt must be in range", { attempt });
    await paceRailwayRequest();

    const response = await fetch(RAILWAY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    assert.ok(response instanceof Response, "railway fetch must return a Response");

    const body = await response.text();
    assert.string(body, "railway response body must be a string");
    let payload: GraphQLResponse<T>;
    try {
      payload = JSON.parse(body) as GraphQLResponse<T>;
    } catch {
      if (shouldRetryRailwayRequest(response.status) && attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, railwayRetryDelayMs(response, body, attempt)),
        );
        continue;
      }
      throwRailwayHttpError(response.status, body.slice(0, 500), response, body);
    }
    assert.record(payload, "railway graphql payload must be a record");

    if (!response.ok) {
      if (shouldRetryRailwayRequest(response.status) && attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, railwayRetryDelayMs(response, body, attempt)),
        );
        continue;
      }
      const errors = payload.errors ?? [];
      assert.array(errors, "railway graphql errors must be an array");
      const detail =
        payload.errors?.map((e) => e.message).join("; ") ||
        body.slice(0, 500);
      throwRailwayHttpError(response.status, detail, response, body, payload.errors ?? []);
    }

    if (payload.errors?.length) {
      assert.nonEmptyArray(payload.errors, "railway graphql errors must be non-empty when present");
      throw new RailwayApiError(
        payload.errors.map((e) => e.message).join("; "),
        payload.errors,
      );
    }
    assert.defined(payload.data, "Railway API returned no data");
    if (!payload.data) {
      throw new RailwayApiError("Railway API returned no data");
    }
    return payload.data;
  }

  throw new RailwayApiError("Railway API request failed after retries");
}

function nodes<T>(connection: Connection<T> | null | undefined): readonly T[] {
  return connection?.edges?.map((edge) => edge.node) ?? [];
}

export async function listProjects(): Promise<readonly ProjectSummary[]> {
  if (listProjectsCache) return listProjectsCache;

  const data = await railwayRequest<{
    projects: Connection<ProjectSummary>;
  }>(`
    query projects {
      projects {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `);
  listProjectsCache = nodes(data.projects);
  assert.array(listProjectsCache, "railway projects must be an array");
  for (const project of listProjectsCache) {
    ha.nonEmptyString(project.id, "railway project id must be non-empty");
    ha.nonEmptyString(project.name, "railway project name must be non-empty");
  }
  return listProjectsCache;
}

export async function getProject(projectId: string): Promise<RailwayProject> {
  assert.nonEmptyString(projectId, "project id must be non-empty");
  const cached = projectCache.get(projectId);
  if (cached) return cached;

  const data = await railwayRequest<{ project: RailwayProject }>(
    `
    query project($id: String!) {
      project(id: $id) {
        id
        name
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `,
    { id: projectId },
  );
  assert.record(data.project, "railway project must be a record");
  assert.nonEmptyString(data.project.id, "railway project id must be non-empty");
  assert.nonEmptyString(data.project.name, "railway project name must be non-empty");
  projectCache.set(projectId, data.project);
  return data.project;
}

export async function findProjectByName(name: string): Promise<RailwayProject | undefined> {
  assert.nonEmptyString(name, "project name must be non-empty");
  const projects = await listProjects();
  assert.array(projects, "railway projects must be an array");
  const match = projects.find((p) => p.name === name);
  if (!match) return undefined;
  return getProject(match.id);
}

export async function createProject(name: string): Promise<RailwayProject> {
  assert.nonEmptyString(name, "project name must be non-empty");
  const data = await railwayRequest<{ projectCreate: { readonly id: string } }>(
    `
    mutation projectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
      }
    }
  `,
    { input: { name } },
  );
  assert.record(data.projectCreate, "created project must be a record");
  assert.nonEmptyString(data.projectCreate.id, "created project id must be non-empty");
  invalidateRailwayCache();
  return getProject(data.projectCreate.id);
}

export async function ensureProject(name: string): Promise<RailwayProject> {
  assert.nonEmptyString(name, "project name must be non-empty");
  const existing = await findProjectByName(name);
  if (existing) return existing;
  return createProject(name);
}

export async function updateProjectName(projectId: string, name: string): Promise<void> {
  assert.nonEmptyString(projectId, "project id must be non-empty");
  assert.nonEmptyString(name, "project name must be non-empty");
  await railwayRequest<{ projectUpdate: { readonly id: string; readonly name: string } }>(
    `
    mutation projectUpdate($id: String!, $input: ProjectUpdateInput!) {
      projectUpdate(id: $id, input: $input) {
        id
        name
      }
    }
  `,
    { id: projectId, input: { name } },
  );
  invalidateRailwayCache();
}

export async function updateServiceName(serviceId: string, name: string): Promise<void> {
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  assert.nonEmptyString(name, "service name must be non-empty");
  await railwayRequest<{ serviceUpdate: { readonly id: string; readonly name: string } }>(
    `
    mutation serviceUpdate($id: String!, $input: ServiceUpdateInput!) {
      serviceUpdate(id: $id, input: $input) {
        id
        name
      }
    }
  `,
    { id: serviceId, input: { name } },
  );
  invalidateRailwayCache();
}

export function resolveEnvironment(
  project: RailwayProject,
  environmentName: string,
): { readonly id: string; readonly name: string } {
  assert.record(project, "railway project must be a record");
  assert.nonEmptyString(project.id, "railway project id must be non-empty");
  assert.nonEmptyString(environmentName, "environment name must be non-empty");
  const envs = nodes(project.environments);
  assert.array(envs, "railway environments must be an array");
  const match = envs.find((e) => {
    ha.nonEmptyString(e.name, "railway environment name must be non-empty");
    return e.name === environmentName;
  });
  if (!match) {
    throw new RailwayApiError(
      `Environment "${environmentName}" not found in project "${project.name}" (have: ${envs.map((e) => e.name).join(", ")})`,
    );
  }
  assert.nonEmptyString(match.id, "resolved environment id must be non-empty");
  assert.nonEmptyString(match.name, "resolved environment name must be non-empty");
  return match;
}

export function findServiceByName(
  project: RailwayProject,
  serviceName: string,
): { readonly id: string; readonly name: string } | undefined {
  assert.record(project, "railway project must be a record");
  assert.nonEmptyString(serviceName, "service name must be non-empty");
  const services = nodes(project.services);
  assert.array(services, "railway services must be an array");
  const match = services.find((s) => {
    ha.nonEmptyString(s.name, "railway service name must be non-empty");
    return s.name === serviceName;
  });
  if (match !== undefined) assert.nonEmptyString(match.id, "matched service id must be non-empty");
  return match;
}

export async function createServiceFromImage(input: {
  readonly projectId: string;
  readonly name: string;
  readonly image: string;
  readonly variables?: Record<string, string>;
}): Promise<{ readonly id: string; readonly name: string }> {
  assert.record(input, "service create input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.name, "service name must be non-empty");
  assert.nonEmptyString(input.image, "service image must be non-empty");
  if (input.variables !== undefined) assert.record(input.variables, "service variables must be a record");
  const data = await railwayRequest<{
    serviceCreate: { readonly id: string; readonly name: string };
  }>(
    `
    mutation serviceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
        name
      }
    }
  `,
    {
      input: {
        projectId: input.projectId,
        name: input.name,
        source: { image: input.image },
        variables: input.variables ?? {},
      },
    },
  );
  invalidateRailwayCache();
  assert.nonEmptyString(data.serviceCreate.id, "created service id must be non-empty");
  assert.nonEmptyString(data.serviceCreate.name, "created service name must be non-empty");
  return data.serviceCreate;
}

export async function ensureServiceFromImage(input: {
  readonly project: RailwayProject;
  readonly name: string;
  readonly image: string;
  readonly variables?: Record<string, string>;
}): Promise<{ readonly service: { readonly id: string; readonly name: string }; readonly created: boolean }> {
  assert.record(input, "ensure service input must be a record");
  assert.record(input.project, "railway project must be a record");
  assert.nonEmptyString(input.name, "service name must be non-empty");
  assert.nonEmptyString(input.image, "service image must be non-empty");
  const existing = findServiceByName(input.project, input.name);
  if (existing) {
    return { service: existing, created: false };
  }
  const service = await createServiceFromImage({
    projectId: input.project.id,
    name: input.name,
    image: input.image,
    variables: input.variables,
  });
  return { service, created: true };
}

export async function updateServiceInstance(input: {
  readonly serviceId: string;
  readonly environmentId: string;
  readonly healthcheckPath?: string | null;
  readonly sleepApplication?: boolean;
  readonly region?: string;
  readonly numReplicas?: number;
  readonly startCommand?: string | null;
  readonly registryCredentials?: { readonly username: string; readonly password: string };
}): Promise<void> {
  assert.record(input, "service instance input must be a record");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  if (input.region !== undefined) assert.nonEmptyString(input.region, "region must be non-empty");
  if (input.numReplicas !== undefined) assert.integer(input.numReplicas, "numReplicas must be an integer");
  const patch: Record<string, unknown> = {};
  if (input.healthcheckPath !== undefined) patch.healthcheckPath = input.healthcheckPath;
  if (input.sleepApplication != null) patch.sleepApplication = input.sleepApplication;
  if (input.region) patch.region = input.region;
  if (input.numReplicas != null) patch.numReplicas = input.numReplicas;
  if (input.startCommand !== undefined) patch.startCommand = input.startCommand;
  if (input.registryCredentials) patch.registryCredentials = input.registryCredentials;

  await railwayRequest<{ serviceInstanceUpdate: boolean }>(
    `
    mutation serviceInstanceUpdate(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `,
    {
      serviceId: input.serviceId,
      environmentId: input.environmentId,
      input: patch,
    },
  );
}

export async function connectServiceImage(serviceId: string, image: string): Promise<void> {
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  assert.nonEmptyString(image, "service image must be non-empty");
  await railwayRequest<{ serviceConnect: { readonly id: string } }>(
    `
    mutation serviceConnect($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) {
        id
      }
    }
  `,
    {
      id: serviceId,
      input: { image },
    },
  );
}

export async function upsertVariables(input: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId?: string;
  readonly variables: Record<string, string>;
  readonly replace?: boolean;
  readonly skipDeploys?: boolean;
}): Promise<void> {
  assert.record(input, "upsert variables input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  if (input.serviceId !== undefined) assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.record(input.variables, "variables must be a record");
  await railwayRequest<{ variableCollectionUpsert: boolean }>(
    `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `,
    {
      input: {
        projectId: input.projectId,
        environmentId: input.environmentId,
        serviceId: input.serviceId,
        variables: input.variables,
        replace: input.replace ?? false,
        skipDeploys: input.skipDeploys ?? true,
      },
    },
  );
}

export async function deployService(serviceId: string, environmentId: string): Promise<string> {
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  assert.nonEmptyString(environmentId, "environment id must be non-empty");
  const data = await railwayRequest<{ serviceInstanceDeployV2: string }>(
    `
    mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }
  `,
    { serviceId, environmentId },
  );
  assert.nonEmptyString(data.serviceInstanceDeployV2, "deploy must return a deployment id");
  return data.serviceInstanceDeployV2;
}

export async function redeployService(serviceId: string, environmentId: string): Promise<void> {
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  assert.nonEmptyString(environmentId, "environment id must be non-empty");
  await railwayRequest<{ serviceInstanceRedeploy: boolean }>(
    `
    mutation serviceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `,
    { serviceId, environmentId },
  );
}

const DOMAIN_STATUS_FIELDS = `
  verificationToken
  certificateStatus
  dnsRecords {
    hostlabel
    requiredValue
    currentValue
    status
    recordType
    fqdn
  }
`;

export async function createCustomDomain(input: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
  readonly domain: string;
  readonly targetPort?: number;
}): Promise<RailwayCustomDomain> {
  assert.record(input, "custom domain input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.domain, "domain must be non-empty");
  if (input.targetPort !== undefined) assert.integer(input.targetPort, "targetPort must be an integer");
  const data = await railwayRequest<{ customDomainCreate: RailwayCustomDomain }>(
    `
    mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        status {
          ${DOMAIN_STATUS_FIELDS}
        }
      }
    }
  `,
    { input },
  );
  assert.record(data.customDomainCreate, "created custom domain must be a record");
  assert.nonEmptyString(data.customDomainCreate.id, "created custom domain id must be non-empty");
  assert.nonEmptyString(data.customDomainCreate.domain, "created custom domain must be non-empty");
  return data.customDomainCreate;
}

export async function getCustomDomain(
  customDomainId: string,
  projectId: string,
): Promise<RailwayCustomDomain> {
  assert.nonEmptyString(customDomainId, "custom domain id must be non-empty");
  assert.nonEmptyString(projectId, "project id must be non-empty");
  const data = await railwayRequest<{ customDomain: RailwayCustomDomain }>(
    `
    query customDomain($id: String!, $projectId: String!) {
      customDomain(id: $id, projectId: $projectId) {
        id
        domain
        status {
          ${DOMAIN_STATUS_FIELDS}
        }
      }
    }
  `,
    { id: customDomainId, projectId },
  );
  return data.customDomain;
}

export async function listCustomDomains(input: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
}): Promise<readonly RailwayCustomDomain[]> {
  assert.record(input, "list custom domains input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  const data = await railwayRequest<{
    domains: { readonly customDomains: readonly RailwayCustomDomain[] };
  }>(
    `
    query domains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        customDomains {
          id
          domain
          status {
            ${DOMAIN_STATUS_FIELDS}
          }
        }
      }
    }
  `,
    input,
  );
  assert.record(data.domains, "domains payload must be a record");
  assert.array(data.domains.customDomains, "custom domains must be an array");
  return data.domains.customDomains;
}

export async function updateCustomDomainTargetPort(input: {
  readonly id: string;
  readonly environmentId: string;
  readonly targetPort: number;
}): Promise<void> {
  assert.record(input, "update target port input must be a record");
  assert.nonEmptyString(input.id, "custom domain id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.integer(input.targetPort, "targetPort must be an integer");
  await railwayRequest<{ customDomainUpdate: boolean }>(
    `
    mutation customDomainUpdate($id: String!, $environmentId: String!, $targetPort: Int) {
      customDomainUpdate(id: $id, environmentId: $environmentId, targetPort: $targetPort)
    }
  `,
    input,
  );
}

export async function deleteCustomDomain(id: string): Promise<void> {
  assert.nonEmptyString(id, "custom domain id must be non-empty");
  await railwayRequest<{ customDomainDelete: boolean }>(
    `
    mutation customDomainDelete($id: String!) {
      customDomainDelete(id: $id)
    }
  `,
    { id },
  );
  invalidateRailwayCache();
}

type CustomDomainLocation = RailwayCustomDomain & { readonly serviceId: string };

async function findCustomDomainInProject(input: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly domain: string;
  readonly services: readonly { readonly id: string }[];
}): Promise<CustomDomainLocation | undefined> {
  assert.record(input, "find custom domain input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.domain, "domain must be non-empty");
  assert.array(input.services, "services must be an array");
  for (const service of input.services) {
    ha.nonEmptyString(service.id, "service id must be non-empty");
    const domains = await listCustomDomains({
      projectId: input.projectId,
      environmentId: input.environmentId,
      serviceId: service.id,
    });
    const match = domains.find((d) => d.domain === input.domain);
    if (match) {
      return { ...match, serviceId: service.id };
    }
  }
  return undefined;
}

function isCustomDomainConflictError(err: unknown): boolean {
  if (!(err instanceof RailwayApiError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("failed to create custom domain") || msg.includes("already exists");
}

async function adoptCustomDomain(
  domain: RailwayCustomDomain,
  environmentId: string,
  targetPort?: number,
): Promise<RailwayCustomDomain> {
  assert.record(domain, "custom domain must be a record");
  assert.nonEmptyString(domain.id, "custom domain id must be non-empty");
  assert.nonEmptyString(environmentId, "environment id must be non-empty");
  if (targetPort !== undefined) assert.integer(targetPort, "targetPort must be an integer");
  if (targetPort != null) {
    await updateCustomDomainTargetPort({
      id: domain.id,
      environmentId,
      targetPort,
    });
  }
  return domain;
}

export async function ensureCustomDomain(input: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly serviceId: string;
  readonly domain: string;
  readonly targetPort?: number;
}): Promise<RailwayCustomDomain> {
  assert.record(input, "ensure custom domain input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.domain, "domain must be non-empty");
  const onService = await listCustomDomains(input);
  assert.array(onService, "custom domains must be an array");
  const local = onService.find((d) => d.domain === input.domain);
  if (local) return adoptCustomDomain(local, input.environmentId, input.targetPort);

  const project = await getProject(input.projectId);
  const services = nodes(project.services);
  const located = await findCustomDomainInProject({
    projectId: input.projectId,
    environmentId: input.environmentId,
    domain: input.domain,
    services,
  });

  if (located) {
    if (located.serviceId === input.serviceId) {
      return adoptCustomDomain(located, input.environmentId, input.targetPort);
    }
    await deleteCustomDomain(located.id);
  }

  try {
    return await createCustomDomain(input);
  } catch (err) {
    if (!isCustomDomainConflictError(err)) throw err;
    const retry = await findCustomDomainInProject({
      projectId: input.projectId,
      environmentId: input.environmentId,
      domain: input.domain,
      services,
    });
    if (!retry || retry.serviceId !== input.serviceId) throw err;
    return adoptCustomDomain(retry, input.environmentId, input.targetPort);
  }
}

export async function issueCustomDomainCertificate(customDomainId: string): Promise<void> {
  assert.nonEmptyString(customDomainId, "custom domain id must be non-empty");
  await railwayRequest<{ customDomainIssueCertificate: boolean }>(
    `
    mutation customDomainIssueCertificate($id: String!) {
      customDomainIssueCertificate(id: $id)
    }
  `,
    { id: customDomainId },
  );
}

export function isCustomDomainCertificateFailed(status: string | null | undefined): boolean {
  assert.ok(status === null || status === undefined || typeof status === "string", "certificate status must be a string or nullish");
  const normalized = status?.toUpperCase() ?? "";
  return normalized.includes("FAILED") || normalized.includes("ERROR");
}

export function isCustomDomainCertificateReady(status: string | null | undefined): boolean {
  assert.ok(status === null || status === undefined || typeof status === "string", "certificate status must be a string or nullish");
  const normalized = status?.toUpperCase() ?? "";
  return normalized === "CERTIFICATE_STATUS_TYPE_VALID" || normalized === "ISSUED";
}

export function railwayDnsRecords(
  domain: RailwayCustomDomain,
  zone: string,
): readonly RailwayDnsRecord[] {
  assert.record(domain, "custom domain must be a record");
  assert.nonEmptyString(domain.id, "custom domain id must be non-empty");
  assert.nonEmptyString(domain.domain, "custom domain must be non-empty");
  assert.record(domain.status, "custom domain status must be a record");
  assert.nonEmptyString(zone, "zone must be non-empty");
  const records: RailwayDnsRecord[] = [];
  const token = domain.status.verificationToken?.trim();

  for (const record of domain.status.dnsRecords ?? []) {
    ha.record(record, "railway dns record must be a record");
    const hostlabel = record.hostlabel?.trim() || "@";
    const requiredValue = record.requiredValue?.trim();
    if (!requiredValue) continue;

    const typeRaw = record.recordType?.toUpperCase() ?? "";
    const recordType: "CNAME" | "TXT" =
      typeRaw.includes("TXT") || requiredValue.startsWith("railway-verify=") ? "TXT" : "CNAME";

    const fqdn =
      record.fqdn?.trim() ||
      (hostlabel === "@" || hostlabel === domain.domain
        ? domain.domain
        : hostlabel.includes(".")
          ? hostlabel
          : `${hostlabel}.${zone}`);

    records.push({ hostlabel, requiredValue, recordType, fqdn });
  }

  if (token && !records.some((r) => r.recordType === "TXT")) {
    records.push({
      hostlabel: `_railway-verify.${domain.domain}`,
      requiredValue: token,
      recordType: "TXT",
      fqdn: `_railway-verify.${domain.domain}`,
    });
  }

  assert.array(records, "railway dns records must be an array");
  return records;
}

export async function createVolume(input: {
  readonly projectId: string;
  readonly serviceId: string;
  readonly environmentId: string;
  readonly mountPath: string;
  readonly region?: string;
}): Promise<{ readonly id: string; readonly name: string }> {
  assert.record(input, "create volume input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.mountPath, "mount path must be non-empty");
  const data = await railwayRequest<{ volumeCreate: { readonly id: string; readonly name: string } }>(
    `
    mutation volumeCreate($input: VolumeCreateInput!) {
      volumeCreate(input: $input) {
        id
        name
      }
    }
  `,
    {
      input: {
        projectId: input.projectId,
        serviceId: input.serviceId,
        environmentId: input.environmentId,
        mountPath: input.mountPath,
        region: input.region,
      },
    },
  );
  return data.volumeCreate;
}

export async function listVolumeMounts(input: {
  readonly projectId: string;
  readonly serviceId: string;
}): Promise<readonly { readonly id: string; readonly mountPath: string }[]> {
  assert.record(input, "list volume mounts input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  const data = await railwayRequest<{
    project: {
      volumes: Connection<{
        id: string;
        volumeInstances: Connection<{ id: string; mountPath: string; serviceId: string }>;
      }>;
    };
  }>(
    `
    query projectVolumeMounts($projectId: String!) {
      project(id: $projectId) {
        volumes {
          edges {
            node {
              id
              volumeInstances {
                edges {
                  node {
                    id
                    mountPath
                    serviceId
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
    { projectId: input.projectId },
  );

  const mounts: { readonly id: string; readonly mountPath: string }[] = [];
  for (const volume of nodes(data.project.volumes)) {
    ha.nonEmptyString(volume.id, "railway volume id must be non-empty");
    for (const instance of nodes(volume.volumeInstances)) {
      ha.nonEmptyString(instance.serviceId, "volume instance service id must be non-empty");
      ha.nonEmptyString(instance.mountPath, "volume instance mount path must be non-empty");
      if (instance.serviceId !== input.serviceId) continue;
      mounts.push({ id: instance.id, mountPath: instance.mountPath });
    }
  }
  assert.array(mounts, "volume mounts must be an array");
  return mounts;
}

/** @deprecated Use listVolumeMounts */
export async function listVolumes(input: {
  readonly projectId: string;
  readonly serviceId: string;
}): Promise<readonly { readonly id: string; readonly name: string; readonly mountPath?: string }[]> {
  assert.record(input, "list volumes input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  const mounts = await listVolumeMounts(input);
  assert.array(mounts, "volume mounts must be an array");
  return mounts.map((mount) => ({ id: mount.id, name: mount.mountPath, mountPath: mount.mountPath }));
}

export async function ensureVolume(input: {
  readonly projectId: string;
  readonly serviceId: string;
  readonly environmentId: string;
  readonly mountPath: string;
  readonly name: string;
  readonly region?: string;
}): Promise<void> {
  assert.record(input, "ensure volume input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  assert.nonEmptyString(input.mountPath, "mount path must be non-empty");
  assert.nonEmptyString(input.name, "volume name must be non-empty");
  const existing = await listVolumeMounts({
    projectId: input.projectId,
    serviceId: input.serviceId,
  });
  if (existing.some((v) => v.mountPath === input.mountPath)) {
    return;
  }
  await createVolume(input);
}

export async function resolveProjectContext(
  projectName: string,
  environmentName: string,
): Promise<CachedProjectContext> {
  assert.nonEmptyString(projectName, "project name must be non-empty");
  assert.nonEmptyString(environmentName, "environment name must be non-empty");
  const cacheKey = `${projectName}:${environmentName}`;
  const cached = projectContextCache.get(cacheKey);
  if (cached) return cached;

  const project = await ensureProject(projectName);
  const environment = resolveEnvironment(project, environmentName);
  const ctx: CachedProjectContext = {
    project,
    projectId: project.id,
    environmentId: environment.id,
  };
  assert.nonEmptyString(ctx.projectId, "resolved project id must be non-empty");
  assert.nonEmptyString(ctx.environmentId, "resolved environment id must be non-empty");
  projectContextCache.set(cacheKey, ctx);
  return ctx;
}

export type RailwayDeployment = {
  readonly id: string;
  readonly status: string;
  readonly createdAt: string;
};

type DeploymentsPage = {
  readonly deployments: {
    readonly edges: readonly Edge<RailwayDeployment>[];
    readonly pageInfo: {
      readonly hasNextPage: boolean;
      readonly endCursor: string | null;
    };
  };
};

export async function listDeployments(input: {
  readonly projectId: string;
  readonly serviceId: string;
  readonly environmentId: string;
  readonly pageSize?: number;
}): Promise<readonly RailwayDeployment[]> {
  assert.record(input, "list deployments input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  if (input.pageSize !== undefined) assert.integer(input.pageSize, "pageSize must be an integer");
  const pageSize = input.pageSize ?? 50;
  assert.ok(pageSize > 0, "pageSize must be positive", { pageSize });
  const deployments: RailwayDeployment[] = [];
  let after: string | undefined;

  for (;;) {
    const data: DeploymentsPage = await railwayRequest<DeploymentsPage>(
      `
      query deployments($input: DeploymentListInput!, $first: Int, $after: String) {
        deployments(input: $input, first: $first, after: $after) {
          edges {
            node {
              id
              status
              createdAt
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
      {
        input: {
          projectId: input.projectId,
          serviceId: input.serviceId,
          environmentId: input.environmentId,
        },
        first: pageSize,
        after,
      },
    );

    for (const edge of data.deployments.edges) {
      ha.nonEmptyString(edge.node.id, "deployment id must be non-empty");
      ha.nonEmptyString(edge.node.status, "deployment status must be non-empty");
      deployments.push(edge.node);
    }

    const { hasNextPage, endCursor } = data.deployments.pageInfo;
    ha.ok(typeof hasNextPage === "boolean", "deployments hasNextPage must be a boolean");
    if (!hasNextPage || !endCursor) {
      break;
    }
    after = endCursor;
  }

  assert.array(deployments, "deployments must be an array");
  return deployments;
}

export async function removeDeployment(deploymentId: string): Promise<void> {
  assert.nonEmptyString(deploymentId, "deployment id must be non-empty");
  await railwayRequest<{ deploymentRemove: boolean }>(
    `
    mutation deploymentRemove($id: String!) {
      deploymentRemove(id: $id)
    }
  `,
    { id: deploymentId },
  );
}

export async function waitForDeployment(
  deploymentId: string,
  timeoutMs = 600_000,
): Promise<void> {
  assert.nonEmptyString(deploymentId, "deployment id must be non-empty");
  assert.number(timeoutMs, "timeoutMs must be a number");
  assert.ok(timeoutMs > 0, "timeoutMs must be positive", { timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await railwayRequest<{
      deployment: { readonly status: string } | null;
    }>(
      `
      query deployment($id: String!) {
        deployment(id: $id) {
          status
        }
      }
    `,
      { id: deploymentId },
    );
    const status = data.deployment?.status?.toUpperCase() ?? "";
    ha.string(status, "deployment status must be a string");
    if (status === "SUCCESS") return;
    if (status === "FAILED" || status === "CRASHED" || status === "REMOVED" || status === "CANCELLED") {
      const details = await deploymentFailureDetails(deploymentId);
      throw new RailwayApiError(
        `Deployment ${deploymentId} ended with status ${status}${details ? `\n${details}` : ""}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new RailwayApiError(`Deployment ${deploymentId} did not succeed within ${timeoutMs / 1000}s`);
}

export async function latestDeploymentId(input: {
  readonly projectId: string;
  readonly serviceId: string;
  readonly environmentId: string;
}): Promise<string | undefined> {
  assert.record(input, "latest deployment input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  const deployments = await listDeployments(input);
  assert.array(deployments, "deployments must be an array");
  const newest = deployments
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const id = newest?.id;
  assert.ok(id === undefined || id.length > 0, "latest deployment id must be undefined or non-empty");
  return id;
}

/**
 * Wait for the newest deployment of a service to reach SUCCESS.
 *
 * `connectServiceImage` triggers a new deployment, but the new deployment may
 * not appear in the list for a few seconds. Capture `afterDeploymentId` from
 * BEFORE connecting (or pass the id you want to exclude) so we only wait for a
 * genuinely new deployment rather than a previously-completed one.
 */
export async function waitForLatestDeploymentSuccess(
  input: {
    readonly projectId: string;
    readonly serviceId: string;
    readonly environmentId: string;
  },
  opts?: { readonly afterDeploymentId?: string; readonly timeoutMs?: number },
): Promise<void> {
  assert.record(input, "wait input must be a record");
  assert.nonEmptyString(input.projectId, "project id must be non-empty");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  const timeoutMs = opts?.timeoutMs ?? 600_000;
  assert.number(timeoutMs, "timeoutMs must be a number");
  assert.ok(timeoutMs > 0, "timeoutMs must be positive", { timeoutMs });
  const afterDeploymentId = opts?.afterDeploymentId;
  if (afterDeploymentId !== undefined) assert.nonEmptyString(afterDeploymentId, "afterDeploymentId must be non-empty");
  const deadline = Date.now() + timeoutMs;
  let deploymentId: string | undefined;

  while (Date.now() < deadline) {
    const deployments = await listDeployments(input);
    const newest = deployments
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    if (newest) ha.nonEmptyString(newest.id, "newest deployment id must be non-empty");
    if (newest && newest.id !== afterDeploymentId) {
      deploymentId = newest.id;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  if (!deploymentId) {
    throw new RailwayApiError(
      `No new deployment appeared for service within ${timeoutMs / 1000}s`,
    );
  }
  assert.nonEmptyString(deploymentId, "deployment id must be non-empty after friendly check");

  await waitForDeployment(deploymentId, timeoutMs);
}

async function deploymentFailureDetails(deploymentId: string): Promise<string> {
  assert.nonEmptyString(deploymentId, "deployment id must be non-empty");
  try {
    const data = await railwayRequest<{
      deployment: {
        readonly diagnosis?: unknown;
        readonly meta?: unknown;
      } | null;
      deploymentLogs: readonly {
        readonly timestamp: string;
        readonly severity?: string | null;
        readonly message: string;
      }[];
      buildLogs: readonly {
        readonly timestamp: string;
        readonly severity?: string | null;
        readonly message: string;
      }[];
    }>(
      `
      query deploymentFailureDetails($id: String!) {
        deployment(id: $id) {
          diagnosis
          meta
        }
        deploymentLogs(deploymentId: $id, limit: 40) {
          timestamp
          severity
          message
        }
        buildLogs(deploymentId: $id, limit: 20) {
          timestamp
          severity
          message
        }
      }
    `,
      { id: deploymentId },
    );

    const lines: string[] = [];
    if (data.deployment?.diagnosis) {
      lines.push(`Diagnosis: ${JSON.stringify(data.deployment.diagnosis)}`);
    }
    if (data.deployment?.meta) {
      lines.push(`Meta: ${JSON.stringify(data.deployment.meta).slice(0, 1_000)}`);
    }
    const deploymentLogs = [
      ...data.deploymentLogs.slice(0, 10),
      ...data.deploymentLogs.slice(-30),
    ];
    assert.array(deploymentLogs, "deployment logs must be an array");
    if (deploymentLogs.length > 0) {
      lines.push("Deployment logs:");
      for (const log of deploymentLogs) {
        ha.nonEmptyString(log.timestamp, "log timestamp must be non-empty");
        ha.string(log.message, "log message must be a string");
        lines.push(`  ${log.timestamp} ${log.severity ?? ""} ${log.message}`.trimEnd());
      }
    }
    const buildLogs = data.buildLogs.slice(-10);
    assert.array(buildLogs, "build logs must be an array");
    if (buildLogs.length > 0) {
      lines.push("Build logs:");
      for (const log of buildLogs) {
        ha.nonEmptyString(log.timestamp, "build log timestamp must be non-empty");
        ha.string(log.message, "build log message must be a string");
        lines.push(`  ${log.timestamp} ${log.severity ?? ""} ${log.message}`.trimEnd());
      }
    }
    assert.array(lines, "failure detail lines must be an array");
    return lines.join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to fetch Railway deployment diagnostics: ${msg}`;
  }
}

export async function deleteService(serviceId: string): Promise<void> {
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  await railwayRequest<{ serviceDelete: boolean }>(
    `
    mutation serviceDelete($id: String!) {
      serviceDelete(id: $id)
    }
  `,
    { id: serviceId },
  );
  invalidateRailwayCache();
}

export async function deleteProject(projectId: string): Promise<void> {
  assert.nonEmptyString(projectId, "project id must be non-empty");
  await railwayRequest<{ projectDelete: boolean }>(
    `
    mutation projectDelete($id: String!) {
      projectDelete(id: $id)
    }
  `,
    { id: projectId },
  );
  invalidateRailwayCache();
}
