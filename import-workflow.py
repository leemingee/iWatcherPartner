#!/usr/bin/env python3
"""Import workflow to n8n via API."""

import requests
import json

N8N_URL = "http://localhost:5678"
N8N_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZjNkM2M3Yi04Mzg4LTRmMjItYTc2Mi1jZTlhYWQ4NjMzNDQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzU5NzExNTY5LCJleHAiOjE3NjIyNDMyMDB9.JIck482u0ZO7obHz0HT6zJ9KYu3AUlckIA428p1h-es"

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
