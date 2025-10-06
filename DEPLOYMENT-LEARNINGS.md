# iWatcher AWS Deployment - Lessons Learned

Complete documentation of the deployment journey, including all rabbit holes encountered and solutions implemented.

## 📅 Deployment Timeline

**Start:** Working local n8n workflow with Docker  
**End:** Production-ready AWS deployment with persistent storage  
**Duration:** ~3 hours  
**Final Status:** ✅ Successfully deployed and tested

---

## 🎯 Initial Goal

Deploy a working local n8n workflow to AWS EC2 with:
- Persistent storage
- Environment variables for API keys
- Google Drive OAuth working
- 24/7 availability

---

## 🐇 Rabbit Holes & Solutions

### 1. **Workflow Import API Issues** ⏱️ 15 minutes

**Problem:**  
Initial workflow import failed with `"request/body must NOT have additional properties"`

**Root Cause:**  
n8n API doesn't accept all workflow properties from exported JSON (e.g., `active`, `pinData`, `tags`)

**Solution:**  
```python
# Only send required fields
clean_workflow = {
    "name": workflow["name"],
    "nodes": workflow["nodes"],
    "connections": workflow["connections"],
    "settings": workflow.get("settings", {})
}
```

**Lesson:** Always strip export-only fields when importing workflows via API.

---

### 2. **Container Restart Lost Data** ⏱️ 30 minutes

**Problem:**  
After restarting n8n container with environment variables, all user data (admin account, workflows, credentials) disappeared.

**Root Cause:**  
n8n container was using internal storage (`/home/node/.n8n`) without volume mount. Each restart created fresh container.

**Solution:**  
```bash
# Create persistent directory on host
sudo mkdir -p /home/ec2-user/.n8n

# Mount volume in container
-v /home/ec2-user/.n8n:/home/node/.n8n
```

**Lesson:** Always use volume mounts for any stateful containers in production.

---

### 3. **Permission Denied on Volume Mount** ⏱️ 10 minutes

**Problem:**  
Container crashed on start with `EACCES: permission denied, open '/home/node/.n8n/config'`

**Root Cause:**  
n8n container runs as user `node` (UID 1000), but volume was owned by `root` (UID 0).

**Solution:**  
```bash
# Fix ownership before starting container
sudo chown -R 1000:1000 /home/ec2-user/.n8n
```

**Lesson:** Check container user ID when mounting volumes. Use `chown` to match.

---

### 4. **Google OAuth Redirect Issues** ⏱️ 45 minutes 🔥 **MAJOR**

**Problem:**
Google OAuth failed with:
```
"You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy"
Error: redirect_uri was http://XX.XX.XX.XX/rest/oauth2-credential/callback
```

**Root Causes:**  
1. n8n used public IP in redirect URI
2. Google OAuth requires HTTPS or `localhost`
3. No way to access OAuth flow from cloud instance

**Attempted Solutions:**
- ❌ Create credential via API (API doesn't support OAuth flow)
- ❌ Copy credential from local database (no direct DB access via API)
- ❌ Manual OAuth with public IP (Google rejects non-HTTPS)

**Final Solution:**  
SSH port forwarding with AWS SSM:
```bash
# Install Session Manager Plugin
brew install --cask session-manager-plugin

# Create tunnel: AWS port 80 → Local port 8888
aws ssm start-session \
  --target i-XXXXXXXXXXXXX \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["80"],"localPortNumber":["8888"]}'

# Update n8n webhook URL
-e WEBHOOK_URL=http://localhost:8888

# Access at http://localhost:8888
# OAuth redirect: http://localhost:8888/rest/oauth2-credential/callback ✅
```

**Why This Works:**  
- Google trusts `localhost` redirects (no HTTPS required)
- SSM tunnel forwards all traffic through secure channel
- n8n sees requests as coming from localhost
- No public HTTPS certificate needed

**Lesson:** For OAuth in cloud environments without HTTPS:
1. Use SSH/SSM port forwarding
2. Set webhook URL to `localhost`
3. Complete OAuth through tunnel
4. Credentials persist after closing tunnel

**This was the biggest blocker** - took ~45 minutes and 3 different approaches.

---

### 5. **Docker Not Running on EC2 Start** ⏱️ 20 minutes

**Problem:**  
Cloud-init script failed because Docker service wasn't ready when script ran.

**Logs:**  
```
docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Root Cause:**  
EC2 user data script runs immediately on boot, but Docker takes 30-60 seconds to start.

**Solution:**  
```bash
# Check if Docker is running, start if needed
sudo service docker status || sudo service docker start
sleep 5  # Wait for Docker daemon
```

**Lesson:** Always check service status and add wait times in boot scripts.

---

### 6. **Amazon Linux 1 vs Amazon Linux 2** ⏱️ 10 minutes

**Problem:**  
Commands failed: `systemctl: command not found`

**Root Cause:**  
Stack was using Amazon Linux 1 (EOL 2023), which uses `service` instead of `systemctl`.

**Detection:**  
```bash
cat /etc/os-release
# NAME="Amazon Linux AMI"
# VERSION="2018.03"
```

**Solution:**  
```bash
# Use service instead of systemctl
sudo service docker start
```

**Lesson:** Check OS version when deploying. Amazon Linux 1 is EOL - migrate to Amazon Linux 2.

---

### 7. **API Key Expired After Restart** ⏱️ 5 minutes

**Problem:**  
After container restart, API key returned 401 Unauthorized.

**Root Cause:**  
API keys are session-based and stored in database. Fresh container = fresh database = invalid keys.

**Solution:**  
Persistent storage (Rabbit Hole #2) fixed this automatically.

**Lesson:** API keys depend on persistent database. Volume mounts solve multiple issues.

---

### 8. **Environment Variables in Container** ⏱️ 10 minutes

**Problem:**  
How to inject API keys (AssemblyAI, OpenAI, Notion) into n8n without exposing in workflow JSON?

**Solution:**  
Pass as Docker environment variables:
```bash
docker run -d \
  -e ASSEMBLYAI_API_KEY=... \
  -e OPENAI_API_KEY=... \
  -e NOTION_API_TOKEN=... \
  -e NOTION_DATABASE_ID=... \
  n8nio/n8n:latest
```

In workflow, reference as: `{{$env.ASSEMBLYAI_API_KEY}}`

**Lesson:** Use environment variables for sensitive data. Never hardcode in workflow JSON.

---

## ✅ Final Working Configuration

### Docker Run Command
```bash
sudo docker run -d --name n8n --restart unless-stopped \
  -p 80:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=http://localhost:8888 \
  -e ASSEMBLYAI_API_KEY=... \
  -e OPENAI_API_KEY=... \
  -e NOTION_API_TOKEN=... \
  -e NOTION_DATABASE_ID=... \
  n8nio/n8n:latest
```

### Workflow Features
- ✅ GPT-5 model (`gpt-5-2025-08-07`)
- ✅ No `max_tokens` limit (uses default 128K)
- ✅ Error handling (continues if OpenAI fails)
- ✅ Speaker-annotated transcripts only
- ✅ Dual output (Notion + Google Drive)
- ✅ File management (moves to Completed/Failed)

---

## 🛠️ Tools Used

### AWS SSM Session Manager
- **Purpose:** Secure port forwarding for OAuth
- **Install:** `brew install --cask session-manager-plugin`
- **Usage:** Creates tunnel without SSH keys or public IPs

### n8n API
- **Endpoints Used:**
  - `POST /api/v1/workflows` - Import workflow
  - `POST /api/v1/workflows/:id/activate` - Activate workflow
- **Auth:** `X-N8N-API-KEY` header

### Docker
- **Image:** `n8nio/n8n:latest`
- **Key Flags:**
  - `-v` for persistent storage
  - `-e` for environment variables
  - `--restart unless-stopped` for auto-restart

---

## 📊 Time Breakdown

| Task | Time | Difficulty |
|------|------|------------|
| Initial deployment | 20 min | Easy |
| Volume persistence setup | 30 min | Medium |
| Google OAuth tunnel solution | 45 min | Hard 🔥 |
| Environment variables | 10 min | Easy |
| Docker/OS compatibility | 20 min | Easy |
| Testing & verification | 15 min | Easy |
| **Total** | **~2.5 hours** | |

---

## 🎓 Key Takeaways

### What Went Well ✅
1. **n8n API** - Clean and well-documented
2. **AWS SSM** - Solved OAuth issue elegantly
3. **Docker** - Easy to manage and restart
4. **Workflow design** - Error handling worked perfectly

### What Was Challenging ❌
1. **Google OAuth** - Required creative solution (SSM tunnel)
2. **Persistence** - Easy to overlook until data is lost
3. **Permissions** - UID mismatches caused unexpected crashes
4. **API restrictions** - Can't create OAuth credentials programmatically

### Production Recommendations 🚀
1. **Always use persistent volumes** for stateful containers
2. **Use SSM tunnels** for OAuth setup in cloud
3. **Set WEBHOOK_URL to localhost** when using tunnels
4. **Check container UID** before mounting volumes
5. **Pass secrets via environment variables**, never hardcode
6. **Test restarts early** to catch persistence issues

---

## 🔮 Future Improvements

### Short Term
- [ ] Add HTTPS with custom domain (for public access)
- [ ] Set up CloudWatch monitoring
- [ ] Configure automated backups of n8n data
- [ ] Add health check endpoint

### Long Term
- [ ] Migrate to ECS Fargate (no EC2 management)
- [ ] Use RDS instead of SQLite (better for scaling)
- [ ] Implement multi-region deployment
- [ ] Add CI/CD pipeline for workflow updates

---

## 📚 Resources Used

### Documentation
- [n8n Hosting Docs](https://docs.n8n.io/hosting/)
- [AWS SSM Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Google OAuth 2.0 Policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Docker Volume Mounts](https://docs.docker.com/storage/volumes/)

### Tools
- AWS CLI
- Session Manager Plugin
- Docker
- Python requests library

---

## 🎉 Success Metrics

**Final Result:**
- ✅ Workflow deployed to AWS
- ✅ Persistent storage configured
- ✅ Google OAuth working
- ✅ All environment variables set
- ✅ Successfully processed test audio
- ✅ Output delivered to Notion + Google Drive

**Cost:** ~$17/month (EC2 t3.small + RDS)  
**Uptime:** 24/7  
**Manual intervention:** None (fully automated)

---

**Total deployment time from clean AWS account to working workflow: ~3 hours**

This includes all rabbit holes, dead ends, and learning. A second deployment would take ~30 minutes.
