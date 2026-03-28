#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AppRunnerStack } from "../lib/app-runner-stack.js";
import { EcrStack } from "../lib/ecr-stack.js";
import { GithubOidcStack } from "../lib/github-oidc-stack.js";

const app = new cdk.App();

const account = app.node.tryGetContext("account") ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext("region") ?? process.env.CDK_DEFAULT_REGION;

if (!account || !region) {
  throw new Error(
    "Set context.account / context.region in cdk.json, or export CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION.",
  );
}

const env: cdk.Environment = { account, region };
const githubOrg = (app.node.tryGetContext("githubOrg") as string | undefined) ?? "crvouga";
const githubRepo = (app.node.tryGetContext("githubRepo") as string | undefined) ?? "chrisvouga.dev";

new GithubOidcStack(app, "GithubOidcStack", { env, githubOrg, githubRepo });

const ecrStack = new EcrStack(app, "EcrStack", { env });

const appRunnerStack = new AppRunnerStack(app, "AppRunnerStack", { env, ecr: ecrStack.repositories });
appRunnerStack.addDependency(ecrStack);
