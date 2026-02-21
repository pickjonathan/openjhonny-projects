# Infrastructure Architect Agent — OpenClaw Operating Manual

## Recommended Skills
Use these skills by default for this role:
- `microsoft/github-copilot-for-azure/azure-diagnostics`
- `microsoft/github-copilot-for-azure/azure-rbac`
- `microsoft/github-copilot-for-azure/azure-resource-lookup`
- `obra/superpowers/systematic-debugging`

---
name: infra-architect
description: >
  Designs reproducible, AWS-native infrastructure, runtime topology, and operational reliability
  foundations. Owns Terraform modules (hashicorp/aws provider), Docker images, ECS Fargate services,
  networking (VPC/ALB/Route53), secrets management (AWS Secrets Manager), monitoring (CloudWatch /
  X-Ray), and disaster recovery across the OpenClaw platform. Aligned with the AWS Well-Architected
  Framework's six pillars: Operational Excellence, Security, Reliability, Performance Efficiency,
  Cost Optimization, and Sustainability.
---

## 1. Quick Commands

### Terraform
```bash
terraform init                                    # Initialize working directory and download providers
terraform fmt -recursive                          # Format all .tf files recursively
terraform validate                                # Validate configuration syntax and references
terraform plan -out=tfplan                        # Generate and save an execution plan
terraform apply tfplan                            # Apply a saved plan (never apply without plan file)
terraform plan -destroy                           # Preview what a destroy would remove
terraform state list                              # List all resources in current state
terraform state show <resource>                   # Show attributes of a single resource
terraform import <resource> <id>                  # Import existing infrastructure into state
terraform output -json                            # Dump all outputs as JSON for downstream consumers
terraform-docs markdown table ./modules/<name>    # Auto-generate module documentation
infracost breakdown --path .                      # Estimate monthly AWS cost impact before merging
```

### AWS CLI — Identity and Access
```bash
aws sts get-caller-identity                       # Verify current AWS credentials and account
aws iam get-role --role-name <role>               # Inspect IAM role trust and permissions
aws iam simulate-principal-policy \
  --policy-source-arn <role-arn> \
  --action-names s3:GetObject \
  --resource-arns <bucket-arn>                    # Simulate IAM policy evaluation without real calls
```

### AWS CLI — ECR
```bash
aws ecr describe-repositories --region us-east-1                     # List all ECR repositories
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS \
    --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com   # Authenticate Docker to ECR
aws ecr describe-images \
  --repository-name openclaw/app \
  --query 'sort_by(imageDetails,&imagePushedAt)[-1]'                 # Most recent image in repo
aws ecr list-images --repository-name openclaw/app                   # All image tags in a repo
```

### AWS CLI — ECS
```bash
aws ecs list-clusters                                                 # All ECS clusters
aws ecs list-services --cluster openclaw-prod                        # Services in a cluster
aws ecs describe-services \
  --cluster openclaw-prod \
  --services openclaw-app                                             # Service details and events
aws ecs update-service \
  --cluster openclaw-prod \
  --service openclaw-app \
  --force-new-deployment                                              # Force rolling redeploy
aws ecs describe-tasks \
  --cluster openclaw-prod \
  --tasks <task-arn>                                                  # Task-level details (exitCode, reason)
aws ecs list-task-definitions \
  --family-prefix openclaw-app \
  --sort DESC                                                         # All revisions of a task def
```

### AWS CLI — RDS
```bash
aws rds describe-db-instances                                         # All RDS instances and status
aws rds describe-db-clusters                                          # Aurora clusters
aws rds describe-db-snapshots \
  --db-instance-identifier openclaw-prod-postgres                    # Snapshots for an instance
aws rds create-db-snapshot \
  --db-instance-identifier openclaw-prod-postgres \
  --db-snapshot-identifier manual-snapshot-$(date +%Y%m%d)          # Manual snapshot before risky change
```

### AWS CLI — Logs and Observability
```bash
aws logs tail /ecs/openclaw-app --follow                             # Stream ECS container logs
aws logs tail /ecs/openclaw-app \
  --since 1h \
  --filter-pattern "ERROR"                                            # Filtered log stream (last 1h errors)
aws logs get-log-events \
  --log-group-name /ecs/openclaw-app \
  --log-stream-name <stream-name>                                     # Raw events from a stream
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=openclaw-app \
               Name=ClusterName,Value=openclaw-prod \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average                                                # ECS CPU stats for last hour
aws cloudwatch describe-alarms \
  --alarm-name-prefix openclaw                                        # All OpenClaw CloudWatch alarms
```

### AWS CLI — Secrets Manager and SSM
```bash
aws secretsmanager list-secrets                                       # List all secrets
aws secretsmanager get-secret-value \
  --secret-id openclaw/prod/db-password                              # Retrieve secret (never log output)
aws ssm get-parameter \
  --name /openclaw/prod/api-url \
  --with-decryption                                                   # Retrieve encrypted SSM parameter
aws ssm get-parameters-by-path \
  --path /openclaw/prod \
  --with-decryption \
  --recursive                                                         # All parameters under a prefix path
```

### AWS CLI — Cost
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE                              # Month-to-date cost by service
aws budgets describe-budgets --account-id <account-id>               # Configured budget alerts
```

### Docker and ECR Build/Push
```bash
docker build --target production \
  -t <account>.dkr.ecr.us-east-1.amazonaws.com/openclaw/app:v2.5.0 .
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/openclaw/app:v2.5.0
docker scout cves <image>                                             # Scan image for CVEs pre-push
trivy image <image>                                                   # Trivy vulnerability scan
```

### OpenClaw Platform
```bash
openclaw status                                    # Check platform health
openclaw gateway status                            # Check gateway connectivity
node dist/index.js health                          # Direct health check endpoint
```

---

## 2. Project Map

```
/home/node/.openclaw/workspace/
  AGENTS.md                            # Team-wide agent instructions
  infra-architect-AGENTS.md           # This file — infra-architect operating manual
  MEMORY.md                           # Long-term memory across sessions
  memory/
    YYYY-MM-DD.md                     # Daily operational notes and postmortems

  openclaw-team-config/
    openclaw.team.example.json        # Team configuration schema
    agents/                           # Per-agent configuration files

  infrastructure/
    terraform/
      modules/                        # Reusable Terraform modules (hashicorp/aws provider)
        networking/                   # VPC, subnets (public/private/data), NAT Gateway,
        |                             #   ALB, security groups, NACLs, VPC flow logs
        compute/                      # ECS Fargate clusters/services, EC2 Auto Scaling,
        |                             #   Lambda functions, task definitions
        database/                     # RDS (PostgreSQL/MySQL), ElastiCache Redis, DynamoDB
        cdn/                          # CloudFront distributions, S3 origin, WAF association
        iam/                          # IAM roles, policies, OIDC providers, SCPs
        secrets/                      # AWS Secrets Manager secrets, SSM parameters
        monitoring/                   # CloudWatch dashboards, alarms, log groups,
        |                             #   X-Ray sampling rules, Container Insights
        storage/                      # S3 buckets (versioned, encrypted), EFS file systems

      environments/
        dev/                          # Dev environment root module + backend.tf
        staging/                      # Staging environment root module + backend.tf
        prod/                         # Production environment root module + backend.tf
      global/                         # Shared resources: Route53 zones, ACM certs, ECR repos,
                                      #   S3 state buckets, DynamoDB lock tables, IAM org SCPs

    docker/
      Dockerfile                      # Multi-stage production Dockerfile (ECR target)
      Dockerfile.dev                  # Development Dockerfile with hot-reload
      docker-compose.yml              # Local development compose stack
      docker-compose.dev.yml          # Development compose overrides
      .dockerignore                   # Exclude secrets, tests, docs from build context

    monitoring/
      cloudwatch/
        dashboards/                   # CloudWatch dashboard JSON definitions
        alarms/                       # Alarm Terraform configurations per service
        log-insights/                 # Saved CloudWatch Logs Insights queries
      xray/
        sampling-rules.json           # X-Ray sampling rule definitions
```

---

## 3. Tech Stack

| Layer              | Technology                                                    | Purpose                                          |
|--------------------|---------------------------------------------------------------|--------------------------------------------------|
| IaC Provisioning   | Terraform >= 1.7, hashicorp/aws provider ~> 5.0               | AWS resource lifecycle management                |
| Compute (primary)  | Amazon ECS Fargate                                            | Serverless container scheduling, no EC2 mgmt     |
| Compute (burst)    | EC2 Auto Scaling Groups (AL2023, Graviton3)                   | Cost-optimized workloads requiring host access   |
| Compute (event)    | AWS Lambda (arm64, SnapStart for Java)                        | Event-driven and scheduled serverless functions  |
| Containers         | Docker multi-stage builds, Amazon ECR                         | Image building, storage, vulnerability scanning  |
| Networking         | VPC, ALB, Route53, CloudFront, NAT Gateway, NACLs, SGs        | Traffic routing, isolation, edge delivery        |
| Database           | RDS PostgreSQL / MySQL (Multi-AZ), ElastiCache Redis, DynamoDB| Relational, cache, and NoSQL data stores         |
| Storage            | S3 (versioned, encrypted, lifecycle policies), EFS            | Object storage and shared container volumes      |
| Secrets            | AWS Secrets Manager (primary), SSM Parameter Store (config)   | Runtime secret injection, automatic rotation     |
| Monitoring         | CloudWatch Metrics/Logs/Alarms, Container Insights, X-Ray     | Observability, distributed tracing, alerting     |
| IAM                | IAM Roles, Policies, SCPs (AWS Organizations), OIDC providers | Least-privilege access control                   |
| CI/CD              | GitHub Actions (OIDC → IAM role, no static keys)              | Pipeline-based delivery to ECR and ECS           |
| Cost               | AWS Cost Explorer, AWS Budgets, Savings Plans, Infracost       | Spend visibility, forecasting, optimization      |
| Testing            | Terratest (Go), tflint, checkov, trivy, docker scout           | IaC validation and container security scanning   |
| Runtime            | Node.js v22, Python 3 via /home/node/venv                      | Application execution                            |

---

## 4. Standards

### Always Do

1. **Pin all versions** — provider versions (`~> 5.0`), Terraform version (`>= 1.7.0`), ECR image tags (never `:latest` in task definitions). Pin base image tags to a specific digest in production Dockerfiles.
2. **Use remote state on S3 + DynamoDB** — encrypt state at rest with a KMS CMK, enable versioning on the bucket, and use a DynamoDB table for locking. Never allow local state on shared infrastructure.
3. **Separate state per environment** — dev, staging, and prod each get their own S3 key and DynamoDB lock entry. Cross-environment state references use `terraform_remote_state` data sources.
4. **Run `terraform plan -out=tfplan` before every apply** — store the plan artifact, apply only that artifact. CI must block merges when plan shows unreviewed destructive changes.
5. **Build multi-stage Docker images** — builder stage installs dev dependencies and compiles; production stage copies only the compiled artifacts into a minimal base (distroless or alpine). No build tools in the runtime image.
6. **Run containers as non-root in ECS** — set `user = "1000:1000"` in the task definition container spec. Verify with `aws ecs describe-task-definition`.
7. **Scan images in CI before pushing to ECR** — run `trivy image` and `docker scout cves` on every PR and block on HIGH/CRITICAL CVEs. ECR enhanced scanning (Inspector) must be enabled on all repos.
8. **Tag every AWS resource** — mandatory tags: `Environment`, `Project`, `Owner`, `ManagedBy=terraform`, `CostCenter`. Enforce with an AWS Config rule and tflint tag-check rules.
9. **Use IAM roles, not static keys** — ECS tasks use task roles, GitHub Actions uses OIDC federation, EC2 uses instance profiles. Never issue long-lived IAM access keys for service workloads.
10. **Encrypt all data at rest and in transit** — RDS encryption with KMS, S3 SSE-KMS, EBS volumes encrypted, Secrets Manager values encrypted, all endpoints TLS-only (enforce via bucket policy and security group rules).
11. **Enable VPC Flow Logs** — route to CloudWatch Logs for network-level audit and anomaly detection. Retain for at minimum 90 days.
12. **Document every Terraform module** — each module requires a `README.md` with inputs table, outputs table, and a usage example generated by `terraform-docs`.
13. **Reference the AWS Well-Architected Framework** — every architectural decision must identify which pillar it addresses and how trade-offs between pillars are resolved.

### Never Do

1. **Never commit secrets** — no API keys, passwords, tokens, certificates, or private keys in Git. Use `.gitignore`, pre-commit secret scanning (`gitleaks`), and AWS Secrets Manager.
2. **Never use `:latest` in ECS task definitions or ECR pull** — always pin to a specific image tag or digest so rollbacks are deterministic.
3. **Never edit Terraform state manually** — use `terraform state mv`, `terraform state rm`, or `terraform import`. Never hand-edit `.tfstate` files in S3.
4. **Never `terraform apply` without a saved plan** — unplanned applies can introduce unreviewed destructive changes to production.
5. **Never open `0.0.0.0/0` ingress on security groups** — ALB SGs accept HTTP/HTTPS from the internet; application SGs accept traffic only from the ALB SG ID, not a CIDR range.
6. **Never skip `terraform validate` and `terraform fmt`** — both must pass in CI before any plan runs. Format failures block the pipeline.
7. **Never use IAM `*` actions or `*` resources in policies** — every policy statement must name the specific actions and ARNs required. Use the IAM Access Analyzer policy validator.
8. **Never hardcode AWS account IDs, ARNs, or Region strings** — use `data "aws_caller_identity"`, `data "aws_region"`, variables, and SSM parameter lookups.
9. **Never deploy to production without a rollback plan** — ECS rollback = previous task definition revision; RDS = snapshot taken before migration; Terraform = `terraform apply` of prior plan.
10. **Never store Terraform state locally for shared infrastructure** — local state causes conflicts, has no locking, and can be silently lost.
11. **Never disable CloudTrail or GuardDuty** — these are security controls, not optional logging. Any PR that removes these resources will be rejected.

---

## 5. Golden Examples

### Example 1: Terraform VPC Module — Multi-AZ with Public, Private, and Data Subnets

```hcl
# modules/networking/main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  az_count = min(length(var.availability_zones), 3)
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-vpc"
  })
}

# --- Subnets ---

resource "aws_subnet" "public" {
  count                   = local.az_count
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false  # Assign EIPs explicitly; never auto-assign

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-public-${count.index + 1}"
    Tier = "public"
    # Required tag for AWS Load Balancer Controller (EKS) if used
    "kubernetes.io/role/elb" = "1"
  })
}

resource "aws_subnet" "private" {
  count             = local.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-private-${count.index + 1}"
    Tier = "private"
    "kubernetes.io/role/internal-elb" = "1"
  })
}

resource "aws_subnet" "data" {
  count             = local.az_count
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-data-${count.index + 1}"
    Tier = "data"
  })
}

# --- Internet Gateway ---

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-igw"
  })
}

# --- NAT Gateways (one per AZ for HA) ---

resource "aws_eip" "nat" {
  count  = local.az_count
  domain = "vpc"

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-nat-eip-${count.index + 1}"
  })
}

resource "aws_nat_gateway" "main" {
  count         = local.az_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  depends_on = [aws_internet_gateway.main]

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-nat-${count.index + 1}"
  })
}

# --- Route Tables ---

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-rt-public"
  })
}

resource "aws_route_table_association" "public" {
  count          = local.az_count
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = local.az_count
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[count.index].id
  }

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-rt-private-${count.index + 1}"
  })
}

resource "aws_route_table_association" "private" {
  count          = local.az_count
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Data subnets have no internet route (isolated)
resource "aws_route_table" "data" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-rt-data"
  })
}

resource "aws_route_table_association" "data" {
  count          = local.az_count
  subnet_id      = aws_subnet.data[count.index].id
  route_table_id = aws_route_table.data.id
}

# --- VPC Flow Logs ---

resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/flowlogs/${var.project}-${var.environment}"
  retention_in_days = 90
  kms_key_id        = var.kms_key_arn

  tags = var.common_tags
}

resource "aws_iam_role" "flow_logs" {
  name = "${var.project}-${var.environment}-vpc-flow-logs"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "flow_logs" {
  role = aws_iam_role.flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
    }]
  })
}

resource "aws_flow_log" "main" {
  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_logs.arn
  log_destination = aws_cloudwatch_log_group.flow_logs.arn

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-vpc-flow-logs"
  })
}

# modules/networking/outputs.tf
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "ID of the VPC"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "IDs of the public subnets (ALB, NAT GW)"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "IDs of the private subnets (ECS tasks, EC2)"
}

output "data_subnet_ids" {
  value       = aws_subnet.data[*].id
  description = "IDs of the isolated data subnets (RDS, ElastiCache)"
}
```

---

### Example 2: ECS Fargate Service with ALB, Auto-Scaling, and CloudWatch Alarms

```hcl
# modules/compute/ecs-service/main.tf

# --- ECS Cluster ---

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"      # CloudWatch Container Insights for CPU/mem metrics per task
  }

  tags = var.common_tags
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# --- CloudWatch Log Group ---

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}-${var.environment}/${var.service_name}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = var.common_tags
}

# --- ECS Task Definition ---

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project}-${var.environment}-${var.service_name}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([{
    name      = var.service_name
    image     = "${var.ecr_image_uri}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    # Inject secrets from AWS Secrets Manager (no plaintext values in task def)
    secrets = [
      {
        name      = "DB_PASSWORD"
        valueFrom = "${var.db_secret_arn}:password::"
      },
      {
        name      = "API_KEY"
        valueFrom = var.api_key_secret_arn
      }
    ]

    environment = [
      { name = "NODE_ENV",   value = var.environment },
      { name = "PORT",       value = tostring(var.container_port) },
      { name = "LOG_LEVEL",  value = var.environment == "prod" ? "warn" : "debug" }
    ]

    # Non-root user
    user = "1000:1000"

    readonlyRootFilesystem = true

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -sf http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = var.common_tags
}

# --- ALB Target Group ---

resource "aws_lb_target_group" "app" {
  name        = "${var.project}-${var.environment}-${var.service_name}"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"   # Required for Fargate awsvpc networking

  health_check {
    path                = "/health"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30   # Allow in-flight requests to complete before draining

  tags = var.common_tags
}

resource "aws_lb_listener_rule" "app" {
  listener_arn = var.alb_https_listener_arn
  priority     = var.listener_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    host_header {
      values = [var.service_hostname]
    }
  }
}

# --- ECS Service ---

resource "aws_ecs_service" "app" {
  name                               = var.service_name
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 120
  enable_execute_command             = var.environment != "prod"  # ECS Exec only in non-prod

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = var.service_name
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true   # Auto-rollback to previous task definition on deployment failure
  }

  deployment_controller {
    type = "ECS"
  }

  lifecycle {
    ignore_changes = [desired_count]   # Managed by auto-scaling after initial deploy
  }

  tags = var.common_tags
}

# --- ECS Service Auto-Scaling ---

resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.project}-${var.environment}-${var.service_name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "memory" {
  name               = "${var.project}-${var.environment}-${var.service_name}-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 75
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

# --- CloudWatch Alarms ---

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${var.project}-${var.environment}-${var.service_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "ECS service CPU above 85% for 10 minutes"
  alarm_actions       = [var.sns_alarm_topic_arn]
  ok_actions          = [var.sns_alarm_topic_arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  tags = var.common_tags
}

resource "aws_cloudwatch_metric_alarm" "task_count_low" {
  alarm_name          = "${var.project}-${var.environment}-${var.service_name}-task-count-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Average"
  threshold           = var.min_capacity
  alarm_description   = "Running task count below minimum — possible deployment failure"
  alarm_actions       = [var.sns_alarm_topic_arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.app.name
  }

  tags = var.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.project}-${var.environment}-${var.service_name}-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than 10 target 5xx errors in 1 minute"
  alarm_actions       = [var.sns_alarm_topic_arn]

  dimensions = {
    TargetGroup  = aws_lb_target_group.app.arn_suffix
    LoadBalancer = var.alb_arn_suffix
  }

  tags = var.common_tags
}
```

---

### Example 3: RDS PostgreSQL Module — Multi-AZ, Encrypted, Automatic Backups

```hcl
# modules/database/rds-postgres/main.tf

resource "aws_db_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-postgres"
  description = "Data-tier subnets for RDS PostgreSQL"
  subnet_ids  = var.data_subnet_ids

  tags = var.common_tags
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.project}-${var.environment}-postgres16"
  family = "postgres16"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"   # Log queries slower than 1 second
  }

  parameter {
    name  = "ssl"
    value = "1"      # Require SSL for all connections
  }

  tags = var.common_tags
}

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds-sg"
  description = "Allow PostgreSQL from ECS task security group only"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.ecs_task_sg_id]
    description     = "PostgreSQL from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []
    description = "No egress from RDS"
  }

  tags = merge(var.common_tags, {
    Name = "${var.project}-${var.environment}-rds-sg"
  })
}

resource "aws_db_instance" "postgres" {
  identifier = "${var.project}-${var.environment}-postgres"
  engine     = "postgres"
  engine_version = "16.3"
  instance_class = var.instance_class   # e.g. "db.t4g.medium" for dev, "db.r8g.xlarge" for prod

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage   # Enable storage autoscaling up to this limit
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn

  db_name  = var.db_name
  username = var.db_username
  # Password sourced from Secrets Manager; reference the secret ARN instead of passing a value
  manage_master_user_password   = true
  master_user_secret_kms_key_id = var.kms_key_arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name

  multi_az               = var.environment == "prod"
  publicly_accessible    = false
  deletion_protection    = var.environment == "prod"

  backup_retention_period   = var.environment == "prod" ? 35 : 7
  backup_window             = "03:00-04:00"
  maintenance_window        = "mon:04:30-mon:05:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = var.kms_key_arn
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  skip_final_snapshot       = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.project}-prod-postgres-final" : null

  tags = var.common_tags
}

# CloudWatch alarm for high DB connections
resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${var.project}-${var.environment}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.max_db_connections * 0.8
  alarm_description   = "RDS connection count above 80% of maximum"
  alarm_actions       = [var.sns_alarm_topic_arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }

  tags = var.common_tags
}

output "db_endpoint" {
  value       = aws_db_instance.postgres.endpoint
  description = "RDS PostgreSQL endpoint (host:port)"
  sensitive   = false
}

output "db_secret_arn" {
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
  description = "ARN of the Secrets Manager secret containing the master password"
}
```

---

### Example 4: IAM Role for ECS Task — Least-Privilege Task Execution Role and Task Role

```hcl
# modules/iam/ecs-task-roles/main.tf

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# --- ECS Task Execution Role (used by ECS agent, not by app code) ---

resource "aws_iam_role" "execution" {
  name = "${var.project}-${var.environment}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        ArnLike = {
          "aws:SourceArn" = "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
        }
      }
    }]
  })

  tags = var.common_tags
}

# Attach the AWS-managed policy for ECR pull and CloudWatch Logs
resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Additional policy for pulling secrets at startup
resource "aws_iam_role_policy" "execution_secrets" {
  name = "SecretsManagerRead"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.secret_arns
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
      }
    ]
  })
}

# --- ECS Task Role (used by application code at runtime) ---

resource "aws_iam_role" "task" {
  name = "${var.project}-${var.environment}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        ArnLike = {
          "aws:SourceArn" = "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
        }
      }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "task_s3" {
  name = "S3AppBucketAccess"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.app_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.app_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "task_secretsmanager" {
  name = "SecretsManagerRuntimeRead"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = var.runtime_secret_arns
    }]
  })
}

resource "aws_iam_role_policy" "task_xray" {
  name = "XRayWrite"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ]
      Resource = "*"
    }]
  })
}

output "execution_role_arn" {
  value       = aws_iam_role.execution.arn
  description = "ARN of the ECS task execution role"
}

output "task_role_arn" {
  value       = aws_iam_role.task.arn
  description = "ARN of the ECS task role (application runtime)"
}
```

---

### Example 5: Terraform S3 + DynamoDB Remote State Backend with Encryption and Versioning

```hcl
# global/terraform-state/main.tf
# Run once per AWS account, manually with local state, then import.

resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state bucket encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = var.common_tags
}

resource "aws_kms_alias" "terraform_state" {
  name          = "alias/terraform-state"
  target_key_id = aws_kms_key.terraform_state.key_id
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "openclaw-terraform-state-${data.aws_caller_identity.current.account_id}"

  # Prevent accidental deletion of state bucket
  lifecycle {
    prevent_destroy = true
  }

  tags = merge(var.common_tags, {
    Name = "openclaw-terraform-state"
  })
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.terraform_state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "openclaw-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }

  tags = var.common_tags
}

# --- Backend configuration referenced by all environment root modules ---
# environments/prod/backend.tf

terraform {
  backend "s3" {
    bucket         = "openclaw-terraform-state-<account-id>"
    key            = "prod/infrastructure.tfstate"
    region         = "us-east-1"
    encrypt        = true
    kms_key_id     = "alias/terraform-state"
    dynamodb_table = "openclaw-terraform-locks"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  required_version = ">= 1.7.0"
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "openclaw"
      Environment = "prod"
      ManagedBy   = "terraform"
      Owner       = "infra-architect"
    }
  }
}
```

---

### Example 6: Multi-Stage Docker Build for ECR Push

```dockerfile
# Dockerfile

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build && npm prune --production

# Stage 2: Production (minimal attack surface)
FROM node:22-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Run as non-root (matches ECS task definition user = "1000:1000")
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=60s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

---

## 6. Legacy / Avoid

| Pattern                                               | Why It Is Dangerous                                                   | Use Instead                                              |
|-------------------------------------------------------|-----------------------------------------------------------------------|----------------------------------------------------------|
| Local Terraform state files                           | No locking, conflicts in teams, easy to lose on disk wipe             | S3 + DynamoDB remote backend with KMS encryption         |
| Long-lived IAM access keys for services               | Key rotation is manual, keys leak in env vars, logs, crash dumps      | ECS task roles, OIDC federation for CI, instance profiles|
| Hardcoding secrets in ECS task definitions            | Secrets visible in plain text in AWS console and CloudTrail           | Secrets Manager `valueFrom` in container definitions     |
| Single-stage Docker builds                            | Bloated images with build tools, dev deps, and source code            | Multi-stage builds; copy only compiled artifacts          |
| `docker-compose` v1 CLI                               | Deprecated and unmaintained                                           | `docker compose` v2 (built-in plugin)                    |
| Running containers as root in ECS                     | Container escape via kernel exploits can reach host or other tasks    | `user = "1000:1000"` in task definition                  |
| Untagged AWS resources                                | Cannot track costs, ownership, or lifecycle; AWS Config violations    | Enforce tagging policy with tflint + AWS Config rules    |
| Wide-open security groups (`0.0.0.0/0` ingress)       | Exposes application ports directly to the internet                    | ALB SG accepts internet; app SG accepts only ALB SG ID   |
| Using `terraform taint` (deprecated)                  | Replaced in Terraform >= 0.15.2                                       | `terraform apply -replace=<resource.name>`               |
| HashiCorp Vault (self-managed)                        | Operational burden of HA Vault clusters on ECS; upgrade complexity    | AWS Secrets Manager with automatic rotation              |
| Prometheus + Grafana on ECS for primary observability | Additional infra to manage; CloudWatch is native and zero-ops         | CloudWatch Metrics, Alarms, Container Insights; X-Ray    |
| Kubernetes (EKS) as default compute                   | Higher operational overhead than ECS Fargate for most workloads       | ECS Fargate; reserve EKS for workloads that need it      |
| Monolithic Terraform root modules                     | Slow plans, massive blast radius, hard to review and test             | Small composable modules per concern                     |
| Using `terraform apply` without `-out` plan           | Unreviewed changes can reach production                               | Always `plan -out=tfplan`, then `apply tfplan`           |

---

## 7. Testing and Verification

### Pre-Commit Checks (every change)
```bash
terraform fmt -check -recursive           # Formatting consistency — fails pipeline if off
terraform validate                        # Syntax and reference validation
tflint --recursive                        # AWS-specific linting and best practice rules
checkov -d . --framework terraform        # Security policy scanning (CIS AWS Foundations)
trivy config .                            # Misconfiguration scan on Terraform files
docker scout cves <image>                 # Container CVE scan before ECR push
trivy image <image>                       # Secondary container scan
```

### Integration Tests (Terratest)
```go
// infrastructure/terraform/modules/networking/networking_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestVPCModule(t *testing.T) {
    t.Parallel()

    opts := &terraform.Options{
        TerraformDir: "../",
        Vars: map[string]interface{}{
            "project":      "openclaw-test",
            "environment":  "test",
            "vpc_cidr":     "10.99.0.0/16",
        },
    }

    defer terraform.Destroy(t, opts)
    terraform.InitAndApply(t, opts)

    vpcID := terraform.Output(t, opts, "vpc_id")
    assert.NotEmpty(t, vpcID)

    privateSubnetIDs := terraform.OutputList(t, opts, "private_subnet_ids")
    assert.Equal(t, 3, len(privateSubnetIDs))
}
```

### Smoke Tests (post-deploy to ECS)
```bash
# 1. Verify ECS service is stable (running count matches desired)
aws ecs describe-services \
  --cluster openclaw-prod \
  --services openclaw-app \
  --query 'services[0].{running:runningCount,desired:desiredCount,status:status}'

# 2. Verify ALB health checks are passing
aws elbv2 describe-target-health \
  --target-group-arn <tg-arn> \
  --query 'TargetHealthDescriptions[*].{id:Target.Id,state:TargetHealth.State}'

# 3. Verify application health endpoint
curl -sf https://app.openclaw.io/health

# 4. Verify no ERROR log spikes in the last 5 minutes
aws logs filter-log-events \
  --log-group-name /ecs/openclaw-prod/openclaw-app \
  --start-time $(($(date +%s) - 300))000 \
  --filter-pattern "ERROR" \
  --query 'events | length(@)'

# 5. Confirm Terraform plan shows no drift post-deploy
terraform plan   # should output: No changes. Infrastructure is up-to-date.
```

### Cost Verification
```bash
infracost breakdown --path .              # Estimate monthly cost impact
infracost diff --path . --compare-to previous.json  # Delta vs prior estimate
```

---

## 8. PR / Commit Workflow

### Commit Message Format
```
<type>(<scope>): <description>

[optional body — explain why, not what]

[optional footer — issue references, breaking change notes]
```

**Types**: `infra`, `docker`, `ecs`, `iam`, `monitor`, `security`, `fix`, `docs`, `chore`
**Scopes**: `terraform`, `docker`, `ecs`, `rds`, `s3`, `alb`, `vpc`, `iam`, `secrets`, `cloudwatch`, `xray`

Examples:
```
infra(vpc): add data-tier subnets and remove internet routes from data route table

ecs(terraform): enable deployment circuit breaker with auto-rollback on openclaw-app

security(iam): scope ECS task role S3 access to app bucket ARN only

monitor(cloudwatch): add ALB 5xx alarm with SNS notification for prod
```

### Definition of Done
- [ ] `terraform fmt` and `terraform validate` pass with zero errors
- [ ] `terraform plan` shows only intended changes (no surprise diffs or deletions)
- [ ] `tflint` passes with no new rule violations
- [ ] `checkov` and `trivy config` pass with no new HIGH/CRITICAL policy violations
- [ ] Container image scanned — zero HIGH/CRITICAL CVEs in `trivy image` and `docker scout cves`
- [ ] All AWS resources tagged: `Environment`, `Project`, `Owner`, `ManagedBy=terraform`, `CostCenter`
- [ ] Secrets referenced via Secrets Manager or SSM — never inline in task definitions or `.tf` files
- [ ] IAM policies use least-privilege: specific actions and specific resource ARNs
- [ ] CloudWatch alarms updated or created for any new ECS services, RDS instances, or Lambda functions
- [ ] Rollback procedure documented in PR description (ECS task def revision / Terraform state / RDS snapshot ID)
- [ ] Cost impact estimated with `infracost breakdown` and within environment budget
- [ ] AWS Well-Architected pillar addressed in PR description (which pillar, what trade-offs)
- [ ] Peer review approved by at least one other infrastructure engineer

---

## 9. Boundaries

### Always (no approval needed)
- Run `terraform plan`, `terraform validate`, `terraform fmt`
- Build and scan Docker images locally and push to ECR dev repositories
- Run `tflint`, `checkov`, `trivy config`, `trivy image`, `docker scout cves`
- Read and query Terraform state (read-only: `terraform state list`, `terraform output`)
- Update CloudWatch dashboards and alarms in dev/staging environments
- Query CloudWatch Logs and metrics (read-only)
- Write documentation and runbooks
- Run `infracost breakdown` for cost estimation

### Ask First
- `terraform apply` to any shared environment (staging, prod)
- Creating or destroying AWS resources that incur cost (NAT Gateways, RDS, ElastiCache)
- Modifying IAM roles, policies, or SCPs
- Modifying VPC security groups or NACLs in staging/prod
- Modifying RDS parameter groups or instance class (requires restart)
- Rotating secrets in AWS Secrets Manager in prod
- Upgrading EKS cluster versions (if EKS is in use)
- Changing CloudWatch alarm thresholds in production
- Scaling resources beyond established cost thresholds
- Adding new AWS accounts or modifying AWS Organizations SCPs

### Never
- `terraform destroy` on production without explicit written approval from two engineers
- Commit secrets, tokens, certificates, or private keys to Git
- Disable CloudTrail, GuardDuty, AWS Config, or Security Hub
- Open `0.0.0.0/0` ingress on any security group in staging or prod
- Modify Terraform state files directly in S3
- Deploy to production without a tested rollback plan and a pre-change RDS snapshot
- Issue long-lived IAM access keys for any service or CI system
- Bypass pre-commit hooks or disable CI security scans
- Exfiltrate private data, credentials, or fabricate test results
- Use the AWS root account for any operational activity

---

## 10. Troubleshooting

### 1. Terraform state lock stuck on DynamoDB
**Symptom**: `Error acquiring the state lock — ConditionalCheckFailedException`
**Cause**: A previous `terraform apply` was interrupted (process killed, session timeout, network drop).
**Fix**:
```bash
# Find the lock holder and lock ID
aws dynamodb scan \
  --table-name openclaw-terraform-locks \
  --query 'Items[*].{LockID:LockID.S,Info:Info.S}'

# Only force-unlock after confirming no other apply is running
terraform force-unlock <LOCK_ID>
```
Verify no other CI job is currently running an apply before unlocking.

### 2. ECS task failing to pull image from ECR
**Symptom**: Task stopped with `CannotPullContainerError: pull access denied`
**Cause**: Most common causes: ECR repo does not exist in the correct region, execution role lacks ECR permissions, image tag does not exist, ECR lifecycle policy deleted the tag.
**Fix**:
```bash
# Verify image exists
aws ecr describe-images \
  --repository-name openclaw/app \
  --image-ids imageTag=v2.5.0 \
  --region us-east-1

# Verify execution role has the AmazonECSTaskExecutionRolePolicy attached
aws iam list-attached-role-policies \
  --role-name openclaw-prod-ecs-execution

# Verify ECR endpoint reachability from VPC (check VPC endpoint or NAT Gateway)
aws ec2 describe-vpc-endpoints \
  --filters Name=service-name,Values=com.amazonaws.us-east-1.ecr.dkr
```
If the VPC has no NAT Gateway and no ECR VPC endpoint, Fargate tasks in private subnets cannot reach ECR. Add a VPC interface endpoint for `ecr.dkr` and `ecr.api`.

### 3. ALB health check failing (target deregistered)
**Symptom**: Targets show `unhealthy` state; ECS service deploys new tasks but they are deregistered immediately.
**Cause**: Health check path returning non-2xx, container not listening yet (grace period too short), security group blocking ALB to task on health check port.
**Fix**:
```bash
# Check target health and reason
aws elbv2 describe-target-health \
  --target-group-arn <tg-arn> \
  --query 'TargetHealthDescriptions[*].{ip:Target.Id,state:TargetHealth.State,reason:TargetHealth.Reason,desc:TargetHealth.Description}'

# Check ECS task logs for startup errors
aws logs tail /ecs/openclaw-prod/openclaw-app --since 10m --filter-pattern "ERROR"
```
Common fixes: Increase `health_check_grace_period_seconds` on the ECS service (to 120+), verify the health check path (`/health`) returns 200, and confirm the ECS task security group allows TCP from the ALB security group on the container port.

### 4. RDS connection refused
**Symptom**: Application cannot connect to PostgreSQL: `ECONNREFUSED` or `timeout`
**Cause**: Security group not allowing the ECS task SG, wrong endpoint, parameter group ssl=1 requiring TLS.
**Fix**:
```bash
# Verify RDS instance is available
aws rds describe-db-instances \
  --db-instance-identifier openclaw-prod-postgres \
  --query 'DBInstances[0].{status:DBInstanceStatus,endpoint:Endpoint.Address}'

# Check security group rules allow ECS task SG on port 5432
aws ec2 describe-security-groups \
  --group-ids <rds-sg-id> \
  --query 'SecurityGroups[0].IpPermissions'
```
Ensure the connection string uses SSL (`?ssl=true&sslmode=require`) when the `ssl` parameter group parameter is enabled. Verify the ECS task is in the correct VPC and private subnet that can reach the data subnet.

### 5. Lambda timeout or cold start latency
**Symptom**: Lambda function timing out on first invocation; downstream calls fail during cold start.
**Cause**: Initialization code outside the handler (DB connections, SDK clients) runs on cold start. Default 3-second timeout too short for initialization.
**Fix**:
- Move SDK client initialization outside the handler (module level) so it is reused across warm invocations.
- Increase the Lambda timeout to accommodate cold start (e.g., 30s for a Node.js function with DB init).
- Use Provisioned Concurrency for latency-sensitive functions in prod.
- For Java functions, enable SnapStart on the function version.
- Switch to arm64 architecture (`architecture = ["arm64"]` in Terraform) — Graviton2 reduces cold start duration and cost.

### 6. CloudWatch alarm not triggering
**Symptom**: Alarm exists but never fires despite metric exceeding the threshold.
**Cause**: Wrong namespace, missing or incorrect dimensions, metric not being published (Container Insights not enabled), period too long.
**Fix**:
```bash
# Verify the metric exists with the exact namespace and dimensions
aws cloudwatch list-metrics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=openclaw-prod

# Check current metric data
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=openclaw-prod \
               Name=ServiceName,Value=openclaw-app \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 --statistics Average
```
If using Container Insights metrics (namespace `ECS/ContainerInsights`), verify `containerInsights = "enabled"` is set on the ECS cluster. Dimension names must match exactly (case-sensitive).

### 7. IAM permission denied
**Symptom**: `AccessDeniedException: User/Role is not authorized to perform: <action> on resource: <arn>`
**Fix**:
```bash
# Identify exactly which action and resource are failing from the error message
# Simulate the policy to verify what is and is not allowed
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::<account-id>:role/openclaw-prod-ecs-task \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::openclaw-prod-uploads/*

# Check CloudTrail for the actual denied event
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutObject \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
```
Add only the specific denied action to the task role policy on the specific resource ARN. Use the IAM Access Analyzer policy validator to check for overly broad permissions before applying.

### 8. NAT Gateway bandwidth costs unexpectedly high
**Symptom**: AWS Cost Explorer shows NAT Gateway data processing charges far exceeding expectations.
**Cause**: ECS tasks in private subnets downloading large artifacts from the internet (ECR, S3, npm), inter-AZ traffic flowing through NAT Gateway unnecessarily.
**Fix**:
- Add VPC interface endpoints for ECR (`ecr.dkr`, `ecr.api`), S3 (gateway endpoint — free), Secrets Manager, CloudWatch Logs. Traffic to these services will no longer traverse the NAT Gateway.
- Ensure ECS tasks use the NAT Gateway in the same AZ (route table per AZ, each pointing to the AZ-local NAT GW).
- Use ECR image caching — avoid re-pulling large images on every task launch (use `:latest` avoidance and `imagePullPolicy: IfNotPresent` equivalent in task definitions via pinned tags).
```bash
# Identify top NAT Gateway cost contributors
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Virtual Private Cloud"]}}'
```

### 9. Route53 DNS propagation delays
**Symptom**: New DNS record created but `nslookup` / `dig` still returns old value.
**Cause**: TTL on the old record was high (e.g., 300s or 3600s); resolvers across the internet are caching the old answer.
**Fix**:
- Before any planned DNS change, lower the TTL to 60 seconds at least 24 hours (one full TTL cycle of the old value) in advance. After the change is stable, raise TTL back to 300.
- Use `dig +trace <hostname>` to verify the authoritative answer from Route53.
- For ALB-backed records, use an Alias record (not a CNAME). Alias records have zero TTL from a caching standpoint.
```bash
# Check current authoritative answer from Route53
dig +trace app.openclaw.io

# Verify the Route53 record value
aws route53 list-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --query 'ResourceRecordSets[?Name==`app.openclaw.io.`]'
```

### 10. Terraform plan shows unexpected drift
**Symptom**: Plan shows changes to resources you did not modify (e.g., security group rule order, tag values).
**Cause**: ClickOps — someone modified infrastructure via the AWS Console outside Terraform. Or AWS updated a default attribute value.
**Fix**:
```bash
# Refresh state to sync with real AWS state
terraform refresh

# Review the diff carefully
terraform plan -out=tfplan

# Either import the manual change into state, or revert it in the console and re-plan
terraform import aws_security_group_rule.example <sg-id>_ingress_tcp_443_443_0.0.0.0/0
```
Enable AWS Config with a `required-tags` rule and a `restricted-common-ports` rule to detect and alert on ClickOps changes in real-time.

---

## 11. How to Improve

### Self-Improvement Protocol

1. **After every incident**: Write a postmortem in `workspace/memory/YYYY-MM-DD.md` covering: what happened, root cause (AWS service failure vs. config error vs. code bug), impact duration, and prevention steps added to this file.
2. **After every project**: Update this file with new patterns, new commands, or new troubleshooting entries discovered during the work.
3. **Monthly review**: Scan for stale guidance (deprecated CLI flags, new AWS service GA announcements, Terraform AWS provider changelog, new Well-Architected guidance from AWS).
4. **AWS Well-Architected Review**: Run a Well-Architected Tool review (`aws wellarchitected *`) against each workload annually. Address any HIGH-risk findings before the next major release.

### Learning Sources
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) — six pillars, lens library
- [Terraform AWS Provider documentation](https://registry.terraform.io/providers/hashicorp/aws/latest/docs) — authoritative resource references
- [AWS ECS Best Practices Guide](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [AWS Security Reference Architecture](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html)
- [AWS re:Invent infrastructure sessions](https://www.youtube.com/@AWSEventsChannel) — CON, DAT, NET, SEC tracks
- [Checkov CIS AWS Foundations Benchmark rules](https://www.checkov.io/5.Policy%20Index/terraform.html)
- AWS Cost Optimization Hub in the AWS Console — automated rightsizing recommendations

### Memory Management
- **Daily notes**: `workspace/memory/YYYY-MM-DD.md` — operational decisions, AWS service incidents encountered, solutions applied
- **Long-term memory**: `workspace/MEMORY.md` — stable patterns, proven AWS solutions, recurring gotchas by service
- **Update triggers**: new AWS service adoption, deprecated pattern discovery, security incident learnings, cost optimization wins, Well-Architected finding remediation

### Metrics to Track
- Terraform plan-to-apply success rate (target: >95%; failures indicate drift or config bugs)
- Mean time to recover from ECS service failures (target: <15 minutes including rollback)
- Docker image size in ECR (track per-service regression; alert on >50% growth)
- Number of HIGH/CRITICAL CVEs in production ECR images (target: 0)
- Infrastructure cost variance vs. monthly budget per environment (target: <10%)
- CloudWatch alarm noise ratio — actionable alarms / total alarms fired (target: >80%)
- RDS storage autoscaling events (frequent triggers indicate need for instance class review)
- NAT Gateway data processing cost as percentage of total VPC cost (target: <20%; higher = add VPC endpoints)
- ECS task launch success rate — tasks reaching RUNNING state without failure (target: >99%)
