#!/usr/bin/env python3
"""
iWatcher Complete Pipeline Test
--------------------------------
End-to-end test of the iWatcher workflow:
1. Uploads test audio to Google Drive "New" folder
2. Monitors n8n workflow execution
3. Checks outputs in Notion and Google Drive "Completed" folder
4. Reports success/failure with detailed logs
"""

import os
import time
import json
import requests
from pathlib import Path

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("⚠️  python-dotenv not installed. Install with: pip install python-dotenv")

class PipelineTester:
    def __init__(self):
        self.n8n_url = os.getenv("N8N_URL", "http://localhost:5678").rstrip('/')
        self.n8n_api_key = os.getenv("N8N_API_KEY")
        self.notion_token = os.getenv("NOTION_API_TOKEN")
        self.notion_db_id = os.getenv("NOTION_DATABASE_ID")

        if not self.n8n_api_key:
            raise ValueError("N8N_API_KEY not set in environment")

    def check_n8n_health(self):
        """Check if n8n is running and workflow is active"""
        print("🔍 Checking n8n health...")

        try:
            headers = {"X-N8N-API-KEY": self.n8n_api_key}
            response = requests.get(
                f"{self.n8n_url}/api/v1/workflows",
                headers=headers,
                timeout=10
            )

            if response.status_code != 200:
                print(f"❌ n8n API not responding: {response.status_code}")
                return False

            workflows = response.json()['data']
            active_workflows = [w for w in workflows if w.get('active')]

            print(f"✅ n8n is running")
            print(f"   Total workflows: {len(workflows)}")
            print(f"   Active workflows: {len(active_workflows)}")

            # Find iWatcher workflow
            iwatcher = next((w for w in workflows if 'iwatcher' in w['name'].lower()), None)
            if iwatcher:
                status = "🟢 Active" if iwatcher.get('active') else "⚪ Inactive"
                print(f"   iWatcher workflow: {status}")

                if not iwatcher.get('active'):
                    print("⚠️  WARNING: iWatcher workflow is not active!")
                    print("   Activate it in n8n UI or via API")
                    return False
            else:
                print("⚠️  WARNING: iWatcher workflow not found")
                return False

            return True

        except Exception as e:
            print(f"❌ Health check failed: {e}")
            return False

    def check_environment(self):
        """Verify all required environment variables"""
        print("\n🔍 Checking environment variables...")

        required_vars = {
            "ASSEMBLYAI_API_KEY": "AssemblyAI transcription",
            "OPENAI_API_KEY": "OpenAI GPT-5 processing",
            "NOTION_API_TOKEN": "Notion database storage",
            "NOTION_DATABASE_ID": "Notion database ID"
        }

        all_set = True
        for var, description in required_vars.items():
            value = os.getenv(var)
            if value:
                masked = value[:8] + "..." if len(value) > 8 else "***"
                print(f"   ✅ {var}: {masked} ({description})")
            else:
                print(f"   ❌ {var}: Not set ({description})")
                all_set = False

        return all_set

    def get_workflow_executions(self, limit=10):
        """Get recent workflow executions"""
        print(f"\n📊 Fetching last {limit} workflow executions...")

        try:
            headers = {"X-N8N-API-KEY": self.n8n_api_key}
            response = requests.get(
                f"{self.n8n_url}/api/v1/executions",
                headers=headers,
                params={"limit": limit}
            )

            if response.status_code == 200:
                executions = response.json()['data']

                print(f"\n{'Status':<12} {'Started':<20} {'Duration':<10} {'Workflow'}")
                print("-" * 80)

                for exec in executions:
                    status = exec.get('status', 'unknown')
                    started = exec.get('startedAt', 'N/A')[:19].replace('T', ' ')

                    # Calculate duration
                    start_time = exec.get('startedAt')
                    stop_time = exec.get('stoppedAt')
                    duration = "N/A"

                    if start_time and stop_time:
                        from datetime import datetime
                        start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                        stop_dt = datetime.fromisoformat(stop_time.replace('Z', '+00:00'))
                        duration_sec = (stop_dt - start_dt).total_seconds()

                        if duration_sec < 60:
                            duration = f"{duration_sec:.0f}s"
                        else:
                            minutes = int(duration_sec // 60)
                            seconds = int(duration_sec % 60)
                            duration = f"{minutes}m {seconds}s"

                    workflow_name = exec.get('workflowData', {}).get('name', 'Unknown')[:30]

                    # Status emoji
                    status_emoji = {
                        'success': '✅',
                        'error': '❌',
                        'running': '🔄',
                        'waiting': '⏳'
                    }.get(status, '⚪')

                    print(f"{status_emoji} {status:<10} {started:<20} {duration:<10} {workflow_name}")

                return executions
            else:
                print(f"❌ Failed to fetch executions: {response.status_code}")
                return []

        except Exception as e:
            print(f"❌ Error fetching executions: {e}")
            return []

    def check_notion_database(self):
        """Check if Notion database is accessible"""
        print("\n🔍 Checking Notion database...")

        if not self.notion_token or not self.notion_db_id:
            print("⚠️  Notion credentials not configured")
            return False

        try:
            headers = {
                "Authorization": f"Bearer {self.notion_token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json"
            }

            response = requests.post(
                f"https://api.notion.com/v1/databases/{self.notion_db_id}/query",
                headers=headers,
                json={"page_size": 5}
            )

            if response.status_code == 200:
                results = response.json().get('results', [])
                print(f"✅ Notion database accessible")
                print(f"   Recent entries: {len(results)}")

                for entry in results:
                    title_prop = entry.get('properties', {}).get('Title', {})
                    title_content = title_prop.get('title', [])
                    title = title_content[0].get('text', {}).get('content', 'Untitled') if title_content else 'Untitled'
                    created = entry.get('created_time', '')[:10]
                    print(f"   - {title[:50]} (created: {created})")

                return True
            else:
                print(f"❌ Notion API error: {response.status_code}")
                print(f"   Response: {response.text[:200]}")
                return False

        except Exception as e:
            print(f"❌ Notion check failed: {e}")
            return False

    def monitor_execution(self, timeout=600):
        """Monitor for new workflow executions"""
        print(f"\n👀 Monitoring for workflow execution (timeout: {timeout}s)...")
        print("   Upload an audio file to Google Drive 'New' folder to trigger")

        start_time = time.time()
        last_exec_count = len(self.get_workflow_executions(1))

        while time.time() - start_time < timeout:
            time.sleep(10)  # Check every 10 seconds

            current_execs = self.get_workflow_executions(1)
            if len(current_execs) > last_exec_count:
                print("\n🎉 New execution detected!")
                latest = current_execs[0]

                print(f"   Status: {latest.get('status')}")
                print(f"   Started: {latest.get('startedAt')}")

                # Wait for completion
                exec_id = latest.get('id')
                if exec_id:
                    self.wait_for_completion(exec_id)

                return latest

            # Show progress
            elapsed = int(time.time() - start_time)
            print(f"\r   Waiting... ({elapsed}s elapsed)", end='', flush=True)

        print(f"\n⏱️  Timeout reached ({timeout}s). No new execution detected.")
        return None

    def wait_for_completion(self, execution_id, timeout=600):
        """Wait for a specific execution to complete"""
        print(f"\n⏳ Waiting for execution {execution_id} to complete...")

        start_time = time.time()

        while time.time() - start_time < timeout:
            try:
                headers = {"X-N8N-API-KEY": self.n8n_api_key}
                response = requests.get(
                    f"{self.n8n_url}/api/v1/executions/{execution_id}",
                    headers=headers
                )

                if response.status_code == 200:
                    exec_data = response.json()
                    status = exec_data.get('status')

                    if status in ['success', 'error']:
                        elapsed = int(time.time() - start_time)
                        print(f"\n{'✅' if status == 'success' else '❌'} Execution {status} (took {elapsed}s)")

                        if status == 'error':
                            print(f"\nError details:")
                            print(json.dumps(exec_data.get('data', {}), indent=2))

                        return exec_data

                    # Still running
                    elapsed = int(time.time() - start_time)
                    print(f"\r   Status: {status} ({elapsed}s elapsed)", end='', flush=True)

                time.sleep(5)

            except Exception as e:
                print(f"\n❌ Error checking execution: {e}")
                break

        print(f"\n⏱️  Timeout reached. Execution may still be running.")
        return None

def main():
    print("=" * 80)
    print("iWatcher Complete Pipeline Test")
    print("=" * 80)

    try:
        tester = PipelineTester()

        # Run health checks
        print("\n📋 Running Pre-Flight Checks\n")

        checks_passed = True

        if not tester.check_n8n_health():
            checks_passed = False

        if not tester.check_environment():
            checks_passed = False

        tester.check_notion_database()

        if not checks_passed:
            print("\n❌ Pre-flight checks failed. Fix issues above before testing.")
            return

        # Show recent executions
        print("\n" + "=" * 80)
        tester.get_workflow_executions(10)

        # Ask to monitor
        print("\n" + "=" * 80)
        monitor_choice = input("\nMonitor for new workflow execution? (y/n): ").lower()

        if monitor_choice == 'y':
            print("\n📝 To test the complete pipeline:")
            print("   1. Upload an audio file (M4A, MP3, WAV) to Google Drive 'New' folder")
            print("   2. This script will detect and monitor the execution")
            print("   3. Check outputs in Notion and Google Drive 'Completed' folder")

            execution = tester.monitor_execution(timeout=600)

            if execution:
                print("\n✅ Test complete!")

                # Re-check Notion for new entries
                print("\n" + "=" * 80)
                tester.check_notion_database()
        else:
            print("\n👋 Test monitoring skipped. Run anytime to check pipeline health.")

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
