# AWS CDK — chrisvouga.dev

Part of the same repository. All stacks import from [`../infrastructure/projects.ts`](../infrastructure/projects.ts).

## Stacks

1. **GithubOidcStack** — GitHub OIDC provider + `GitHubActionsRole` (ECR push).
2. **EcrStack** — One ECR repository per service image.
3. **AppRunnerStack** — App Runner services pulling `:latest` from ECR. All per-service configuration (including env vars that used to be hardcoded) is stored in SSM Parameter Store and injected as `runtimeEnvironmentSecrets`.

## Prerequisites

- AWS CLI + CDK CLI bootstrapped in the target account/region.
- GitHub repository variables: `AWS_ACCOUNT_ID`, `AWS_REGION`.

## Configure

```bash
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=us-east-1
```

Or set in `cdk.json` context:

```json
{
  "context": {
    "account": "123456789012",
    "region": "us-east-1"
  }
}
```

## SSM secrets

Every entry in `project.secrets` maps to an SSM **SecureString** parameter at:

```
/chrisvouga/{project.id}/{SECRET_NAME}
```

Create them before deploying:

```bash
aws ssm put-parameter \
  --name /chrisvouga/pickflix/TMDB_API_READ_ACCESS_TOKEN \
  --type SecureString \
  --value "your-token"
```

## Deploy

```bash
cd aws
npm ci
npx cdk deploy --all
```

## DNS

Stack outputs include `DomainDnsTarget-*` values. Point your DNS provider CNAME records at these targets. Use `aws apprunner describe-custom-domains` if ACM validation records are needed.
