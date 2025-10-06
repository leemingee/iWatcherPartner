# HTTPS Domain Setup Guide: iwatcher.even-study.us

Complete guide to map your n8n instance to **https://iwatcher.even-study.us** with SSL/TLS security.

---

## 🎯 Goal

Transform:
- ❌ `http://XX.XX.XX.XX` (insecure, hard to remember)

Into:
- ✅ `https://n8n.yourdomain.com` (secure, professional subdomain)

---

## 📊 Option Comparison

| Option | Cost/Month | Setup Time | Best For | Difficulty |
|--------|------------|------------|----------|------------|
| **1. ALB + ACM** | ~$18 | 30 min | Production | Medium |
| **2. CloudFront + ACM** | ~$1-5 | 45 min | Global CDN | Medium |
| **3. Let's Encrypt + nginx** | $0 | 20 min | Budget | Easy ⭐ |

**Recommended:** Option 3 (Let's Encrypt) - Free, simple, and works great for single-region deployments.

---

## ✅ Option 1: Let's Encrypt + nginx (RECOMMENDED)

**Cost:** $0
**Setup Time:** 20 minutes
**Pros:** Free, automatic renewal, simple
**Cons:** Runs on your EC2 (small performance overhead)

### Step 0: Open Port 443 in Security Group ⚠️ **CRITICAL**

**Before starting HTTPS setup**, you MUST open port 443 (HTTPS) in your EC2 security group. Without this, HTTPS will timeout and be completely inaccessible.

```bash
# Get your instance's security group ID
aws ec2 describe-instances --instance-ids YOUR_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' \
  --output text

# Example output: sg-01c1c4efe4d5b3d81

# Open port 443 for HTTPS traffic
aws ec2 authorize-security-group-ingress \
  --group-id sg-YOUR_SECURITY_GROUP_ID \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

**Or via AWS Console:**
1. EC2 Dashboard → Security Groups
2. Find your instance's security group
3. Edit inbound rules → Add rule
4. Type: HTTPS, Protocol: TCP, Port: 443, Source: 0.0.0.0/0
5. Save rules

**Verify port is open:**
```bash
# Should show port 443 in the security group rules
aws ec2 describe-security-groups --group-ids sg-YOUR_SECURITY_GROUP_ID \
  --query 'SecurityGroups[0].IpPermissions[?ToPort==`443`]'
```

### Step 1: Install nginx and Certbot

SSH into your EC2 instance:

```bash
# Connect via SSM
aws ssm start-session --target i-00615242449363943

# Install nginx
sudo yum install -y nginx

# Install Certbot (Let's Encrypt client)
sudo wget -r --no-parent -A 'epel-release-*.rpm' http://dl.fedoraproject.org/pub/epel/7/x86_64/Packages/e/
sudo rpm -Uvh dl.fedoraproject.org/pub/epel/7/x86_64/Packages/e/epel-release-*.rpm
sudo yum-config-manager --enable epel*
sudo yum install -y certbot python2-certbot-nginx
```

### Step 2: Create FreeDNS Subdomain Record

In your FreeDNS account (https://freedns.afraid.org):
- **Subdomain:** `n8n`
- **Domain:** `yourdomain.com`
- **Type:** `A`
- **Destination:** `XX.XX.XX.XX` (your EC2 public IP)
- **TTL:** 300 (5 minutes for faster propagation)

This creates: `n8n.yourdomain.com → XX.XX.XX.XX`

**Verify DNS propagation:**
```bash
nslookup n8n.yourdomain.com
# Should return: XX.XX.XX.XX

# Or use dig
dig +short n8n.yourdomain.com
# Should return: XX.XX.XX.XX
```

Wait 5-10 minutes for DNS to propagate globally.

### Step 3: Stop n8n Container Temporarily

```bash
# Stop n8n to free port 80 (needed for certificate verification)
sudo docker stop n8n
```

### Step 4: Obtain SSL Certificate

```bash
# Request certificate from Let's Encrypt for subdomain
sudo certbot certonly --standalone -d n8n.yourdomain.com

# Follow prompts:
# - Enter email: your-email@example.com
# - Agree to terms: Yes
# - Share email: Your choice
```

**Expected Output:**
```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem
Key is saved at: /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem
```

### Step 5: Configure nginx as Reverse Proxy

Create nginx configuration:

```bash
sudo tee /etc/nginx/conf.d/n8n.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name n8n.yourdomain.com;

    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name n8n.yourdomain.com;

    # SSL Certificate
    ssl_certificate /etc/letsencrypt/live/n8n.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.yourdomain.com/privkey.pem;

    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy to n8n container
    location / {
        # Timeout settings (IMPORTANT: n8n needs longer timeouts)
        # Default nginx timeout is 60s, which causes 504 Gateway Timeout errors
        proxy_connect_timeout 300;  # Time to connect to n8n
        proxy_send_timeout 300;     # Time to send request to n8n
        proxy_read_timeout 300;     # Time to read response from n8n (normal requests)

        proxy_pass http://localhost:5678;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Headers for n8n
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for long-running workflow executions)
        send_timeout 86400;         # WebSocket send timeout (24 hours)
        proxy_read_timeout 86400;   # WebSocket read timeout (24 hours)
    }
}
EOF
```

### Step 6: Start nginx

```bash
# Test nginx configuration
sudo nginx -t

# Start nginx
sudo service nginx start

# Enable on boot
sudo chkconfig nginx on
```

### Step 7: Restart n8n with Updated Webhook URL

```bash
sudo docker run -d --name n8n --restart unless-stopped \
  -p 127.0.0.1:5678:5678 \
  -v /home/ec2-user/.n8n:/home/node/.n8n \
  -e N8N_ENCRYPTION_KEY=iwatcher-n8n-secret-key-2025 \
  -e N8N_SECURE_COOKIE=false \
  -e WEBHOOK_URL=https://n8n.yourdomain.com \
  -e ASSEMBLYAI_API_KEY=$ASSEMBLYAI_API_KEY \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NOTION_API_TOKEN=$NOTION_API_TOKEN \
  -e NOTION_DATABASE_ID=$NOTION_DATABASE_ID \
  n8nio/n8n:latest
```

**Key changes:**
- Bind to `127.0.0.1:5678` (localhost only, nginx handles external)
- Set `WEBHOOK_URL=https://n8n.yourdomain.com`

### Step 8: Test HTTPS Access

```bash
# Test from command line
curl -I https://n8n.yourdomain.com

# Should return:
# HTTP/2 200
# ...
```

Open in browser: **https://n8n.yourdomain.com**

You should see the n8n login page with a valid SSL certificate! 🎉

### Step 9: Update Google OAuth Redirect URI

In Google Cloud Console:
1. Go to **APIs & Services** → **Credentials**
2. Edit your OAuth 2.0 Client ID
3. Add authorized redirect URI:
   ```
   https://n8n.yourdomain.com/rest/oauth2-credential/callback
   ```
4. Save changes

### Step 10: Reconfigure Google Drive OAuth in n8n

1. Access **https://n8n.yourdomain.com**
2. Go to **Settings** → **Credentials**
3. Delete old Google Drive OAuth credential
4. Create new credential with updated redirect URI
5. Complete OAuth flow (will now use HTTPS ✅)

**No SSM tunnel needed anymore!** OAuth works directly with HTTPS.

### Step 11: Auto-Renewal Setup

Certbot automatically installs a renewal cron job, but verify:

```bash
# Check renewal timer
sudo certbot renew --dry-run

# Should output: "Congratulations, all simulated renewals succeeded"
```

Certificates auto-renew every 90 days.

---

## 🛡️ Security Checklist

After setup, verify:

- ✅ HTTPS working: `https://n8n.yourdomain.com` loads
- ✅ HTTP redirects to HTTPS automatically
- ✅ SSL certificate valid (green padlock in browser)
- ✅ Google OAuth working with new HTTPS redirect
- ✅ n8n workflow still processing files
- ✅ Auto-renewal configured

---

## 🔧 Troubleshooting

### Issue: "Connection Refused"

**Check nginx status:**
```bash
sudo service nginx status
sudo tail -f /var/log/nginx/error.log
```

**Check n8n container:**
```bash
sudo docker ps | grep n8n
sudo docker logs n8n --tail 50
```

### Issue: "Certificate Validation Failed"

**Cause:** DNS not propagated yet

**Solution:**
```bash
# Wait 10 minutes, then retry
nslookup n8n.yourdomain.com
# Ensure it returns XX.XX.XX.XX (your EC2 public IP)
```

### Issue: "502 Bad Gateway"

**Cause:** nginx can't reach n8n container

**Solution:**
```bash
# Check n8n is running on port 5678
sudo docker ps
curl http://localhost:5678

# Restart n8n if needed
sudo docker restart n8n
```

### Issue: "Google OAuth Still Shows HTTP Error"

**Cause:** Old OAuth credential cached

**Solution:**
1. Delete credential in n8n UI
2. Clear browser cookies
3. Create new credential
4. Complete OAuth flow from scratch

---

## 📊 Cost Breakdown

**Let's Encrypt Option:**
- SSL Certificate: **$0** (free)
- nginx: **$0** (open source)
- EC2 t3.small: **~$17/month** (existing)
- **Total: ~$17/month** (no increase!)

---

## 🔄 Alternative: CloudFront + ACM (Global CDN)

If you want global CDN + DDoS protection:

### Quick Steps:

1. **Request ACM Certificate:**
   - AWS Console → Certificate Manager → Request Certificate
   - Domain: `n8n.yourdomain.com`
   - Validation: DNS (add CNAME to FreeDNS)

2. **Create CloudFront Distribution:**
   - Origin: `XX.XX.XX.XX:80` (your EC2 public IP)
   - Viewer Protocol: Redirect HTTP to HTTPS
   - Alternate Domain: `n8n.yourdomain.com`
   - SSL Certificate: Select ACM certificate

3. **Update FreeDNS:**
   - Subdomain: `n8n`
   - Type: `CNAME`
   - Value: CloudFront distribution URL (e.g., `d123456.cloudfront.net`)

4. **Update n8n:**
   ```bash
   -e WEBHOOK_URL=https://n8n.yourdomain.com
   ```

**Cost:** ~$1-5/month (depends on traffic)

---

## 🔄 Alternative: Application Load Balancer (High Availability)

For production with auto-scaling:

### Quick Steps:

1. **Request ACM Certificate** (same as CloudFront)

2. **Create Application Load Balancer:**
   - AWS Console → EC2 → Load Balancers → Create ALB
   - Listeners: HTTP (80) and HTTPS (443)
   - Target Group: Your EC2 instance on port 80
   - SSL Certificate: Select ACM certificate

3. **Update FreeDNS:**
   - Subdomain: `n8n`
   - Type: `CNAME`
   - Value: ALB DNS name (e.g., `my-alb-123456.us-west-2.elb.amazonaws.com`)

4. **Update n8n:**
   ```bash
   -e WEBHOOK_URL=https://n8n.yourdomain.com
   ```

**Cost:** ~$18/month (ALB running hours + data processing)

---

## ✅ Recommended: Let's Encrypt

**For your use case (single n8n instance), Let's Encrypt is perfect:**

✅ Free
✅ Auto-renewal
✅ Easy setup
✅ No additional AWS costs
✅ Fast (20 minutes)

**Use ALB/CloudFront only if you need:**
- Global CDN
- DDoS protection
- Auto-scaling (multiple EC2 instances)
- AWS-managed certificates

---

## 📝 Final Configuration

After setup, your stack:

```
User Browser
     ↓
HTTPS (443) → nginx
     ↓
http://localhost:5678 → n8n Container
     ↓
Workflow Execution
     ↓
AssemblyAI + OpenAI + Notion
```

**Your final HTTPS URL:** https://n8n.yourdomain.com

**Main domain `yourdomain.com` remains free** for other projects!

---

## 🎉 Success Checklist

- [ ] SSL certificate obtained from Let's Encrypt
- [ ] nginx configured as HTTPS reverse proxy
- [ ] HTTP auto-redirects to HTTPS
- [ ] n8n accessible at https://n8n.yourdomain.com
- [ ] Google OAuth redirect URI updated
- [ ] Google Drive credential reconfigured with HTTPS
- [ ] Test workflow processes audio successfully
- [ ] Auto-renewal configured (certbot cron job)

---

## 🔐 Security Notes

**After setup:**
1. **Never expose port 5678 publicly** - nginx handles all external traffic
2. **Keep n8n updated:** `docker pull n8nio/n8n:latest && docker restart n8n`
3. **Monitor certificate expiry:** Certbot auto-renews, but check occasionally
4. **Enable n8n basic auth** if needed (optional extra security layer)

---

**Questions?** Check logs:
```bash
# nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# n8n logs
sudo docker logs -f n8n

# Certificate info
sudo certbot certificates
```

---

**Ready to deploy?** Follow the Let's Encrypt steps above for your **https://n8n.yourdomain.com** setup!
