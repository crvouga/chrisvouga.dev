# chrisvouga.dev

## Clone sibling projects

All project repos live in `projects/` (gitignored):

```bash
npm run clone-projects
```

## AWS infrastructure

CDK stacks for ECR, App Runner, and GitHub OIDC live in `aws/`. See [`aws/README.md`](aws/README.md).

Service definitions (ports, ECR names, domains, secrets): [`infrastructure/projects.ts`](infrastructure/projects.ts).
