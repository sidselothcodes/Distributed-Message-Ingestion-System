#!/usr/bin/env python3
"""
High-Speed Message Ingestor Load Testing Script

This script sends thousands of messages asynchronously to stress-test
the ingestion pipeline and verify real-time dashboard metrics.

Usage:
    python scripts/load_test.py --messages 10000 --concurrent 100
    python scripts/load_test.py --quick  # Run quick test (1000 messages, 50 concurrent)
"""

import asyncio
import httpx
import time
import random
import string
from datetime import datetime
from typing import Dict, List, Tuple
import argparse
import sys


class LoadTester:
    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        total_messages: int = 1000,
        concurrent_requests: int = 50,
    ):
        self.api_url = api_url
        self.total_messages = total_messages
        self.concurrent_requests = concurrent_requests

        # Metrics
        self.successful_requests = 0
        self.failed_requests = 0
        self.start_time = None
        self.end_time = None
        self.errors: List[str] = []

    def generate_random_user_id(self) -> int:
        """Generate random user ID between 1 and 10000"""
        return random.randint(1, 10000)

    def generate_random_channel_id(self) -> int:
        """Generate random channel ID between 1 and 100"""
        return random.randint(1, 100)

    def generate_random_content(self) -> str:
        """Generate random message content"""
        templates = [
            "Load test message: {}",
            "Testing throughput with ID: {}",
            "High-speed ingestor test: {}",
            "Stress testing message pipeline: {}",
            "Verifying batch processing: {}",
            "Random test data point: {}",
            "Performance validation message: {}",
            "Concurrent request test: {}",
        ]

        template = random.choice(templates)
        random_suffix = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        return template.format(random_suffix)

    def generate_message(self) -> Dict:
        """Generate a single random message"""
        return {
            "user_id": self.generate_random_user_id(),
            "channel_id": self.generate_random_channel_id(),
            "content": self.generate_random_content(),
        }

    async def send_message(
        self,
        client: httpx.AsyncClient,
        message: Dict,
        index: int,
    ) -> Tuple[bool, str]:
        """
        Send a single message to the API.

        Returns:
            Tuple of (success: bool, error_message: str)
        """
        try:
            response = await client.post(
                f"{self.api_url}/messages",
                json=message,
                timeout=10.0,
            )

            if response.status_code == 201:
                return (True, "")
            else:
                return (False, f"HTTP {response.status_code}: {response.text[:100]}")

        except httpx.TimeoutException:
            return (False, "Request timeout")
        except httpx.ConnectError:
            return (False, "Connection failed - is the API running?")
        except Exception as e:
            return (False, f"Exception: {str(e)[:100]}")

    def print_progress(self, current: int, total: int, start_time: float):
        """Print progress bar and stats"""
        progress = current / total
        bar_length = 40
        filled_length = int(bar_length * progress)
        bar = '█' * filled_length + '░' * (bar_length - filled_length)

        elapsed = time.time() - start_time
        rate = current / elapsed if elapsed > 0 else 0
        eta = (total - current) / rate if rate > 0 else 0

        sys.stdout.write(
            f"\r[{bar}] {current}/{total} ({progress*100:.1f}%) | "
            f"Rate: {rate:.0f} msg/s | "
            f"Success: {self.successful_requests} | "
            f"Failed: {self.failed_requests} | "
            f"ETA: {eta:.0f}s"
        )
        sys.stdout.flush()

    async def run_load_test(self):
        """Execute the load test"""
        print("=" * 80)
        print("HIGH-SPEED MESSAGE INGESTOR - LOAD TEST")
        print("=" * 80)
        print(f"API URL:              {self.api_url}")
        print(f"Total Messages:       {self.total_messages:,}")
        print(f"Concurrent Requests:  {self.concurrent_requests}")
        print(f"Start Time:           {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)

        # Check API health
        print("\n🔍 Checking API health...")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.api_url}/health", timeout=5.0)
                if response.status_code == 200:
                    health_data = response.json()
                    print(f"✓ API is healthy")
                    print(f"  Redis: {health_data.get('redis', 'unknown')}")
                    print(f"  Queue Length: {health_data.get('queue_length', 'unknown')}")
                else:
                    print(f"⚠ API returned status {response.status_code}")
        except Exception as e:
            print(f"✗ Failed to connect to API: {e}")
            print("  Make sure the backend is running at http://localhost:8000")
            return

        print("\n🚀 Starting load test...\n")

        # Generate all messages upfront
        messages = [self.generate_message() for _ in range(self.total_messages)]

        self.start_time = time.time()
        semaphore = asyncio.Semaphore(self.concurrent_requests)

        async def send_with_semaphore(client, msg, idx):
            async with semaphore:
                success, error = await self.send_message(client, msg, idx)

                if success:
                    self.successful_requests += 1
                else:
                    self.failed_requests += 1
                    if len(self.errors) < 10:  # Keep only first 10 errors
                        self.errors.append(error)

                # Print progress every 100 messages
                if (idx + 1) % 100 == 0 or idx == 0:
                    self.print_progress(idx + 1, self.total_messages, self.start_time)

        # Send all messages concurrently with semaphore control
        async with httpx.AsyncClient() as client:
            tasks = [
                send_with_semaphore(client, msg, idx)
                for idx, msg in enumerate(messages)
            ]
            await asyncio.gather(*tasks)

        self.end_time = time.time()

        # Final progress update
        self.print_progress(self.total_messages, self.total_messages, self.start_time)
        print("\n")

        # Print results
        self.print_results()

    def print_results(self):
        """Print final test results"""
        elapsed_time = self.end_time - self.start_time
        actual_throughput = self.total_messages / elapsed_time if elapsed_time > 0 else 0
        success_rate = (self.successful_requests / self.total_messages * 100) if self.total_messages > 0 else 0

        print("\n" + "=" * 80)
        print("LOAD TEST RESULTS")
        print("=" * 80)
        print(f"Total Messages:       {self.total_messages:,}")
        print(f"Successful Requests:  {self.successful_requests:,} ({success_rate:.2f}%)")
        print(f"Failed Requests:      {self.failed_requests:,}")
        print(f"Total Time Elapsed:   {elapsed_time:.2f}s")
        print(f"Actual Throughput:    {actual_throughput:.2f} messages/second")
        print(f"Avg Response Time:    {elapsed_time / self.total_messages * 1000:.2f}ms per message")
        print("=" * 80)

        if self.errors:
            print("\n⚠ Sample Errors (first 10):")
            for i, error in enumerate(self.errors[:10], 1):
                print(f"  {i}. {error}")

        print("\n💡 Next Steps:")
        print("  1. Check the worker logs to see batch processing")
        print("  2. Open the dashboard at http://localhost:3000")
        print("  3. Verify the throughput chart shows the spike")
        print("  4. Check Redis metrics:")
        print("     docker exec -it message-buffer redis-cli")
        print("     GET total_messages")
        print("     GET current_rps")
        print("     LLEN pending_messages")
        print()


async def main():
    parser = argparse.ArgumentParser(
        description="Load test the high-speed message ingestor"
    )
    parser.add_argument(
        "--messages",
        type=int,
        default=1000,
        help="Total number of messages to send (default: 1000)"
    )
    parser.add_argument(
        "--concurrent",
        type=int,
        default=50,
        help="Number of concurrent requests (default: 50)"
    )
    parser.add_argument(
        "--url",
        type=str,
        default="http://localhost:8000",
        help="API URL (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick test mode (1000 messages, 50 concurrent)"
    )
    parser.add_argument(
        "--stress",
        action="store_true",
        help="Stress test mode (10000 messages, 200 concurrent)"
    )
    parser.add_argument(
        "--extreme",
        action="store_true",
        help="Extreme test mode (50000 messages, 500 concurrent)"
    )

    args = parser.parse_args()

    # Apply preset modes
    if args.quick:
        messages = 1000
        concurrent = 50
    elif args.stress:
        messages = 10000
        concurrent = 200
    elif args.extreme:
        messages = 50000
        concurrent = 500
    else:
        messages = args.messages
        concurrent = args.concurrent

    tester = LoadTester(
        api_url=args.url,
        total_messages=messages,
        concurrent_requests=concurrent,
    )

    try:
        await tester.run_load_test()
    except KeyboardInterrupt:
        print("\n\n⚠ Load test interrupted by user")
        print(f"Sent {tester.successful_requests} messages before interruption")
    except Exception as e:
        print(f"\n\n✗ Load test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
