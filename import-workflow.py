#!/usr/bin/env python3
"""Import workflow to n8n via API."""

import requests
import json
import os
import sys

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional

# Get configuration from environment
N8N_URL = os.getenv("N8N_URL", "http://localhost:5678")
N8N_API_KEY = os.getenv("N8N_API_KEY")

if not N8N_API_KEY:
    print("❌ Error: N8N_API_KEY environment variable not set!")
    print("   Set it with: export N8N_API_KEY='your_api_key'")
    print("   Or add to .env file: N8N_API_KEY=your_key")
    print("   Get API key from n8n UI: Settings → API → Create API Key")
    sys.exit(1)

HEADERS = {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Load workflow from file
with open('iwatcher-gdrive-trigger.json', 'r') as f:
    workflow = json.load(f)

# Create payload with only required fields
payload = {
    "name": workflow["name"],
    "nodes": workflow["nodes"],
    "connections": workflow["connections"],
    "settings": workflow.get("settings", {})
}

# Import workflow
response = requests.post(
    f"{N8N_URL}/api/v1/workflows",
    headers=HEADERS,
    json=payload
)

if response.status_code in [200, 201]:
    result = response.json()
    print(f"✅ Workflow imported successfully!")
    print(f"   ID: {result.get('id')}")
    print(f"   Name: {result.get('name')}")
else:
    print(f"❌ Failed to import workflow: {response.status_code}")
    print(f"   Response: {response.text}")
