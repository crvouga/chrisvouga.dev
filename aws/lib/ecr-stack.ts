import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { DEPLOY_PROJECTS } from "../../infrastructure/projects.js";

export class EcrStack extends cdk.Stack {
  public readonly repositories: Readonly<Record<string, ecr.Repository>>;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repos: Record<string, ecr.Repository> = {};
    const seen = new Set<string>();

    for (const p of DEPLOY_PROJECTS) {
      if (seen.has(p.ecrRepositoryName)) continue;
      seen.add(p.ecrRepositoryName);

      const repo = new ecr.Repository(this, `Ecr-${safeCfnId(p.ecrRepositoryName)}`, {
        repositoryName: p.ecrRepositoryName,
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.MUTABLE,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      repo.addLifecycleRule({
        description: "Keep last 5 images",
        maxImageCount: 5,
        rulePriority: 1,
      });
      repos[p.ecrRepositoryName] = repo;
    }

    this.repositories = repos;
  }
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}
