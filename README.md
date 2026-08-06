# EdwardDClark.com

Official website for **Edward D. Clark**.

## Purpose

This repository is the canonical source for the Edward D. Clark personal website and its AWS infrastructure.

## Platform direction

The long-term information architecture and visual standards are documented here:

- [Platform architecture](docs/PLATFORM_ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)

These documents define the roles of EdwardDClark.com, CollectiveStateInference.org, and Vibe Village; the planned site map; content ownership boundaries; reusable interface patterns; portrait treatment; typography; accessibility; and implementation phases.

## Architecture

- Amazon Route 53 for DNS
- AWS Certificate Manager for TLS
- Amazon CloudFront for global delivery and HTTPS
- Private Amazon S3 origin protected by CloudFront Origin Access Control
- AWS CloudFormation for infrastructure as code
- GitHub Actions with AWS OIDC for deployment

## Repository structure

```text
.github/workflows/   Deployment automation
docs/                Platform architecture and design standards
infrastructure/      CloudFormation templates
website/             Static site source
```

## Initial AWS setup

### 1. Confirm the Route 53 hosted zone

A hosted zone may have been created automatically when `edwarddclark.com` was registered. Check:

```bash
aws route53 list-hosted-zones-by-name \
  --dns-name edwarddclark.com \
  --query "HostedZones[?Name=='edwarddclark.com.'].[Id,Name]" \
  --output table
```

If none exists, create one:

```bash
aws route53 create-hosted-zone \
  --name edwarddclark.com \
  --caller-reference "edwarddclark-$(date +%s)"
```

When Route 53 is also the registrar, verify that the registered domain uses the four name servers assigned to the hosted zone before deployment.

### 2. Configure GitHub OIDC

Create a GitHub environment named `production` and set this repository variable:

```text
AWS_DEPLOY_ROLE_ARN
```

The AWS role must trust GitHub's OIDC provider and allow this repository to deploy the CloudFormation stack and publish the website.

At minimum, the deployment role needs access to:

- CloudFormation
- S3
- CloudFront
- ACM
- Route 53
- IAM read/pass actions required by the stack, if applicable

### 3. Deploy

Run the **Deploy website** workflow manually the first time and provide the hosted zone ID. Subsequent merges to `main` deploy automatically when GitHub Actions is available.

The CloudFormation stack is named:

```text
edwarddclark-website
```

## Canonical domains

- `https://edwarddclark.com`
- `https://www.edwarddclark.com` permanently redirects to the apex domain
