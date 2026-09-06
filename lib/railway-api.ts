import { requireRailwayToken } from "./railway-token.js";

const RAILWAY_GRAPHQL_URL = "https://backboard.railway.com/graphql/v2";

export type RailwayGraphQLError = {
  readonly message: string;
  readonly path?: readonly (string | number)[];
};

export class RailwayApiError extends Error {
  readonly errors: readonly RailwayGraphQLError[];

  constructor(message: string, errors: readonly RailwayGraphQLError[] = []) {
    super(message);
    this.name = "RailwayApiError";
    this.errors = errors;
  }
}

export class RailwayRateLimitError extends RailwayApiError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number, errors: readonly RailwayGraphQLError[] = []) {
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
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
}

/** Clear process-local Railway read caches (called after mutations). */
export function invalidateRailwayCache(): void {
  listProjectsCache = null;
  projectCache.clear();
  projectContextCache.clear();
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
  const logEveryMs = options?.logEveryMs ?? 30_000;
  let remaining = error.retryAfterMs;
  while (remaining > 0) {
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
  const token = requireRailwayToken();
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await paceRailwayRequest();

    const response = await fetch(RAILWAY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = await response.text();
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

    if (!response.ok) {
      if (shouldRetryRailwayRequest(response.status) && attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, railwayRetryDelayMs(response, body, attempt)),
        );
        continue;
      }
      const detail =
        payload.errors?.map((e) => e.message).join("; ") ||
        body.slice(0, 500);
      throwRailwayHttpError(response.status, detail, response, body, payload.errors ?? []);
    }

    if (payload.errors?.length) {
      throw new RailwayApiError(
        payload.errors.map((e) => e.message).join("; "),
        payload.errors,
      );
    }
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
  return listProjectsCache;
}

export async function getProject(projectId: string): Promise<RailwayProject> {
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
  projectCache.set(projectId, data.project);
  return data.project;
}

export async function findProjectByName(name: string): Promise<RailwayProject | undefined> {
  const projects = await listProjects();
  const match = projects.find((p) => p.name === name);
  if (!match) return undefined;
  return getProject(match.id);
}

export async function createProject(name: string): Promise<RailwayProject> {
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
  invalidateRailwayCache();
  return getProject(data.projectCreate.id);
}

export async function ensureProject(name: string): Promise<RailwayProject> {
  const existing = await findProjectByName(name);
  if (existing) return existing;
  return createProject(name);
}

export async function updateProjectName(projectId: string, name: string): Promise<void> {
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
  const envs = nodes(project.environments);
  const match = envs.find((e) => e.name === environmentName);
  if (!match) {
    throw new RailwayApiError(
      `Environment "${environmentName}" not found in project "${project.name}" (have: ${envs.map((e) => e.name).join(", ")})`,
    );
  }
  return match;
}

export function findServiceByName(
  project: RailwayProject,
  serviceName: string,
): { readonly id: string; readonly name: string } | undefined {
  return nodes(project.services).find((s) => s.name === serviceName);
}

export async function createServiceFromImage(input: {
  readonly projectId: string;
  readonly name: string;
  readonly image: string;
  readonly variables?: Record<string, string>;
}): Promise<{ readonly id: string; readonly name: string }> {
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
  return data.serviceCreate;
}

export async function ensureServiceFromImage(input: {
  readonly project: RailwayProject;
  readonly name: string;
  readonly image: string;
  readonly variables?: Record<string, string>;
}): Promise<{ readonly service: { readonly id: string; readonly name: string }; readonly created: boolean }> {
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
  const data = await railwayRequest<{ serviceInstanceDeployV2: string }>(
    `
    mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!) {
      serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
    }
  `,
    { serviceId, environmentId },
  );
  return data.serviceInstanceDeployV2;
}

export async function redeployService(serviceId: string, environmentId: string): Promise<void> {
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
  return data.customDomainCreate;
}

export async function getCustomDomain(
  customDomainId: string,
  projectId: string,
): Promise<RailwayCustomDomain> {
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
  return data.domains.customDomains;
}

export async function updateCustomDomainTargetPort(input: {
  readonly id: string;
  readonly environmentId: string;
  readonly targetPort: number;
}): Promise<void> {
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
  for (const service of input.services) {
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
  const onService = await listCustomDomains(input);
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
  const normalized = status?.toUpperCase() ?? "";
  return normalized.includes("FAILED") || normalized.includes("ERROR");
}

export function isCustomDomainCertificateReady(status: string | null | undefined): boolean {
  const normalized = status?.toUpperCase() ?? "";
  return normalized === "CERTIFICATE_STATUS_TYPE_VALID" || normalized === "ISSUED";
}

export function railwayDnsRecords(
  domain: RailwayCustomDomain,
  zone: string,
): readonly RailwayDnsRecord[] {
  const records: RailwayDnsRecord[] = [];
  const token = domain.status.verificationToken?.trim();

  for (const record of domain.status.dnsRecords ?? []) {
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

  return records;
}

export async function createVolume(input: {
  readonly projectId: string;
  readonly serviceId: string;
  readonly environmentId: string;
  readonly mountPath: string;
  readonly region?: string;
}): Promise<{ readonly id: string; readonly name: string }> {
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
    for (const instance of nodes(volume.volumeInstances)) {
      if (instance.serviceId !== input.serviceId) continue;
      mounts.push({ id: instance.id, mountPath: instance.mountPath });
    }
  }
  return mounts;
}

/** @deprecated Use listVolumeMounts */
export async function listVolumes(input: {
  readonly projectId: string;
  readonly serviceId: string;
}): Promise<readonly { readonly id: string; readonly name: string; readonly mountPath?: string }[]> {
  const mounts = await listVolumeMounts(input);
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
  const pageSize = input.pageSize ?? 50;
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
      deployments.push(edge.node);
    }

    const { hasNextPage, endCursor } = data.deployments.pageInfo;
    if (!hasNextPage || !endCursor) {
      break;
    }
    after = endCursor;
  }

  return deployments;
}

export async function removeDeployment(deploymentId: string): Promise<void> {
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
  const deployments = await listDeployments(input);
  const newest = deployments
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return newest?.id;
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
  const timeoutMs = opts?.timeoutMs ?? 600_000;
  const afterDeploymentId = opts?.afterDeploymentId;
  const deadline = Date.now() + timeoutMs;
  let deploymentId: string | undefined;

  while (Date.now() < deadline) {
    const deployments = await listDeployments(input);
    const newest = deployments
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
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

  await waitForDeployment(deploymentId, timeoutMs);
}

async function deploymentFailureDetails(deploymentId: string): Promise<string> {
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
    if (deploymentLogs.length > 0) {
      lines.push("Deployment logs:");
      for (const log of deploymentLogs) {
        lines.push(`  ${log.timestamp} ${log.severity ?? ""} ${log.message}`.trimEnd());
      }
    }
    const buildLogs = data.buildLogs.slice(-10);
    if (buildLogs.length > 0) {
      lines.push("Build logs:");
      for (const log of buildLogs) {
        lines.push(`  ${log.timestamp} ${log.severity ?? ""} ${log.message}`.trimEnd());
      }
    }
    return lines.join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to fetch Railway deployment diagnostics: ${msg}`;
  }
}

export async function deleteService(serviceId: string): Promise<void> {
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
