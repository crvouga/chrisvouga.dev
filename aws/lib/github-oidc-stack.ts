import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export type GithubOidcStackProps = cdk.StackProps & {
  readonly githubOrg: string;
  readonly githubRepo: string;
};

export class GithubOidcStack extends cdk.Stack {
  public readonly githubActionsRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GithubActionsOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    this.githubActionsRole = new iam.Role(this, "GitHubActionsRole", {
      roleName: "GitHubActionsRole",
      description: "GitHub Actions OIDC — ECR push for chrisvouga.dev pipelines",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${props.githubOrg}/${props.githubRepo}:*`,
        },
      }),
    });
    this.githubActionsRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryPowerUser"),
    );

    new cdk.CfnOutput(this, "GithubActionsRoleArn", {
      value: this.githubActionsRole.roleArn,
    });
  }
}
