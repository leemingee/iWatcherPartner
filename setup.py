#!/usr/bin/env python3
"""
Setup Script for iWatcher AWS Deployment
-----------------------------------------
Handles:
1. Importing workflow to n8n instance
2. Activating the workflow
3. Verifying environment variables are set
4. Testing n8n connectivity
"""

import os
import json
import requests
import sys
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️  python-dotenv not installed. Install with: pip install python-dotenv")

class N8NSetup:
    def __init__(self, n8n_url, api_key):
        self.n8n_url = n8n_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            "X-N8N-API-KEY": api_key,
            "Content-Type": "application/json"
        }

    def test_connection(self):
        """Test n8n API connectivity"""
        print("🔍 Testing n8n connection...")
        try:
            response = requests.get(
                f"{self.n8n_url}/api/v1/workflows",
                headers=self.headers,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Connected to n8n successfully")
                print(f"   Found {len(response.json()['data'])} existing workflows")
                return True
            else:
                print(f"❌ Connection failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Connection error: {e}")
            return False

    def check_env_vars(self):
        """Verify required environment variables are set"""
        print("\n🔍 Checking environment variables...")
        required_vars = [
            "ASSEMBLYAI_API_KEY",
            "OPENAI_API_KEY",
            "NOTION_API_TOKEN",
            "NOTION_DATABASE_ID"
        ]

        missing = []
        for var in required_vars:
            value = os.getenv(var)
            if not value:
                missing.append(var)
                print(f"   ❌ {var}: Not set")
            else:
                masked = value[:8] + "..." if len(value) > 8 else "***"
                print(f"   ✅ {var}: {masked}")

        if missing:
            print(f"\n⚠️  Missing variables: {', '.join(missing)}")
            print(f"   Add these to your .env file or container environment")
            return False

        print("✅ All environment variables configured")
        return True

    def import_workflow(self, workflow_file="iwatcher-gdrive-trigger.json"):
        """Import workflow from JSON file"""
        print(f"\n📥 Importing workflow from {workflow_file}...")

        if not Path(workflow_file).exists():
            print(f"❌ Workflow file not found: {workflow_file}")
            return None

        with open(workflow_file, 'r') as f:
            workflow = json.load(f)

        # Clean workflow for import (API doesn't accept all export fields)
        clean_workflow = {
            "name": workflow.get("name", "iWatcher - Google Drive Auto Trigger"),
            "nodes": workflow["nodes"],
            "connections": workflow["connections"],
            "settings": workflow.get("settings", {})
        }

        try:
            response = requests.post(
                f"{self.n8n_url}/api/v1/workflows",
                headers=self.headers,
                json=clean_workflow
            )

            if response.status_code in [200, 201]:
                workflow_data = response.json()
                workflow_id = workflow_data.get('data', {}).get('id') or workflow_data.get('id')
                print(f"✅ Workflow imported successfully")
                print(f"   ID: {workflow_id}")
                print(f"   Name: {clean_workflow['name']}")
                return workflow_id
            else:
                print(f"❌ Import failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return None
        except Exception as e:
            print(f"❌ Import error: {e}")
            return None

    def activate_workflow(self, workflow_id):
        """Activate a workflow"""
        print(f"\n▶️  Activating workflow {workflow_id}...")

        try:
            response = requests.patch(
                f"{self.n8n_url}/api/v1/workflows/{workflow_id}",
                headers=self.headers,
                json={"active": True}
            )

            if response.status_code == 200:
                print(f"✅ Workflow activated successfully")
                return True
            else:
                print(f"❌ Activation failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Activation error: {e}")
            return False

    def list_workflows(self):
        """List all workflows"""
        print("\n📋 Current workflows:")
        try:
            response = requests.get(
                f"{self.n8n_url}/api/v1/workflows",
                headers=self.headers
            )

            if response.status_code == 200:
                workflows = response.json()['data']
                for wf in workflows:
                    status = "🟢 Active" if wf.get('active') else "⚪ Inactive"
                    print(f"   {status} | {wf['id']} | {wf['name']}")
                return workflows
            else:
                print(f"❌ Failed to list workflows: {response.status_code}")
                return []
        except Exception as e:
            print(f"❌ Error: {e}")
            return []

def main():
    print("=" * 60)
    print("iWatcher Setup Script")
    print("=" * 60)

    # Get configuration
    n8n_url = os.getenv("N8N_URL", "http://localhost:5678")
    api_key = os.getenv("N8N_API_KEY")

    if not api_key:
        print("\n❌ N8N_API_KEY not set!")
        print("   Set it with: export N8N_API_KEY='your_key'")
        print("   Or add to .env file: N8N_API_KEY=your_key")
        sys.exit(1)

    print(f"\n🔗 n8n URL: {n8n_url}")
    print(f"🔑 API Key: {api_key[:16]}...")

    # Initialize setup
    setup = N8NSetup(n8n_url, api_key)

    # Run setup steps
    if not setup.test_connection():
        print("\n❌ Cannot connect to n8n. Is it running?")
        sys.exit(1)

    setup.check_env_vars()

    # List existing workflows
    setup.list_workflows()

    # Ask to import workflow
    print("\n" + "=" * 60)
    import_choice = input("Import iWatcher workflow? (y/n): ").lower()

    if import_choice == 'y':
        workflow_id = setup.import_workflow()

        if workflow_id:
            activate_choice = input("\nActivate workflow? (y/n): ").lower()
            if activate_choice == 'y':
                setup.activate_workflow(workflow_id)

        # Show final state
        print("\n" + "=" * 60)
        print("Final workflow state:")
        setup.list_workflows()

    print("\n✅ Setup complete!")
    print(f"   Access n8n at: {n8n_url}")
    print("\n⚠️  Remember to configure Google Drive OAuth in n8n UI:")
    print("   Settings → Credentials → Add Google Drive OAuth2 API")

if __name__ == "__main__":
    main()
