# 🚀 AWS Deployment Plan - iWatcher Audio Transcription

## Executive Summary

Deploy the **iWatcher** n8n workflow to AWS for production use with high availability, automatic scaling, and secure credential management.

**Current Status:** ✅ Working perfectly on local Docker
**Goal:** Production-ready AWS deployment
**Estimated Deployment Time:** 2-3 hours
**Monthly Cost Estimate:** $50-80 (optimized) or $150-200 (full HA)

---

## Table of Contents

1. [Architecture Options (3 Iterations)](#architecture-options)
2. [Recommended Architecture](#recommended-architecture)
3. [Deployment Steps](#deployment-steps)
4. [Cost Analysis](#cost-analysis)
5. [Optimizations](#optimizations)
6. [Migration Checklist](#migration-checklist)

---

## Architecture Options

### 🏗️ Iteration 1: Simple EC2 Deployment

**Components:**
- Single EC2 t3.medium instance ($30/month)
- Docker + Docker Compose running n8n
- Local SQLite database
- Elastic IP for static address

**Pros:**
- ✅ Simplest migration (lift-and-shift)
- ✅ Lowest cost
- ✅ Fastest deployment (30 minutes)
- ✅ Familiar environment (same as local)

**Cons:**
- ❌ Single point of failure
- ❌ No auto-scaling
- ❌ Manual updates required
- ❌ SQLite not recommended for production
- ❌ Data loss risk if instance fails

**Verdict:** ⚠️ Good for staging/testing, NOT recommended for production

---

### 🏗️ Iteration 2: ECS Fargate with RDS (Recommended)

**Components:**
- **ECS Fargate** - Managed container service for n8n
- **Application Load Balancer** - HTTPS termination, health checks
- **RDS PostgreSQL** - Managed database (t3.micro)
- **EFS** - Persistent storage for n8n data
- **Secrets Manager** - Secure credential storage
- **CloudWatch** - Logging and monitoring
- **VPC** - Private networking with NAT Gateway

**Architecture Diagram:**
```
Internet
    ↓
[Route 53 DNS]
    ↓
[Application Load Balancer - HTTPS]
    ↓
[ECS Fargate Tasks - n8n Container]
    ├─→ [RDS PostgreSQL - n8n database]
    ├─→ [EFS - Persistent storage]
    └─→ [Secrets Manager - API keys]
```

**Pros:**
- ✅ Fully managed (no server maintenance)
- ✅ Auto-scaling based on CPU/memory
- ✅ High availability across multiple AZs
- ✅ Automatic failover
- ✅ Secure secrets management
- ✅ Automated backups (RDS)
- ✅ Easy updates (rolling deployments)

**Cons:**
- ⚠️ Higher complexity
- ⚠️ Higher cost (~$150/month)
- ⚠️ Longer initial setup (2-3 hours)

**Verdict:** ✅ **RECOMMENDED** for production

---

### 🏗️ Iteration 3: Cost-Optimized ECS (Best Value)

**Components:**
- **ECS Fargate Spot** - 70% cheaper container instances
- **RDS Aurora Serverless v2** - Pay-per-use database
- **S3** instead of EFS - Cheaper storage
- **CloudFront** - CDN for n8n UI (optional)

**Cost Savings vs Iteration 2:**
- Fargate Spot: $30/month → $9/month (70% savings)
- Aurora Serverless: $50/month → $15/month (only when active)
- S3 vs EFS: $5/month → $1/month
- **Total: ~$50-80/month**

**Trade-offs:**
- ⚠️ Fargate Spot can be interrupted (rare, auto-restarts)
- ⚠️ Aurora Serverless has cold start (2-3 sec)

**Verdict:** ✅ **BEST VALUE** - 70% cost savings with minimal trade-offs

---

## Recommended Architecture: Cost-Optimized ECS

### Infrastructure Components

#### 1. **VPC & Networking**
```
VPC (10.0.0.0/16)
├── Public Subnets (2 AZs)
│   └── NAT Gateways
├── Private Subnets (2 AZs)
│   ├── ECS Fargate Tasks
│   └── RDS Aurora
└── Security Groups
    ├── ALB: 443 (HTTPS)
    ├── ECS: 5678 (n8n)
    └── RDS: 5432 (PostgreSQL)
```

#### 2. **ECS Fargate Configuration**
```yaml
Service: n8n-service
Task Definition:
  CPU: 512 (0.5 vCPU)
  Memory: 1024 MB (1 GB)
  Container: n8nio/n8n:latest
  Environment:
    - DB_TYPE=postgresdb
    - DB_POSTGRESDB_HOST=${RDS_ENDPOINT}
    - N8N_ENCRYPTION_KEY=${SECRET}
    - WEBHOOK_URL=https://n8n.yourdomain.com
  Scaling:
    Min: 1 task
    Max: 3 tasks
    Target CPU: 70%
```

#### 3. **RDS Aurora Serverless v2**
```yaml
Engine: aurora-postgresql
Version: 14.x
Capacity: 0.5 - 2 ACU (auto-scaling)
Backup: 7 days retention
Multi-AZ: Yes (for HA)
```

#### 4. **Secrets Manager**
```
Secrets to store:
- Google OAuth credentials
- Notion API token
- AssemblyAI API key
- OpenAI API key
- n8n encryption key
- Database password
```

#### 5. **Application Load Balancer**
```yaml
Listeners:
  - Port 443 (HTTPS)
    - SSL Certificate (ACM)
    - Target: ECS Service
  - Port 80 (HTTP)
    - Redirect to HTTPS

Health Check:
  Path: /healthz
  Interval: 30 seconds
  Timeout: 5 seconds
```

---

## Deployment Steps

### Phase 1: Pre-Deployment (30 min)

1. **Prepare AWS Account**
   ```bash
   # Install AWS CLI
   aws configure

   # Set region
   export AWS_REGION=us-east-1
   ```

2. **Create Secrets in AWS Secrets Manager**
   ```bash
   # Store Google OAuth credentials
   aws secretsmanager create-secret \
     --name n8n/google-oauth \
     --secret-string file://google_credentials.json

   # Store API keys
   aws secretsmanager create-secret \
     --name n8n/api-keys \
     --secret-string '{
       "NOTION_API_TOKEN": "...",
       "ASSEMBLYAI_API_KEY": "...",
       "OPENAI_API_KEY": "...",
       "N8N_ENCRYPTION_KEY": "..."
     }'
   ```

3. **Create ECR Repository for n8n image (if custom)**
   ```bash
   aws ecr create-repository --repository-name iwatcher-n8n
   ```

### Phase 2: Infrastructure Deployment (1 hour)

**Option A: Using CDK (Recommended)**
```bash
cd infrastructure
npm install
cdk bootstrap
cdk deploy IWatcherStack
```

**Option B: Using CloudFormation Template**
- Use provided template: `cloudformation/n8n-ecs-stack.yaml`

### Phase 3: Database Setup (15 min)

1. **Import n8n schema to RDS**
   ```bash
   # Get RDS endpoint from CDK output
   RDS_ENDPOINT=$(aws cloudformation describe-stacks \
     --stack-name IWatcherStack \
     --query 'Stacks[0].Outputs[?OutputKey==`RDSEndpoint`].OutputValue' \
     --output text)

   # Initialize n8n database (runs automatically on first start)
   ```

### Phase 4: n8n Configuration (30 min)

1. **Access n8n UI**
   ```
   https://<ALB-DNS-NAME>
   ```

2. **Set up OAuth credentials in n8n UI**
   - Google Drive OAuth2
   - Notion API

3. **Import workflow**
   ```bash
   # Get n8n API key from UI
   export N8N_API_KEY="your-api-key"

   # Import workflow
   python3 import-workflow.py
   ```

4. **Activate workflow**

### Phase 5: DNS & SSL (15 min)

1. **Create Route 53 hosted zone** (if not exists)
2. **Create ACM certificate** for your domain
3. **Update ALB listener** with ACM certificate
4. **Create Route 53 record** pointing to ALB

---

## Cost Analysis

### Monthly Cost Breakdown

#### Option 1: Iteration 2 (Full HA)
| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| ECS Fargate (1 task) | 0.5 vCPU, 1GB RAM, 24/7 | $15 |
| Application Load Balancer | 1 ALB | $22 |
| RDS PostgreSQL | db.t3.micro, Multi-AZ | $50 |
| NAT Gateway | 1 NAT (single AZ) | $32 |
| EFS | 5 GB storage | $1.50 |
| Secrets Manager | 5 secrets | $2.50 |
| Data Transfer | ~100 GB/month | $9 |
| CloudWatch Logs | 5 GB/month | $2.50 |
| **Total** | | **~$134/month** |

#### Option 2: Iteration 3 (Cost-Optimized) ⭐
| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| ECS Fargate **Spot** | 0.5 vCPU, 1GB RAM, 24/7 | $5 |
| Application Load Balancer | 1 ALB | $22 |
| Aurora Serverless v2 | 0.5-2 ACU, pay-per-use | $15 |
| NAT Gateway | 1 NAT (single AZ) | $32 |
| S3 | 5 GB storage | $0.15 |
| Secrets Manager | 5 secrets | $2.50 |
| Data Transfer | ~100 GB/month | $9 |
| CloudWatch Logs | 5 GB/month | $2.50 |
| **Total** | | **~$88/month** |

#### Option 3: Minimal (Development/Testing)
| Service | Configuration | Monthly Cost |
|---------|--------------|-------------|
| EC2 t3.small | 24/7 | $15 |
| EBS Volume | 20 GB | $2 |
| Elastic IP | 1 IP | $0 |
| **Total** | | **~$17/month** |

### Cost Optimization Tips

1. **Use Fargate Spot** - 70% cost savings (interruption rate <5%)
2. **Single NAT Gateway** - $32/month savings (vs multi-AZ)
3. **Aurora Serverless v2** - Pay only for active time
4. **Reserved Capacity** - 40% savings if committing 1-3 years
5. **S3 vs EFS** - Use S3 for static assets ($0.023/GB vs $0.30/GB)
6. **Scheduled Scaling** - Scale down during off-hours (if applicable)

---

## Optimizations

### Performance Optimizations

1. **Enable CloudFront CDN** (Optional)
   - Cache n8n UI assets
   - Reduce latency for global access
   - Cost: $1-5/month

2. **Use ElastiCache Redis** (Optional)
   - Cache n8n workflow executions
   - Faster workflow runs
   - Cost: $15/month (t3.micro)

3. **Optimize Docker Image**
   ```dockerfile
   # Multi-stage build for smaller image
   FROM node:18-alpine AS builder
   # ... build steps

   FROM node:18-alpine
   COPY --from=builder /app /app
   # Final image: ~200MB vs 800MB
   ```

### Security Optimizations

1. **VPC Endpoints** - Private access to AWS services (no internet)
   - S3 VPC Endpoint: Free
   - Secrets Manager VPC Endpoint: $7/month
   - **Benefit:** Remove NAT Gateway ($32/month savings!)

2. **WAF (Web Application Firewall)**
   - Protect against DDoS, SQL injection
   - Cost: $5/month + $1 per million requests

3. **GuardDuty** - Threat detection
   - Cost: $5/month

### Monitoring Optimizations

1. **CloudWatch Dashboards**
   ```yaml
   Metrics to monitor:
   - ECS CPU/Memory utilization
   - RDS connections/queries
   - ALB response times
   - Workflow execution count
   - Failed executions
   ```

2. **CloudWatch Alarms**
   ```yaml
   Alarms:
   - ECS task failure (restart)
   - RDS CPU > 80% (scale up)
   - ALB 5xx errors > 10
   - Disk space < 20%
   ```

3. **X-Ray Tracing** (Optional)
   - Trace workflow execution paths
   - Debug performance issues
   - Cost: $5/month for 1M traces

---

## Migration Checklist

### Pre-Migration

- [ ] Export local n8n workflow: `iwatcher-gdrive-trigger.json`
- [ ] Backup `.env` file (API keys, credentials)
- [ ] Test workflow one final time locally
- [ ] Document any custom configurations
- [ ] Create AWS account (if not exists)
- [ ] Set up billing alerts ($100 threshold)

### AWS Setup

- [ ] Create AWS Secrets Manager secrets
  - [ ] Google OAuth credentials
  - [ ] Notion API token
  - [ ] AssemblyAI API key
  - [ ] OpenAI API key
  - [ ] n8n encryption key
- [ ] Deploy infrastructure (CDK or CloudFormation)
- [ ] Verify VPC, subnets, security groups
- [ ] Verify ECS service is running
- [ ] Verify RDS database is accessible

### n8n Configuration

- [ ] Access n8n UI via ALB URL
- [ ] Create admin user
- [ ] Set up OAuth credentials in n8n UI
- [ ] Import workflow via API
- [ ] Test workflow with sample audio file
- [ ] Verify Google Drive integration works
- [ ] Verify Notion integration works
- [ ] Activate workflow

### DNS & SSL

- [ ] Create ACM certificate for domain
- [ ] Update Route 53 with ALB DNS
- [ ] Verify HTTPS access
- [ ] Test webhook URLs (if used)

### Monitoring

- [ ] Set up CloudWatch dashboard
- [ ] Configure alarms (CPU, memory, errors)
- [ ] Enable CloudWatch Logs
- [ ] Set up SNS notifications (email/SMS)

### Post-Migration

- [ ] Run 5 test audio files through workflow
- [ ] Verify all outputs (Google Drive, Notion)
- [ ] Monitor costs for 24 hours
- [ ] Document any issues encountered
- [ ] Stop local Docker containers
- [ ] Clean up local test files

---

## Recommended Deployment: 3-Step Plan

### Step 1: Deploy Infrastructure (1 hour)
```bash
# Clone CDK infrastructure
cd infrastructure

# Install dependencies
npm install

# Bootstrap CDK (one-time)
cdk bootstrap

# Deploy stack
cdk deploy IWatcherStack \
  --parameters NotionDatabaseId=${NOTION_DATABASE_ID} \
  --parameters GoogleFolderId=${GOOGLE_FOLDER_ID}
```

### Step 2: Import Workflow (15 min)
```bash
# Get n8n URL from CDK output
N8N_URL=$(aws cloudformation describe-stacks \
  --stack-name IWatcherStack \
  --query 'Stacks[0].Outputs[?OutputKey==`N8nUrl`].OutputValue' \
  --output text)

# Access n8n UI
open https://${N8N_URL}

# Create API key in n8n UI
# Then import workflow
export N8N_API_KEY="your-api-key"
python3 import-workflow.py --url ${N8N_URL}
```

### Step 3: Configure & Test (30 min)
```bash
# Set up OAuth credentials in n8n UI
# Activate workflow
# Upload test audio to Google Drive "New" folder
# Verify processing in CloudWatch Logs
```

---

## Next Steps

1. **Review this plan** - Confirm architecture choice
2. **Choose deployment option:**
   - **Option A:** Cost-Optimized ECS (~$88/month) ⭐ Recommended
   - **Option B:** Simple EC2 (~$17/month) - Testing only
   - **Option C:** Full HA ECS (~$134/month) - Enterprise
3. **Create CDK stack** (if not exists)
4. **Deploy to AWS**
5. **Monitor for 24 hours**
6. **Optimize based on usage**

---

## Support & Troubleshooting

### Common Issues

1. **ECS task fails to start**
   - Check CloudWatch Logs: `/aws/ecs/iwatcher-n8n`
   - Verify Secrets Manager permissions
   - Check RDS connectivity

2. **Workflow not triggering**
   - Verify Google Drive OAuth token refresh
   - Check n8n polling schedule
   - Review CloudWatch metrics

3. **High costs**
   - Check NAT Gateway data transfer
   - Review CloudWatch Logs retention
   - Consider reserved capacity

### AWS Support Resources

- **AWS Documentation:** https://docs.aws.amazon.com/ecs/
- **n8n Docs:** https://docs.n8n.io/hosting/
- **Community Forum:** https://community.n8n.io/

---

## Conclusion

**Recommended Path:**

1. ✅ **Start with Cost-Optimized ECS** (~$88/month)
2. ✅ **Deploy in 2-3 hours** using CDK
3. ✅ **Monitor for 1 week**
4. ✅ **Optimize based on real usage**

This gives you:
- Production-ready infrastructure
- 99.9% uptime SLA
- Auto-scaling
- Secure credential management
- Full observability
- **70% cost savings vs full HA**

Ready to deploy? Let's build the CDK stack! 🚀
