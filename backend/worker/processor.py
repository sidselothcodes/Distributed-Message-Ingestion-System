import os
import json
import time
import logging
import uuid
from typing import List, Dict
from datetime import datetime

import redis
import psycopg2
import psycopg2.extras

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration from environment variables
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_LIST_KEY = "pending_messages"
REDIS_QUEUED_IDS_KEY = "queued_message_ids"
REDIS_PERSISTED_IDS_KEY = "persisted_message_ids"
REDIS_BATCH_CHANNEL = "batch_notifications"  # Pub/sub channel for batch events

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", 5432))
POSTGRES_DB = os.getenv("POSTGRES_DB", "messages_db")
POSTGRES_USER = os.getenv("POSTGRES_USER", "ingestor")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "ingestor_password")

BATCH_SIZE = int(os.getenv("BATCH_SIZE", 50))
BATCH_TIMEOUT = float(os.getenv("BATCH_TIMEOUT", 30.0))  # seconds - increased for demo visibility


class BatchProcessor:
    def __init__(self):
        self.redis_client = None
        self.pg_conn = None
        self.message_buffer: List[Dict] = []
        self.batch_start_time: float = None  # Time when current batch started (first message arrived)
        self.total_processed = 0
        self.total_batches = 0

        # RPS tracking - improved with per-message granularity
        self.rps_window_size = 10  # Track last 10 seconds
        self.rps_message_count = 0  # Count messages in current window
        self.rps_window_start = time.time()

        # Latency tracking
        self.latency_samples: List[float] = []  # Recent latency samples
        self.latency_window_size = 100  # Keep last 100 samples

    def connect_redis(self):
        """Establish Redis connection"""
        try:
            self.redis_client = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD,
                decode_responses=True,
                socket_connect_timeout=5
            )
            self.redis_client.ping()
            logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")

            # Initialize Redis metrics if they don't exist
            if not self.redis_client.exists("total_messages"):
                self.redis_client.set("total_messages", 0)
                logger.info("Initialized total_messages to 0")

            if not self.redis_client.exists("total_batches"):
                self.redis_client.set("total_batches", 0)
                logger.info("Initialized total_batches to 0")

            if not self.redis_client.exists("current_rps"):
                self.redis_client.set("current_rps", 0)
                logger.info("Initialized current_rps to 0")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

    def connect_postgres(self):
        """Establish PostgreSQL connection"""
        try:
            self.pg_conn = psycopg2.connect(
                host=POSTGRES_HOST,
                port=POSTGRES_PORT,
                dbname=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                connect_timeout=5
            )
            logger.info(f"Connected to PostgreSQL at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise

    def should_flush(self) -> bool:
        """
        Determine if we should flush the batch.
        Flush when:
        - We have BATCH_SIZE messages, OR
        - BATCH_TIMEOUT seconds have passed since the FIRST message of this batch arrived
        """
        # Flush if we've reached the batch size threshold
        if len(self.message_buffer) >= BATCH_SIZE:
            logger.info(f"🔔 Flush triggered: batch size reached ({len(self.message_buffer)}/{BATCH_SIZE})")
            return True

        # Flush if timeout has passed since the batch started (first message arrived)
        if len(self.message_buffer) > 0 and self.batch_start_time is not None:
            time_since_batch_start = time.time() - self.batch_start_time
            if time_since_batch_start >= BATCH_TIMEOUT:
                logger.info(f"🔔 Flush triggered: timeout reached ({time_since_batch_start:.1f}s >= {BATCH_TIMEOUT}s)")
                logger.info(f"   BATCH_TIMEOUT={BATCH_TIMEOUT}, batch_start_time={self.batch_start_time}, now={time.time()}")
                return True
            else:
                # Debug: show why we're NOT flushing yet
                logger.debug(f"⏳ Not flushing yet: {time_since_batch_start:.1f}s < {BATCH_TIMEOUT}s timeout")

        return False

    def calculate_message_latencies(self, batch_data: List[tuple]) -> List[float]:
        """
        Calculate latency for each message in the batch.
        Latency = time from message creation to DB commit.

        Args:
            batch_data: List of tuples containing message data

        Returns:
            List of latency values in milliseconds
        """
        latencies = []
        current_time = time.time()

        for msg_data in batch_data:
            # msg_data[3] is created_at timestamp (ISO format string)
            created_at_str = msg_data[3]
            try:
                # Parse ISO timestamp
                created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                created_timestamp = created_at.timestamp()

                # Calculate latency in milliseconds
                latency_ms = (current_time - created_timestamp) * 1000
                latencies.append(latency_ms)
            except Exception as e:
                logger.warning(f"Failed to parse timestamp {created_at_str}: {e}")
                continue

        return latencies

    def update_redis_metrics(self, batch_size: int, latencies: List[float], batch_duration: float, persisted_ids: List[str]):
        """
        Update Redis metrics for dashboard real-time updates.

        Updates:
        - total_messages: Increments by batch_size (only after PostgreSQL commit)
        - total_batches: Increments by 1 (only after successful flush)
        - current_rps: Calculated using sliding window (messages per second)
        - avg_latency_ms: Average end-to-end latency
        - p95_latency_ms: 95th percentile latency
        - p99_latency_ms: 99th percentile latency
        - persisted_message_ids: List of recently persisted tracking IDs
        - last_batch_*: Info about the last completed batch
        """
        try:
            # Generate unique batch ID
            batch_id = str(uuid.uuid4())[:8]
            batch_time = datetime.utcnow().isoformat()

            # Increment total messages counter (only for successfully persisted messages)
            self.redis_client.incrby("total_messages", batch_size)

            # Increment total batches counter (only after successful flush)
            self.redis_client.incr("total_batches")

            # Store batch completion info for WebSocket broadcast
            self.redis_client.set("last_batch_id", batch_id)
            self.redis_client.set("last_batch_size", batch_size)
            self.redis_client.set("last_batch_time", batch_time)

            # Store persisted message IDs for frontend status updates
            if persisted_ids:
                pipe = self.redis_client.pipeline()
                for tracking_id in persisted_ids:
                    pipe.lpush(REDIS_PERSISTED_IDS_KEY, tracking_id)
                pipe.execute()
                # Keep only last 200 persisted IDs
                self.redis_client.ltrim(REDIS_PERSISTED_IDS_KEY, 0, 199)

                # Store last batch's persisted IDs for WebSocket to broadcast
                # This key is read and cleared by the WebSocket handler
                self.redis_client.set("last_persisted_ids", json.dumps(persisted_ids))

                # Also remove from queued IDs list
                for tracking_id in persisted_ids:
                    self.redis_client.lrem(REDIS_QUEUED_IDS_KEY, 0, tracking_id)

            # Update RPS tracking with improved sliding window
            current_time = time.time()
            self.rps_message_count += batch_size

            # Check if we need to reset the window (every 10 seconds)
            time_since_window_start = current_time - self.rps_window_start
            if time_since_window_start >= self.rps_window_size:
                # Calculate RPS for this window
                current_rps = self.rps_message_count / time_since_window_start

                # Reset window
                self.rps_message_count = 0
                self.rps_window_start = current_time
            else:
                # Calculate ongoing RPS
                current_rps = self.rps_message_count / max(time_since_window_start, 0.1)

            # Update Redis with current RPS
            self.redis_client.set("current_rps", f"{current_rps:.2f}")

            # Update latency metrics
            if latencies:
                # Add to samples (keep last 100)
                self.latency_samples.extend(latencies)
                self.latency_samples = self.latency_samples[-self.latency_window_size:]

                # Calculate statistics
                avg_latency = sum(latencies) / len(latencies)
                sorted_latencies = sorted(self.latency_samples)
                p95_latency = sorted_latencies[int(len(sorted_latencies) * 0.95)] if sorted_latencies else 0
                p99_latency = sorted_latencies[int(len(sorted_latencies) * 0.99)] if sorted_latencies else 0

                # Store in Redis
                self.redis_client.set("avg_latency_ms", f"{avg_latency:.2f}")
                self.redis_client.set("p95_latency_ms", f"{p95_latency:.2f}")
                self.redis_client.set("p99_latency_ms", f"{p99_latency:.2f}")

                logger.debug(
                    f"Latency metrics - Avg: {avg_latency:.2f}ms, "
                    f"P95: {p95_latency:.2f}ms, P99: {p99_latency:.2f}ms"
                )

            # CRITICAL: Publish batch completion event via Redis pub/sub
            # This is how the WebSocket server knows to broadcast to frontend
            batch_event = {
                "type": "persisted",
                "batch_id": batch_id,
                "batch_size": batch_size,
                "ids": persisted_ids,  # List of message IDs that were persisted
                "total_batches": self.total_batches,
                "total_messages": self.total_processed,
                "timestamp": batch_time
            }
            self.redis_client.publish(REDIS_BATCH_CHANNEL, json.dumps(batch_event))
            logger.info(f"📡 Published persisted event to channel '{REDIS_BATCH_CHANNEL}' with {len(persisted_ids)} IDs")

            logger.info(
                f"📊 Redis metrics updated - Total: {self.total_processed}, "
                f"Batches: {self.total_batches}, RPS: {current_rps:.2f}, "
                f"Batch ID: {batch_id}"
            )

        except redis.RedisError as e:
            logger.error(f"Failed to update Redis metrics: {e}")

    def flush_batch(self):
        """
        Bulk insert messages into PostgreSQL using executemany.
        This is where the magic happens - batching for high throughput!

        IMPORTANT: Metrics are only updated AFTER successful PostgreSQL commit.
        This ensures total_messages and total_batches reflect actual persisted data.
        """
        if not self.message_buffer:
            return

        batch_size = len(self.message_buffer)
        start_time = time.time()

        # Collect tracking IDs for status updates
        persisted_ids = [msg.get('tracking_id', '') for msg in self.message_buffer if msg.get('tracking_id')]

        try:
            with self.pg_conn.cursor() as cursor:
                # Prepare the INSERT statement
                insert_query = """
                    INSERT INTO messages (user_id, channel_id, content, created_at)
                    VALUES (%s, %s, %s, %s)
                """

                # Prepare batch data
                batch_data = [
                    (
                        msg['user_id'],
                        msg['channel_id'],
                        msg['content'],
                        msg['created_at']
                    )
                    for msg in self.message_buffer
                ]

                # Execute batch insert
                cursor.executemany(insert_query, batch_data)
                self.pg_conn.commit()

                # Calculate latencies for this batch
                latencies = self.calculate_message_latencies(batch_data)

                # Update statistics ONLY AFTER successful commit
                self.total_processed += batch_size
                self.total_batches += 1
                elapsed_time = time.time() - start_time

                # Update Redis metrics for real-time dashboard
                # Pass persisted_ids so frontend can update message statuses
                self.update_redis_metrics(batch_size, latencies, elapsed_time, persisted_ids)

                logger.info(
                    f"✓ Batch #{self.total_batches} saved successfully: "
                    f"{batch_size} messages in {elapsed_time:.3f}s "
                    f"({batch_size / elapsed_time:.0f} msg/s) | "
                    f"Total processed: {self.total_processed}"
                )

                # Clear the buffer and reset batch timer
                self.message_buffer.clear()
                self.batch_start_time = None  # Reset - no active batch

                # Reset buffer size in Redis
                self.redis_client.set("worker_buffer_size", 0)
                self.redis_client.delete("batch_start_time")

                logger.info("✅ Batch complete - timer reset, ready for next batch")

        except Exception as e:
            logger.error(f"Failed to flush batch: {e}")
            self.pg_conn.rollback()
            # Re-raise to handle in main loop
            raise

    def process_messages(self):
        """
        Main processing loop:
        1. Pull messages from Redis
        2. Add to buffer
        3. Flush when batch size or timeout is reached
        """
        logger.info(
            f"Starting batch processor - "
            f"Batch size: {BATCH_SIZE}, Timeout: {BATCH_TIMEOUT}s"
        )

        while True:
            try:
                # Non-blocking pop from Redis (RPOP for FIFO with LPUSH)
                # Using BRPOP with 1 second timeout to avoid busy-waiting
                result = self.redis_client.brpop(REDIS_LIST_KEY, timeout=1)

                if result:
                    # result is a tuple: (key, value)
                    _, message_json = result
                    message = json.loads(message_json)

                    # Start the batch timer when the FIRST message arrives
                    # This ensures the 30s timeout starts from when messages arrive,
                    # not from some arbitrary point in time
                    if len(self.message_buffer) == 0:
                        self.batch_start_time = time.time()
                        logger.info(f"⏱️ New batch started - 30s timeout begins NOW")

                    self.message_buffer.append(message)

                    # Update Redis with current buffer size so frontend can display it
                    self.redis_client.set("worker_buffer_size", len(self.message_buffer))
                    self.redis_client.set("batch_start_time", self.batch_start_time)

                    # Calculate and show remaining time until timeout
                    elapsed = time.time() - self.batch_start_time
                    remaining = max(0, BATCH_TIMEOUT - elapsed)
                    logger.info(
                        f"📥 Message buffered - Buffer: {len(self.message_buffer)}/{BATCH_SIZE} | "
                        f"Timeout in {remaining:.1f}s"
                    )

                # Check if we should flush the batch
                if self.should_flush():
                    self.flush_batch()

            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON in message: {e}")
                continue

            except KeyboardInterrupt:
                logger.info("Received shutdown signal")
                # Flush remaining messages before shutting down
                if self.message_buffer:
                    logger.info(f"Flushing remaining {len(self.message_buffer)} messages...")
                    self.flush_batch()
                break

            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                time.sleep(1)  # Brief pause before retrying

    def run(self):
        """Initialize connections and start processing"""
        try:
            self.connect_redis()
            self.connect_postgres()
            self.process_messages()
        except Exception as e:
            logger.error(f"Fatal error: {e}")
            raise
        finally:
            # Cleanup
            if self.redis_client:
                self.redis_client.close()
                logger.info("Redis connection closed")
            if self.pg_conn:
                self.pg_conn.close()
                logger.info("PostgreSQL connection closed")


if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("High-Speed Message Batch Processor")
    logger.info("=" * 60)
    logger.info(f"Configuration:")
    logger.info(f"  BATCH_SIZE: {BATCH_SIZE} messages")
    logger.info(f"  BATCH_TIMEOUT: {BATCH_TIMEOUT} seconds")
    logger.info(f"  (Source: {'env var' if os.getenv('BATCH_TIMEOUT') else 'default'})")
    logger.info("=" * 60)

    processor = BatchProcessor()
    processor.run()
