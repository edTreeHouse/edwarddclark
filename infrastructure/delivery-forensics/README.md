# EdwardDClark.com delivery forensics

This directory owns the privacy-preserving CloudFront delivery-forensics stack for EdwardDClark.com.

## Privacy boundary

The CloudFront real-time log configuration intentionally excludes `c-ip`, `x-forwarded-for`, and `cs-cookie`. The transient Kinesis stream is retained for 24 hours. Only sanitized 4xx/5xx diagnostics are persisted to CloudWatch Logs, with a 7-day retention period. Synthetic availability checks run every 15 minutes.

## Repository boundary

EdwardDClark.com delivery-forensics infrastructure is owned and deployed from `edTreeHouse/edwarddclark`. The CSI website repository is not part of the steady-state deployment path. Repository ownership is considered complete only after the bootstrap trust handoff and a successful EdwardDClark-owned stack deployment.

The dedicated deployment identity is:

`arn:aws:iam::049234776386:role/edwarddclark-delivery-forensics-deployer`

The role is defined in `bootstrap-deployer-role.yaml` and trusts only GitHub OIDC sessions from the lowercase `production` environment of `edTreeHouse/edwarddclark`, using the repository's immutable GitHub identity.

## AWS-admin bootstrap / trust handoff

The bootstrap stack already exists. When repository ownership changes, update it from an AWS CLI session authorized to manage IAM roles:

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name edwarddclark-delivery-forensics-bootstrap \
  --template-file infrastructure/delivery-forensics/bootstrap-deployer-role.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset
```

Verify the role:

```bash
aws cloudformation describe-stacks \
  --region us-east-1 \
  --stack-name edwarddclark-delivery-forensics-bootstrap \
  --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue | [0]" \
  --output text
```

Expected output:

`arn:aws:iam::049234776386:role/edwarddclark-delivery-forensics-deployer`

## Production deployment

Run the GitHub Actions workflow **Deploy delivery forensics stack**. It assumes the dedicated OIDC role, deploys `template.yaml` as stack `edwarddclark-delivery-forensics-production`, and verifies the privacy boundary and 24-hour Kinesis retention.

The separate workflow **Deploy delivery forensics attachment** reads the stack output and attaches the verified real-time log configuration to the EdwardDClark.com CloudFront distribution, then verifies the attachment and smoke-tests canonical pages.
