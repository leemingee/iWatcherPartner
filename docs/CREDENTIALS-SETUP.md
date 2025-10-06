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

## 📝 Credential Persistence

### How Credentials Are Stored:

**Environment Variables (API Keys):**
- Stored in: Docker container environment
- Persistence: Defined in `docker run` command
- Restart behavior: Must be re-specified on container restart
- Security: Only visible inside container

**OAuth Tokens (Google Drive):**
- Stored in: n8n database (SQLite by default)
- Location: `/home/node/.n8n/database.sqlite`
- Persistence: **YES** (with volume mount `-v /home/ec2-user/.n8n:/home/node/.n8n`)
- Restart behavior: Automatically loaded on container restart
- Security: Encrypted with `N8N_ENCRYPTION_KEY`

### Important: Always Use Volume Mount!

```bash
# ✅ CORRECT - Credentials persist
-v /home/ec2-user/.n8n:/home/node/.n8n

# ❌ WRONG - Credentials lost on restart!
# (no volume mount)
```

Without volume mount:
- OAuth credentials lost on container restart
- Must reconfigure Google OAuth every time
- Workflows lost
- Admin account lost

**Always ensure:**
```bash
sudo mkdir -p /home/ec2-user/.n8n
sudo chown -R 1000:1000 /home/ec2-user/.n8n
```

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

## ✅ Complete Credential Checklist

Follow this checklist when deploying:

### Pre-Deployment
- [ ] Obtain AssemblyAI API key from https://www.assemblyai.com/
- [ ] Obtain OpenAI API key from https://platform.openai.com/
- [ ] Create Notion integration at https://www.notion.so/my-integrations
- [ ] Share Notion database with integration
- [ ] Copy Notion database ID from URL
- [ ] Create Google OAuth credentials in Cloud Console

### During Deployment
- [ ] Set environment variables on EC2 instance
- [ ] Start n8n container with `-e` flags for all API keys
- [ ] Verify volume mount: `-v /home/ec2-user/.n8n:/home/node/.n8n`
- [ ] Create SSM tunnel (for Google OAuth setup)
- [ ] Configure Google OAuth in n8n UI
- [ ] Test OAuth by clicking "Sign in with Google"

### Post-Deployment
- [ ] Run `test-complete-pipeline.py` to verify all credentials
- [ ] Upload test audio file
- [ ] Verify workflow execution succeeds
- [ ] Check Notion database for output
- [ ] Check Google Drive for transcript file
- [ ] Verify credentials persist after container restart

### Production (HTTPS)
- [ ] Update Google OAuth redirect URI to HTTPS
- [ ] Delete old OAuth credential in n8n
- [ ] Create new OAuth credential (no tunnel needed with HTTPS!)
- [ ] Test workflow with HTTPS URL

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
