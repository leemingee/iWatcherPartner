# Credentials Setup Guide

**How credentials work in iWatcher deployment** - everything you need to know.

---

## 🔑 Credential Types

iWatcher uses two types of credentials:

### 1. API Keys (Environment Variables) ✅ Automated
- AssemblyAI API Key
- OpenAI API Key
- Notion API Token
- Notion Database ID

**How they're configured:**
- Passed as environment variables to Docker container
- No manual upload needed
- Stored securely in container environment
- Persist across restarts (with volume mount)

### 2. OAuth Credentials (Google Drive) ⚠️ Manual Setup Required
- Google Drive OAuth2
- Client ID and Client Secret from Google Cloud Console

**Why manual setup:**
- OAuth requires browser-based authentication flow
- Cannot be automated via n8n API
- Requires user to click "Sign in with Google"
- One-time setup per deployment

---

## 📋 Setup Method: Environment Variables (No Upload Script Needed)

**You asked:** "I think there was one script to upload the credentials to AWS, is that still needed?"

**Answer:** No separate upload script is needed!

**Why:** Credentials are passed directly to the Docker container via environment variables when you start it.

### How It Works:

```bash
# On EC2 instance, set your API keys
export ASSEMBLYAI_API_KEY="your_key_here"
export OPENAI_API_KEY="your_key_here"
export NOTION_API_TOKEN="your_token_here"
export NOTION_DATABASE_ID="your_db_id_here"

# Start container with credentials
sudo docker run -d --name n8n --restart unless-stopped \
  -p 80:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NOTION_API_TOKEN=$NOTION_API_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DATABASE_ID \
  n8nio/n8n:latest
```

**That's it!** The workflow accesses these via `{{$env.ASSEMBLYAI_API_KEY}}` syntax.

---

## 📦 Complete Docker Command Reference

### Method 1: Using .env File (RECOMMENDED) ⭐

**Best for:** Production deployments, easier credential management, cleaner commands

**Step 1: Create .env file on EC2**

```bash
# Create .env file
cat > /home/ec2-user/.env << 'EOF'
# iWatcher AWS Deployment - Environment Variables
ASSEMBLYAI_API_KEY=your_assemblyai_key_here
OPENAI_API_KEY=your_openai_key_here
NOTION_API_TOKEN=your_notion_token_here
NOTION_DATABASE_ID=your_notion_db_id_here
EOF

# Secure the file (read/write for owner only)
chmod 600 /home/ec2-user/.env
```

**Step 2: Start n8n with --env-file**

```bash
sudo docker run -d --name n8n --restart unless-stopped \
  --network bridge \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  --env-file /home/ec2-user/.env \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=https://iwatcher.even-study.us \
  n8nio/n8n:latest
```

**Flag Explanations:**

| Flag | Purpose | Why Needed |
|------|---------|------------|
| `-d` | Run in detached mode (background) | Keeps container running after terminal closes |
| `--name n8n` | Container name | Easy reference for `docker stop/start/logs n8n` |
| `--restart unless-stopped` | Auto-restart on failure | Survives EC2 reboots, only stops if manually stopped |
| `--network bridge` | Bridge network mode | Default Docker networking |
| `-p 127.0.0.1:5678:5678` | Port mapping (localhost only) | nginx proxies external traffic, n8n not exposed directly |
| `-v /home/ec2-user/.n8n:/home/node/.n8n` | Volume mount | **CRITICAL** - Persists workflows, credentials, database |
| `--env-file /home/ec2-user/.env` | Load environment variables from file | Loads API keys from .env file |
| `-e N8N_ENCRYPTION_KEY=...` | n8n encryption key | Encrypts OAuth credentials in database |
| `-e N8N_SECURE_COOKIE=false` | Disable secure cookie requirement | Allows HTTP on localhost (nginx handles HTTPS) |
| `-e WEBHOOK_URL=https://...` | Webhook base URL | n8n generates webhook URLs with this domain |
| `n8nio/n8n:latest` | Docker image | Official n8n image from Docker Hub |

**Pros:**
- ✅ Clean command - only 4 custom -e flags
- ✅ Easy to update credentials - edit .env file, restart container
- ✅ Credentials in one file - simpler backup/rotation
- ✅ File permissions control - chmod 600 restricts access

**Cons:**
- ⚠️ Must create .env file on EC2 first
- ⚠️ File must have correct permissions (600)

---

### Method 2: Individual -e Flags

**Best for:** Quick testing, single-command deployment, automation scripts

```bash
# First, set shell variables (these only exist in your SSH session)
export ASSEMBLYAI_API_KEY="your_assemblyai_key_here"
export OPENAI_API_KEY="your_openai_key_here"
export NOTION_API_TOKEN="your_notion_token_here"
export NOTION_DATABASE_ID="your_notion_db_id_here"

# Start n8n with individual -e flags
sudo docker run -d --name n8n --restart unless-stopped \
  --network bridge \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NOTION_API_TOKEN=$NOTION_API_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DATABASE_ID \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=https://iwatcher.even-study.us \
  n8nio/n8n:latest
```

**⚠️ IMPORTANT:** Variables must be exported in shell BEFORE running docker command. If you don't export them, Docker will pass empty strings!

**Verify variables are set:**
```bash
echo $ASSEMBLYAI_API_KEY  # Should print your key
echo $OPENAI_API_KEY      # Should print sk-proj-...
```

**Pros:**
- ✅ Single command deployment
- ✅ No file creation needed
- ✅ Good for scripted deployments

**Cons:**
- ❌ Must export variables first (easy to forget)
- ❌ Variables lost when SSH session ends
- ❌ Longer command to type/maintain
- ❌ Credentials visible in shell history

---

### Method 3: Hardcoded Values (NOT RECOMMENDED)

```bash
# ⚠️ AVOID IN PRODUCTION - credentials visible in docker inspect and history
sudo docker run -d --name n8n --restart unless-stopped \
  -e ASSEMBLYAI_API_KEY=your_actual_key_here \
  -e OPENAI_API_KEY=sk-proj-your_key_here \
  # ... rest of command
```

**Why to avoid:**
- ❌ Credentials stored in Docker container metadata (`docker inspect n8n` shows them)
- ❌ Visible in shell history (`.bash_history`)
- ❌ Exposed if command is logged or shared

**Only acceptable for:**
- Local testing
- Throwaway development environments

---

### Updating Environment Variables After Deployment

If you need to update API keys after n8n is already running:

**Option A: Update .env file and restart (RECOMMENDED)**

```bash
# 1. Edit .env file
nano /home/ec2-user/.env

# 2. Update the key(s) you need to change
# (Save and exit: Ctrl+X, Y, Enter)

# 3. Restart container to load new values
sudo docker stop n8n
sudo docker rm n8n

# 4. Start with same command as before
sudo docker run -d --name n8n --restart unless-stopped \
  --network bridge \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  --env-file /home/ec2-user/.env \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=https://iwatcher.even-study.us \
  n8nio/n8n:latest
```

**Option B: Restart with new -e flags**

```bash
# 1. Export new values
export OPENAI_API_KEY="sk-proj-NEW-KEY-HERE"

# 2. Stop and remove old container
sudo docker stop n8n
sudo docker rm n8n

# 3. Start with new values
sudo docker run -d --name n8n --restart unless-stopped \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  # ... (rest of command)
```

**⚠️ Important:** Data persists because of volume mount (`-v /home/ec2-user/.n8n`). Workflows, credentials, and execution history are NOT lost when you remove the container.

---

### Verifying Environment Variables Are Loaded

After starting the container, always verify credentials loaded correctly:

```bash
# Check all environment variables in container
sudo docker exec n8n env

# Check specific variable
sudo docker exec n8n env | grep ASSEMBLYAI_API_KEY

# Should output:
# ASSEMBLYAI_API_KEY=6cd39200b3ee44f4a1691c69893xxxxx

# Check all iWatcher variables
sudo docker exec n8n env | grep -E "(ASSEMBLYAI|OPENAI|NOTION)"
```

**Expected output:**
```
ASSEMBLYAI_API_KEY=6cd39200b3ee44f4a1691c69893xxxxx
OPENAI_API_KEY=sk-proj-IdvK2Fb...xxxxx
NOTION_API_TOKEN=ntn_108042747014D4tj6Q2QtK0pDODxxxxxxxxx
NOTION_DATABASE_ID=e99a7433-b73e-48ad-9459-07de1de840fb
```

**If variables are empty or missing:**
- Check .env file exists: `cat /home/ec2-user/.env`
- Check .env file permissions: `ls -l /home/ec2-user/.env` (should be `-rw-------`)
- Verify Docker command used `--env-file` flag
- For -e method: verify shell variables were exported before docker run

---

### Common Issues and Debugging

#### Issue: "Environment variable not found" in workflow

**Error:** Node shows `$env.ASSEMBLYAI_API_KEY is undefined`

**Debug:**
```bash
# 1. Check if variable exists in container
sudo docker exec n8n env | grep ASSEMBLYAI_API_KEY

# If empty or not found:
# 2. Check .env file on host
cat /home/ec2-user/.env

# 3. Check if container was started with --env-file
sudo docker inspect n8n | grep -A 10 Args

# 4. Restart container with correct flags
```

#### Issue: Variables were set but are now empty

**Cause:** Used Method 2 (-e flags) but didn't export variables in current shell session

**Solution:**
```bash
# Variables must be exported BEFORE docker run
export ASSEMBLYAI_API_KEY="your_key"
# Then run docker command
```

#### Issue: Updated .env file but container still uses old values

**Cause:** Container doesn't auto-reload environment variables

**Solution:**
```bash
# Must restart container to load new .env values
sudo docker stop n8n
sudo docker rm n8n
# Run docker run command again
```

---

## 🔐 AWS Secrets Manager (Optional Advanced Setup)

If you want extra security, you can store credentials in AWS Secrets Manager instead of directly in environment variables.

### Setup:

```bash
# 1. Create secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name iwatcher/assemblyai-key \
  --secret-string "your_assemblyai_key"

aws secretsmanager create-secret \
  --name iwatcher/openai-key \
  --secret-string "your_openai_key"

aws secretsmanager create-secret \
  --name iwatcher/notion-token \
  --secret-string "your_notion_token"

aws secretsmanager create-secret \
  --name iwatcher/notion-db-id \
  --secret-string "your_notion_db_id"

# 2. Retrieve secrets in EC2 user-data script
ASSEMBLYAI_KEY=$(aws secretsmanager get-secret-value \
  --secret-id iwatcher/assemblyai-key \
  --query SecretString --output text)

OPENAI_KEY=$(aws secretsmanager get-secret-value \
  --secret-id iwatcher/openai-key \
  --query SecretString --output text)

NOTION_TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id iwatcher/notion-token \
  --query SecretString --output text)

NOTION_DB_ID=$(aws secretsmanager get-secret-value \
  --secret-id iwatcher/notion-db-id \
  --query SecretString --output text)

# 3. Start container with retrieved secrets
sudo docker run -d --name n8n --restart unless-stopped \
  -p 80:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_KEY \
  -e OPENAI_API_KEY=$OPENAI_KEY \
  -e NOTION_API_TOKEN=$NOTION_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DB_ID \
  n8nio/n8n:latest
```

**Cost:** ~$0.40/month per secret (4 secrets = ~$1.60/month)

**When to use:**
- Production deployments with compliance requirements
- Team environments where credentials need rotation
- Auto-scaling setups with multiple instances

**When NOT needed:**
- Personal/single-user deployments
- Testing environments
- If you're comfortable with environment variables

---

## 🌐 Google OAuth Setup (Manual - Cannot Be Automated)

This is the **only manual step** that requires human interaction.

### Why Manual?

OAuth authentication requires:
1. User clicks "Sign in with Google"
2. Google shows permission screen
3. User approves access
4. Google redirects back to n8n with authorization code
5. n8n exchanges code for access token

**This cannot be automated** because Google requires human approval for security.

### Step-by-Step:

#### 1. Create Google OAuth Credentials

Go to https://console.cloud.google.com:

```
1. Create project (or select existing)
2. Enable Google Drive API
3. Create OAuth 2.0 Client ID
   - Application type: Web application
   - Name: iWatcher n8n
   - Authorized redirect URIs:
     * For initial setup: http://localhost:8888/rest/oauth2-credential/callback
     * For production (HTTPS): https://n8n.yourdomain.com/rest/oauth2-credential/callback
4. Copy Client ID and Client Secret
```

#### 2. Access n8n UI

**Before HTTPS (during setup):**
```bash
# Create SSM tunnel
aws ssm start-session \
  --target i-XXXXXXXXXXXXX \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8888"]}'

# Access at: http://localhost:8888
```

**After HTTPS setup:**
```
# Access directly at: https://n8n.yourdomain.com
```

#### 3. Configure Credential in n8n

```
1. In n8n UI: Settings → Credentials
2. Click "Add Credential"
3. Search: "Google Drive OAuth2 API"
4. Fill in:
   - Credential Name: Google Drive OAuth
   - Client ID: (from Google Console)
   - Client Secret: (from Google Console)
   - Scope: (leave default)
5. Click "Sign in with Google"
6. Google popup opens → Select account → Grant permissions
7. Redirect back to n8n → Credential saved ✅
```

#### 4. Use in Workflow

The workflow nodes automatically reference this credential:
- Google Drive Trigger → Uses "Google Drive OAuth"
- Download from Google Drive → Uses "Google Drive OAuth"
- Move to Completed → Uses "Google Drive OAuth"
- Upload to Google Drive → Uses "Google Drive OAuth"

**No code changes needed!** n8n handles authentication automatically.

---

## 📝 What Persists vs What Doesn't

Understanding persistence is critical to avoid losing data and credentials.

### Persistence Matrix

| Data Type | Storage Location | Persists After... | Requires Volume Mount? | Notes |
|-----------|------------------|-------------------|------------------------|-------|
| **Workflows** | `/home/node/.n8n/database.sqlite` | ✅ Container restart<br>✅ Container removal<br>✅ EC2 reboot | ✅ **YES** | Lost without `-v` mount |
| **OAuth Credentials** (Google Drive) | `/home/node/.n8n/database.sqlite` | ✅ Container restart<br>✅ Container removal<br>✅ EC2 reboot | ✅ **YES** | Encrypted with `N8N_ENCRYPTION_KEY` |
| **n8n Admin Account** | `/home/node/.n8n/database.sqlite` | ✅ Container restart<br>✅ Container removal<br>✅ EC2 reboot | ✅ **YES** | Lost without `-v` mount |
| **Workflow Execution History** | `/home/node/.n8n/database.sqlite` | ✅ Container restart<br>✅ Container removal<br>✅ EC2 reboot | ✅ **YES** | Logs persist in database |
| **Environment Variables** (API Keys) | Docker container config | ❌ Container removal<br>✅ Container restart<br>❌ EC2 reboot (if not in startup script) | ❌ NO | Must be re-specified in `docker run` |
| **.env File** | `/home/ec2-user/.env` | ✅ Container restart<br>✅ Container removal<br>✅ EC2 reboot | N/A | Lives on host, not in container |
| **nginx Config** | `/etc/nginx/conf.d/n8n.conf` | ✅ EC2 reboot<br>✅ Container restart | N/A | Lives on host, not in container |
| **SSL Certificates** | `/etc/letsencrypt/` | ✅ EC2 reboot<br>✅ Container restart | N/A | Lives on host, auto-renews |
| **Docker Image** | Docker daemon | ✅ Container removal<br>✅ EC2 reboot | N/A | Pulled once, stays until `docker rmi` |

### Scenario Analysis

#### Scenario 1: `docker restart n8n`

**What persists:**
- ✅ Workflows
- ✅ OAuth credentials
- ✅ Execution history
- ✅ Environment variables (already loaded in container)
- ✅ n8n admin account

**What's lost:**
- ❌ Nothing (safest operation)

**When to use:** After editing .env file (requires `docker stop` + `docker rm` + `docker run` to reload env vars)

---

#### Scenario 2: `docker stop n8n` + `docker rm n8n` + `docker run ...`

**What persists (with volume mount):**
- ✅ Workflows (in `/home/ec2-user/.n8n/`)
- ✅ OAuth credentials (in `/home/ec2-user/.n8n/database.sqlite`)
- ✅ Execution history
- ✅ n8n admin account
- ✅ .env file (on host)

**What's lost:**
- ❌ Environment variables **UNLESS** re-specified in new `docker run` command
- ❌ Container logs (use `docker logs n8n` before removing if needed)

**When to use:**
- Updating environment variables
- Changing Docker flags (ports, volumes, etc.)
- Upgrading n8n version

**⚠️ CRITICAL:** Must include same volume mount in new `docker run` command:
```bash
-v /home/ec2-user/.n8n:/home/node/.n8n
```

---

#### Scenario 3: EC2 Instance Reboot

**What persists:**
- ✅ Workflows (in EBS volume `/home/ec2-user/.n8n/`)
- ✅ OAuth credentials
- ✅ .env file
- ✅ nginx config
- ✅ SSL certificates
- ✅ Docker image

**What's lost:**
- ❌ n8n container **UNLESS** `--restart unless-stopped` flag was used
- ❌ Shell environment variables (`export` commands)

**Auto-recovery:**
```bash
# If container had --restart unless-stopped, it auto-starts
docker ps  # Should show n8n running

# If not, manually start:
sudo docker start n8n
```

**⚠️ Note:** If you need to run a new `docker run` command after reboot, environment variables from .env file won't be loaded automatically. You must:
- Option A: Use `--env-file /home/ec2-user/.env`
- Option B: Export variables first, then use `-e` flags

---

#### Scenario 4: Deleting Volume Mount Directory

**If you run:** `sudo rm -rf /home/ec2-user/.n8n`

**What's lost:**
- ❌ ALL workflows
- ❌ ALL OAuth credentials (must reconfigure Google Drive)
- ❌ Execution history
- ❌ n8n admin account (must recreate)

**What persists:**
- ✅ .env file (separate location: `/home/ec2-user/.env`)
- ✅ nginx config
- ✅ SSL certificates

**Recovery:** **NONE** - This is permanent data loss!

**Backup strategy:**
```bash
# Before deleting, backup database
sudo cp /home/ec2-user/.n8n/database.sqlite ~/n8n-backup-$(date +%Y%m%d).sqlite

# Or backup entire directory
sudo tar -czf ~/n8n-backup-$(date +%Y%m%d).tar.gz /home/ec2-user/.n8n
```

---

### How Credentials Are Stored

**Environment Variables (API Keys):**
- **Stored in:** Docker container environment (memory)
- **Persistence:** Defined in `docker run` command
- **Restart behavior:** Must be re-specified on container removal/recreation
- **Security:** Only visible inside container (`docker exec n8n env`)
- **Access in workflow:** `{{$env.ASSEMBLYAI_API_KEY}}`

**OAuth Tokens (Google Drive):**
- **Stored in:** n8n database (SQLite)
- **File location:** `/home/node/.n8n/database.sqlite` (inside container)
- **Host location:** `/home/ec2-user/.n8n/database.sqlite` (with volume mount)
- **Persistence:** **YES** (with volume mount `-v /home/ec2-user/.n8n:/home/node/.n8n`)
- **Restart behavior:** Automatically loaded on container restart
- **Security:** Encrypted with `N8N_ENCRYPTION_KEY`
- **Access in workflow:** Automatically managed by Google Drive nodes

---

### Volume Mount: The Critical Flag

```bash
# ✅ CORRECT - All data persists
-v /home/ec2-user/.n8n:/home/node/.n8n

# ❌ WRONG - ALL DATA LOST on container removal!
# (no volume mount)
```

**Without volume mount, you lose:**
- ❌ All workflows
- ❌ OAuth credentials (must reconfigure every restart)
- ❌ n8n admin account
- ❌ Execution history
- ❌ All workflow settings

**Setup volume mount directory:**
```bash
# Create directory with correct ownership
sudo mkdir -p /home/ec2-user/.n8n
sudo chown -R 1000:1000 /home/ec2-user/.n8n

# Verify ownership
ls -la /home/ec2-user/.n8n
# Should show: drwxr-xr-x 2 1000 1000
```

**Why UID 1000?** n8n Docker container runs as user ID 1000 inside the container. Host directory must match this UID for write permissions.

---

## 🧪 Testing Credentials

Use `test-complete-pipeline.py` to verify all credentials are configured:

```bash
python3 test-complete-pipeline.py
```

**Expected output:**
```
🔍 Checking environment variables...
   ✅ ASSEMBLYAI_API_KEY: 12345678...
   ✅ OPENAI_API_KEY: sk-proj-...
   ✅ NOTION_API_TOKEN: ntn_...
   ✅ NOTION_DATABASE_ID: abc123...

🔍 Checking n8n health...
   ✅ n8n is running
   Total workflows: 1
   Active workflows: 1
   iWatcher workflow: 🟢 Active

🔍 Checking Notion database...
   ✅ Notion database accessible
   Recent entries: 5
```

---

## 🔄 Credential Rotation

### Rotating API Keys:

```bash
# 1. Generate new API key from provider
# 2. Update environment variable
export NEW_OPENAI_KEY="sk-proj-new-key-here"

# 3. Restart container with new key
sudo docker stop n8n
sudo docker rm n8n
sudo docker run -d --name n8n --restart unless-stopped \
  -p 80:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e OPENAI_API_KEY=$NEW_OPENAI_KEY \
  # ... (other env vars)
  n8nio/n8n:latest

# 4. Test workflow execution
```

**No workflow changes needed** - nodes automatically use new environment variable.

### Rotating Google OAuth:

```bash
# 1. Create new OAuth Client ID in Google Console
# 2. In n8n UI:
#    - Delete old "Google Drive OAuth" credential
#    - Create new credential with new Client ID/Secret
#    - Complete OAuth flow
# 3. Update workflow nodes to use new credential (if renamed)
```

---

## ✅ Complete Deployment & Verification Checklist

Follow this comprehensive checklist when deploying iWatcher to ensure everything works correctly.

---

### Phase 1: Pre-Deployment (Gather Credentials)

- [ ] **AssemblyAI API Key**
  - Sign up at https://www.assemblyai.com/
  - Navigate to Dashboard → API Keys
  - Copy API key (starts with alphanumeric string)
  - Save to local .env file

- [ ] **OpenAI API Key**
  - Sign up at https://platform.openai.com/
  - Go to API Keys section
  - Create new secret key (starts with `sk-proj-`)
  - Save to local .env file
  - **⚠️ Important:** Copy immediately, can't view again later

- [ ] **Notion Integration**
  - Create integration at https://www.notion.so/my-integrations
  - Copy "Internal Integration Token" (starts with `ntn_` or `secret_`)
  - Open your Notion database
  - Click "..." → Add connections → Select your integration
  - Copy database ID from URL: `notion.so/[workspace]/[DATABASE_ID]?v=...`
  - Save both token and database ID to .env file

- [ ] **Google OAuth Credentials**
  - Go to https://console.cloud.google.com/
  - Create project or select existing
  - Enable Google Drive API
  - Create OAuth 2.0 Client ID (Web application)
  - Add authorized redirect URIs:
    - Initial setup: `http://localhost:8888/rest/oauth2-credential/callback`
    - Production HTTPS: `https://your-domain.com/rest/oauth2-credential/callback`
  - Copy Client ID and Client Secret
  - Save for later (will configure in n8n UI)

---

### Phase 2: AWS Infrastructure Setup

- [ ] **Deploy EC2 Instance**
  - Instance type: t3.small minimum (2 vCPU, 2 GB RAM)
  - Amazon Linux 2 or Amazon Linux 2023
  - Security group configured:
    - Port 22 (SSH) - optional, SSM recommended instead
    - Port 80 (HTTP) - required for initial access
    - **Port 443 (HTTPS) - REQUIRED for HTTPS access** ⚠️
  - IAM role with SSM permissions (for Systems Manager access)
  - EBS volume: 20 GB minimum

- [ ] **Verify Security Group Port 443**
  ```bash
  # Get security group ID
  aws ec2 describe-instances --instance-ids YOUR_INSTANCE_ID \
    --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
    --output text

  # Check if port 443 is open
  aws ec2 describe-security-groups --group-ids sg-YOUR_ID \
    --query 'SecurityGroups[0].IpPermissions[?ToPort==`443`]'

  # If empty, open port 443
  aws ec2 authorize-security-group-ingress \
    --group-id sg-YOUR_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0
  ```

- [ ] **DNS Configuration**
  - Create A record pointing to EC2 public IP
  - Subdomain: `n8n.your-domain.com` or `iwatcher.your-domain.com`
  - Verify DNS propagation: `nslookup your-domain.com`

---

### Phase 3: n8n Container Deployment

- [ ] **Create .env File on EC2**
  ```bash
  # Connect via SSM
  aws ssm start-session --target i-YOUR_INSTANCE_ID

  # Create .env file
  cat > /home/ec2-user/.env << 'EOF'
  ASSEMBLYAI_API_KEY=your_key_here
  OPENAI_API_KEY=your_key_here
  NOTION_API_TOKEN=your_token_here
  NOTION_DATABASE_ID=your_db_id_here
  EOF

  # Secure the file
  chmod 600 /home/ec2-user/.env
  ```

- [ ] **Verify .env File**
  ```bash
  cat /home/ec2-user/.env  # Should show all 4 keys
  ls -l /home/ec2-user/.env  # Should show -rw------- permissions
  ```

- [ ] **Create Volume Mount Directory**
  ```bash
  sudo mkdir -p /home/ec2-user/.n8n
  sudo chown -R 1000:1000 /home/ec2-user/.n8n
  ls -la /home/ec2-user/ | grep .n8n  # Verify ownership: 1000 1000
  ```

- [ ] **Start n8n Container**
  ```bash
  sudo docker run -d --name n8n --restart unless-stopped \
    --network bridge \
    -p 127.0.0.1:5678:5678 \
    -v /home/ec2-user/.n8n:/home/node/.n8n \
    --env-file /home/ec2-user/.env \
    -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
    -e N8N_SECURE_COOKIE=false \
    -e WEBHOOK_URL=https://your-domain.com \
    n8nio/n8n:latest
  ```

- [ ] **Verify Container Running**
  ```bash
  sudo docker ps | grep n8n
  # Should show: Up X seconds, 127.0.0.1:5678->5678/tcp

  sudo docker logs n8n --tail 20
  # Should show: "Editor is now accessible via: http://localhost:5678"
  ```

- [ ] **Verify Environment Variables Loaded**
  ```bash
  sudo docker exec n8n env | grep -E "(ASSEMBLYAI|OPENAI|NOTION)"
  # Should show all 4 API keys with actual values (not empty)
  ```

---

### Phase 4: HTTPS Setup (Let's Encrypt + nginx)

- [ ] **Install nginx and Certbot**
  ```bash
  sudo yum install -y nginx
  # Follow HTTPS-DOMAIN-SETUP.md for certbot installation
  ```

- [ ] **Obtain SSL Certificate**
  ```bash
  sudo docker stop n8n  # Free port 80 for verification
  sudo certbot certonly --standalone -d your-domain.com
  sudo docker start n8n
  ```

- [ ] **Configure nginx with Timeout Settings**
  - Create `/etc/nginx/conf.d/n8n.conf`
  - Include `proxy_connect_timeout 300`, `proxy_read_timeout 300`, `proxy_send_timeout 300`
  - Configure WebSocket support with 86400s timeout

- [ ] **Test nginx Configuration**
  ```bash
  sudo nginx -t  # Should show: syntax is ok, test is successful
  ```

- [ ] **Start nginx**
  ```bash
  sudo service nginx start
  sudo chkconfig nginx on  # Enable on boot
  ```

- [ ] **Verify HTTPS Access**
  ```bash
  curl -I https://your-domain.com
  # Should return: HTTP/2 200
  ```

---

### Phase 5: Workflow Import & Activation

- [ ] **Import Workflow**
  - Option A: Use `setup.py` script
    ```bash
    export N8N_URL="https://your-domain.com"
    export N8N_API_KEY="your_api_key"
    python3 setup.py
    ```
  - Option B: Manual import via n8n UI
    - Access https://your-domain.com
    - Create admin account
    - Import `iwatcher-gdrive-trigger.json`

- [ ] **Configure Google OAuth in n8n**
  - Settings → Credentials → Add Credential
  - Type: "Google Drive OAuth2 API"
  - Name: "Google Drive OAuth"
  - Client ID: (from Google Console)
  - Client Secret: (from Google Console)
  - Click "Sign in with Google" → Authorize

- [ ] **Activate Workflow**
  - Open workflow in editor
  - Toggle "Active" switch in top-right
  - Verify status shows "Active" (not "Inactive")

---

### Phase 6: Post-Deployment Verification ⚠️ CRITICAL

This is the most important phase - verify everything actually works!

#### ✅ Step 1: Environment Variables Check

```bash
# On EC2, verify all API keys loaded
sudo docker exec n8n env | grep ASSEMBLYAI_API_KEY
sudo docker exec n8n env | grep OPENAI_API_KEY
sudo docker exec n8n env | grep NOTION_API_TOKEN
sudo docker exec n8n env | grep NOTION_DATABASE_ID

# Each should show the actual key value (not empty)
```

**Expected:** All 4 variables show values
**If empty:** Container wasn't started with `--env-file` flag - restart container

---

#### ✅ Step 2: n8n API Health Check

```bash
# Set API key
export N8N_API_KEY="your_api_key"

# Check workflow status
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  https://your-domain.com/api/v1/workflows
```

**Expected:** JSON response showing workflow list
**If 401 Unauthorized:** API key incorrect
**If connection refused:** nginx or n8n not running

---

#### ✅ Step 3: Workflow Active Status

```bash
# Check if workflow is active
curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
  https://your-domain.com/api/v1/workflows | jq '.data[] | {id, name, active}'
```

**Expected:** `"active": true` for iWatcher workflow
**If false:** Activate in UI or via API

---

#### ✅ Step 4: Test Pipeline Script

```bash
# From local machine
export N8N_URL="https://your-domain.com"
export N8N_API_KEY="your_api_key"
export NOTION_API_TOKEN="your_token"
export NOTION_DATABASE_ID="your_db_id"

python3 test-complete-pipeline.py
```

**Expected output:**
```
✅ n8n is running
✅ ASSEMBLYAI_API_KEY: 6cd39200b3...
✅ OPENAI_API_KEY: sk-proj-Id...
✅ NOTION_API_TOKEN: ntn_108042...
✅ NOTION_DATABASE_ID: e99a7433-b73e...
✅ Notion database accessible
   iWatcher workflow: 🟢 Active
```

**If any ❌ appears:** Fix that specific issue before proceeding

---

#### ✅ Step 5: End-to-End Test with Real Audio File

- [ ] **Upload Test Audio**
  - Create test audio file (M4A, MP3, or WAV)
  - Upload to Google Drive "New" folder
  - Workflow should trigger automatically within 1 minute

- [ ] **Monitor Execution**
  ```bash
  # Watch n8n logs
  sudo docker logs -f n8n

  # Or use API to check executions
  curl -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "https://your-domain.com/api/v1/executions?limit=1" | jq
  ```

- [ ] **Verify Expected Behavior**
  - Execution status: `"status": "success"`
  - Duration: 2-5 minutes (depends on audio length)
  - No errors in workflow nodes

- [ ] **Check Outputs**
  - **Notion:** New entry created with title, transcript, summary
  - **Google Drive "Completed" folder:** Original audio file moved
  - **Google Drive "Completed" folder:** New `.txt` transcript file uploaded

---

#### ✅ Step 6: Restart Persistence Test

Critical test to ensure data persists after restart!

```bash
# Stop and remove container
sudo docker stop n8n
sudo docker rm n8n

# Restart with same command
sudo docker run -d --name n8n --restart unless-stopped \
  --network bridge \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  --env-file /home/ec2-user/.env \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=https://your-domain.com \
  n8nio/n8n:latest

# Wait 30 seconds for startup
sleep 30

# Access n8n UI
# Open https://your-domain.com
```

**Verify after restart:**
- [ ] Admin account still exists (no re-registration needed)
- [ ] Workflow still present
- [ ] Workflow still active (green "Active" status)
- [ ] Google OAuth credential still connected (no re-authorization needed)
- [ ] Execution history preserved
- [ ] Environment variables loaded (test with workflow execution)

**If any data lost:** Volume mount issue - check `/home/ec2-user/.n8n` exists and has correct ownership

---

#### ✅ Step 7: nginx Timeout Test

Test that nginx doesn't timeout on longer requests.

```bash
# Trigger workflow with longer audio file (5+ minutes)
# Monitor for 504 Gateway Timeout errors

# If 504 occurs, check nginx timeout settings:
sudo cat /etc/nginx/conf.d/n8n.conf | grep timeout

# Should show:
# proxy_connect_timeout 300;
# proxy_read_timeout 300;
# proxy_send_timeout 300;
```

**Expected:** No 504 errors even for long-running workflows
**If 504 occurs:** Update nginx config with higher timeouts, reload nginx

---

#### ✅ Step 8: SSL Certificate Auto-Renewal Test

```bash
# Test renewal (dry run, doesn't actually renew)
sudo certbot renew --dry-run
```

**Expected:** "Congratulations, all simulated renewals succeeded"
**If fails:** Check certbot logs, verify DNS still points to server

---

### Phase 7: Production Readiness

- [ ] **Backup Strategy**
  ```bash
  # Create backup of n8n database
  sudo cp /home/ec2-user/.n8n/database.sqlite \
    ~/n8n-backup-$(date +%Y%m%d).sqlite

  # Backup .env file
  sudo cp /home/ec2-user/.env ~/env-backup-$(date +%Y%m%d)
  ```

- [ ] **Monitoring Setup**
  - Set up CloudWatch alarms for EC2 CPU/memory
  - Monitor n8n execution success rate
  - Configure SNS notifications for failures

- [ ] **Documentation**
  - Document your specific domain name
  - Save Google OAuth Client ID/Secret securely
  - Document n8n API key location
  - Save backup of workflow JSON

- [ ] **Update Google OAuth for HTTPS**
  - Google Cloud Console → OAuth Client → Edit
  - Remove: `http://localhost:8888/rest/oauth2-credential/callback`
  - Ensure: `https://your-domain.com/rest/oauth2-credential/callback` is listed
  - Save changes

- [ ] **Security Hardening**
  - Disable port 22 if using SSM exclusively
  - Restrict port 80 (only needed for Let's Encrypt renewal)
  - Enable AWS CloudTrail logging
  - Review IAM role permissions (principle of least privilege)

---

### 🎉 Deployment Complete!

If all checkboxes are ✅, your iWatcher deployment is production-ready!

**Final sanity check:**
- HTTPS access works: https://your-domain.com
- Workflow triggers on Google Drive upload
- Audio is transcribed successfully
- Outputs appear in Notion and Google Drive
- System survives container restart
- System survives EC2 reboot (with `--restart unless-stopped`)

**Ongoing maintenance:**
- Check execution history weekly
- Monitor API usage (AssemblyAI, OpenAI credits)
- Verify SSL certificate auto-renewed (every 90 days)
- Update n8n version quarterly: `docker pull n8nio/n8n:latest`

---

## 🆘 Troubleshooting

### "Environment variable not found"

**Error in workflow:** `Error: $env.OPENAI_API_KEY is undefined`

**Solution:**
```bash
# Check if variable is set in container
sudo docker exec -it n8n env | grep OPENAI_API_KEY

# If not found, restart container with correct -e flags
```

---

### "Google OAuth token expired"

**Symptoms:** Google Drive nodes fail with "401 Unauthorized"

**Solution:**
1. n8n UI → Settings → Credentials
2. Find "Google Drive OAuth"
3. Click "Reconnect"
4. Complete OAuth flow again
5. Workflow automatically uses refreshed token

---

### "Credentials lost after restart"

**Cause:** No volume mount

**Solution:**
```bash
# Stop container
sudo docker stop n8n

# Ensure directory exists with correct ownership
sudo mkdir -p /home/ec2-user/.n8n
sudo chown -R 1000:1000 /home/ec2-user/.n8n

# Restart with volume mount
sudo docker run -d --name n8n --restart unless-stopped \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  # ... (rest of command)
```

---

## 📚 Summary

**Credentials Setup = 2 Steps:**

1. **API Keys (Automated)** → Environment variables in `docker run` command
2. **Google OAuth (Manual)** → Configure once in n8n UI via browser

**No separate upload script needed!** Everything is handled via:
- Environment variables (for API keys)
- n8n UI (for OAuth)
- Volume mount (for persistence)

**Follow:** `docs/COMPLETE-DEPLOYMENT-GUIDE.md` for full walkthrough.
