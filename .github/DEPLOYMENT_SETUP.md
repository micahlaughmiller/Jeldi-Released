# GitHub Actions Deployment Setup

This guide explains how to configure automatic deployments to AWS Lambda (overlay.jeldi.app and demo.jeldi.app) when you push code to the main branch.

## Required GitHub Secrets

Navigate to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

### AWS Credentials
- **AWS_ACCESS_KEY_ID**: Your AWS access key ID
- **AWS_SECRET_ACCESS_KEY**: Your AWS secret access key

### Application Secrets
- **JWT_SECRET**: JWT signing secret (64+ characters)
- **DATABASE_URL**: PostgreSQL connection string
- **OPENAI_API_KEY**: OpenAI API key for AI features

## How to Get AWS Credentials

### Option 1: IAM User with Least-Privilege Policy (Recommended)

1. **Go to AWS IAM Console**: https://console.aws.amazon.com/iam/
2. **Create new IAM user**:
   - User name: `github-actions-deploy`
   - Access type: Programmatic access
3. **Create custom policy** with least-privilege permissions:
   - Go to Policies → Create Policy → JSON
   - Paste the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:PublishVersion",
        "lambda:CreateAlias",
        "lambda:UpdateAlias",
        "lambda:AddPermission",
        "lambda:RemovePermission"
      ],
      "Resource": "arn:aws:lambda:us-east-2:*:function:jeldi-backend-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:GetRole",
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::*:role/jeldi-backend-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:ListStackResources",
        "cloudformation:GetTemplateSummary"
      ],
      "Resource": "arn:aws:cloudformation:us-east-2:*:stack/jeldi-backend-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "apigateway:GET",
        "apigateway:POST",
        "apigateway:PUT",
        "apigateway:PATCH",
        "apigateway:DELETE"
      ],
      "Resource": "arn:aws:apigateway:us-east-2::/restapis*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::jeldi-backend-*",
        "arn:aws:s3:::jeldi-backend-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:us-east-2:*:log-group:/aws/lambda/jeldi-backend-*"
    }
  ]
}
```

4. **Name the policy**: `GitHubActionsServerlessDeployPolicy`
5. **Attach policy to user**: Attach the custom policy to `github-actions-deploy` user
6. **Save credentials**:
   - Access Key ID → Add to GitHub as `AWS_ACCESS_KEY_ID`
   - Secret Access Key → Add to GitHub as `AWS_SECRET_ACCESS_KEY`

### Option 2: GitHub OIDC with IAM Role (Most Secure)

Instead of long-lived credentials, use GitHub's OIDC provider:

1. **Create IAM OIDC Provider** in AWS for GitHub
2. **Create IAM Role** with the least-privilege policy above
3. **Configure trust relationship** to allow GitHub Actions
4. **Update workflow** to use `aws-actions/configure-aws-credentials` with role ARN

See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services

## How It Works

1. **Push to main branch** → Workflow triggers automatically
2. **Build** → Compiles TypeScript and bundles React app
3. **Deploy** → Pushes to AWS Lambda using Serverless Framework
4. **Live** → Changes are now live on overlay.jeldi.app and demo.jeldi.app

## Manual Trigger

You can also manually trigger deployment:
- Go to Actions tab → Deploy to AWS Lambda → Run workflow

## Verify Deployment

After deployment completes:
- Check https://overlay.jeldi.app/health
- Check https://demo.jeldi.app/health
- Both should return `{"status":"healthy"}`

## Troubleshooting

### Deployment fails with AWS credentials error
- Verify AWS credentials are correct in GitHub secrets
- Ensure IAM user has required permissions

### Build fails
- Check package.json scripts include `build` command
- Ensure all dependencies are in package.json (not just devDependencies)

### Serverless deployment fails
- Verify serverless.yml is in repository root
- Check AWS region matches your setup (currently us-east-2)
