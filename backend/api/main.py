import os
import json
import logging
import asyncio
import random
import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import redis
import psycopg2
import psycopg2.extras

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="High-Speed Message Ingestor")

# CORS Middleware - Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis connection
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)
REDIS_LIST_KEY = "pending_messages"
REDIS_QUEUED_IDS_KEY = "queued_message_ids"  # Track message IDs in queue
REDIS_BATCH_CHANNEL = "batch_notifications"  # Pub/sub channel for batch events

try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True,
        socket_connect_timeout=5
    )
    redis_client.ping()
    logger.info(f"Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
except Exception as e:
    logger.error(f"Failed to connect to Redis: {e}")
    redis_client = None

# PostgreSQL connection
# In Docker: DB_HOST=postgres (service name), locally: DB_HOST=localhost
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "messages_db")
DB_USER = os.getenv("DB_USER", "ingestor")
DB_PASSWORD = os.getenv("DB_PASSWORD", "ingestor_password")

# Batch configuration
BATCH_SIZE = 50  # Messages per batch
BATCH_TIMEOUT_SECONDS = 2  # Timeout before flushing incomplete batch


def get_db_connection():
    """Create PostgreSQL connection"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            connect_timeout=5
        )
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")
        return None


class Message(BaseModel):
    user_id: int = Field(..., gt=0, description="User ID must be a positive integer")
    channel_id: int = Field(..., gt=0, description="Channel ID must be a positive integer")
    content: str = Field(..., min_length=1, max_length=2000, description="Message content")

    @validator('content')
    def content_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Content cannot be empty or whitespace only')
        return v.strip()


class MessageResponse(BaseModel):
    message_id: str
    status: str
    queued_at: str


class MessageFromDB(BaseModel):
    id: int
    user_id: int
    channel_id: int
    content: str
    created_at: str
    inserted_at: str


class SimulationRequest(BaseModel):
    count: int = Field(default=500, ge=1, le=10000, description="Number of messages to simulate (1-10000)")


class QueuedMessage(BaseModel):
    """Message with tracking ID for lifecycle visualization"""
    tracking_id: str
    user_id: int
    channel_id: int
    content: str
    created_at: str
    status: str = "queued"  # queued, persisted


@app.get("/")
async def root():
    return {
        "service": "High-Speed Message Ingestor",
        "status": "running",
        "batch_config": {
            "batch_size": BATCH_SIZE,
            "timeout_seconds": BATCH_TIMEOUT_SECONDS
        },
        "endpoints": {
            "POST /messages": "Submit a new message to the queue",
            "POST /simulate": "Run burst simulation with configurable count",
            "GET /messages": "Get last N messages from database",
            "GET /health": "Health check endpoint",
            "GET /queue/status": "Get current queue status and pending messages",
            "WS /ws/stats": "WebSocket for real-time stats and batch events"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint to verify service and Redis connectivity"""
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis connection not available"
        )

    try:
        redis_client.ping()
        queue_length = redis_client.llen(REDIS_LIST_KEY)
        return {
            "status": "healthy",
            "redis": "connected",
            "queue_length": queue_length,
            "batch_threshold": BATCH_SIZE,
            "batch_progress": queue_length % BATCH_SIZE,
            "batches_pending": queue_length // BATCH_SIZE
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis health check failed: {str(e)}"
        )


@app.delete("/reset")
async def reset_database():
    """
    Reset all data for demo purposes.
    Clears PostgreSQL messages table and Redis queues.
    """
    deleted_messages = 0
    deleted_queue = 0

    # Clear PostgreSQL
    conn = get_db_connection()
    if conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM messages")
                deleted_messages = cursor.rowcount
                conn.commit()
            logger.info(f"Deleted {deleted_messages} messages from PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to clear PostgreSQL: {e}")
            conn.rollback()
        finally:
            conn.close()

    # Clear Redis queues
    if redis_client:
        try:
            deleted_queue = redis_client.llen(REDIS_LIST_KEY)
            redis_client.delete(REDIS_LIST_KEY)
            redis_client.delete(REDIS_QUEUED_IDS_KEY)
            redis_client.delete("persisted_message_ids")
            redis_client.delete("last_persisted_ids")
            redis_client.delete("total_messages")
            redis_client.delete("total_batches")
            redis_client.delete("current_rps")
            redis_client.delete("worker_buffer_size")
            redis_client.delete("batch_start_time")
            logger.info(f"Cleared Redis queue with {deleted_queue} pending messages")
        except Exception as e:
            logger.error(f"Failed to clear Redis: {e}")

    return {
        "status": "reset_complete",
        "deleted_messages": deleted_messages,
        "cleared_queue": deleted_queue,
    }


@app.get("/queue/status")
async def get_queue_status():
    """
    Get detailed queue status including pending messages for lifecycle tracking.
    Returns the current queue depth, batch progress, and list of queued message IDs.
    """
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis connection not available"
        )

    try:
        queue_length = redis_client.llen(REDIS_LIST_KEY)

        # Get queued message tracking IDs
        queued_ids = redis_client.lrange(REDIS_QUEUED_IDS_KEY, 0, -1)

        # Get last batch completion info
        last_batch_id = redis_client.get("last_batch_id")
        last_batch_size = redis_client.get("last_batch_size")
        last_batch_time = redis_client.get("last_batch_time")

        return {
            "queue_length": queue_length,
            "batch_threshold": BATCH_SIZE,
            "batch_progress": queue_length % BATCH_SIZE,
            "batches_ready": queue_length // BATCH_SIZE,
            "queued_message_ids": queued_ids[:100],  # Limit to last 100 for performance
            "last_batch": {
                "batch_id": last_batch_id,
                "size": int(last_batch_size) if last_batch_size else 0,
                "completed_at": last_batch_time
            }
        }
    except Exception as e:
        logger.error(f"Error getting queue status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get queue status"
        )


@app.post("/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(message: Message):
    """
    Ingest a new message into the Redis queue for batch processing.
    Each message is assigned a tracking ID for lifecycle visualization.
    """
    if redis_client is None:
        logger.error("Redis client not available")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Message queue service unavailable"
        )

    try:
        # Generate unique tracking ID
        tracking_id = str(uuid.uuid4())[:8]
        timestamp = datetime.utcnow().isoformat()

        message_payload = {
            "tracking_id": tracking_id,
            "user_id": message.user_id,
            "channel_id": message.channel_id,
            "content": message.content,
            "created_at": timestamp
        }

        # Push to Redis queue
        redis_client.lpush(REDIS_LIST_KEY, json.dumps(message_payload))

        # Track the message ID for lifecycle visualization
        redis_client.lpush(REDIS_QUEUED_IDS_KEY, tracking_id)
        # Keep only last 1000 tracking IDs
        redis_client.ltrim(REDIS_QUEUED_IDS_KEY, 0, 999)

        queue_length = redis_client.llen(REDIS_LIST_KEY)

        logger.info(
            f"Message queued - ID: {tracking_id}, User: {message.user_id}, "
            f"Queue length: {queue_length}, Batch progress: {queue_length % BATCH_SIZE}/{BATCH_SIZE}"
        )

        return MessageResponse(
            message_id=tracking_id,
            status="queued",
            queued_at=timestamp
        )

    except redis.RedisError as e:
        logger.error(f"Redis error while queuing message: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue message"
        )


@app.get("/messages", response_model=List[MessageFromDB])
async def get_messages(limit: int = 50):
    """
    Retrieve the last N messages from PostgreSQL (persisted messages).
    """
    conn = get_db_connection()
    if conn is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable"
        )

    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, user_id, channel_id, content, created_at, inserted_at
                FROM messages
                ORDER BY inserted_at DESC
                LIMIT %s
            """, (limit,))

            rows = cursor.fetchall()

            messages = []
            for row in rows:
                messages.append({
                    "id": row[0],
                    "user_id": row[1],
                    "channel_id": row[2],
                    "content": row[3],
                    "created_at": row[4].isoformat(),
                    "inserted_at": row[5].isoformat(),
                })

            logger.info(f"Retrieved {len(messages)} persisted messages from database")
            return messages

    except Exception as e:
        logger.error(f"Error fetching messages from database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch messages from database"
        )
    finally:
        conn.close()


# Realistic chat messages for simulation
REALISTIC_MESSAGES = [
    "Hey everyone! How's it going?",
    "Just pushed the latest changes to main",
    "Can someone review my PR when they get a chance?",
    "The new feature is looking great!",
    "Anyone up for a quick sync?",
    "Just deployed to staging, testing now",
    "Found a bug in the auth flow, fixing it",
    "Great work on the dashboard!",
    "Need help with the API integration",
    "Coffee break anyone? ☕",
    "The tests are passing now",
    "Updated the docs with the new endpoints",
    "Server's running smoothly",
    "Quick question about the database schema",
    "Just finished the code review",
    "Working on the performance optimization",
    "The metrics look good today",
    "Anyone seen this error before?",
    "Fixed the memory leak issue",
    "Ready for the demo tomorrow",
    "Just merged the feature branch",
    "Need to update the dependencies",
    "The pipeline is running faster now",
    "Check out the new monitoring dashboard",
    "Debugging the WebSocket connection",
    "The batch processing is working well",
    "Added more logging for debugging",
    "Optimized the database queries",
    "The cache hit rate improved",
    "Rolling back the last deployment",
    "All systems operational",
    "Investigating the latency spike",
    "The load balancer is configured correctly",
    "Scaling up the worker instances",
    "The queue is draining nicely",
]


def send_burst_messages_sync(count: int) -> List[str]:
    """
    Synchronous function to send burst messages to Redis.
    Returns list of tracking IDs for the sent messages.
    """
    if redis_client is None:
        logger.error("Redis client not available for simulation")
        return []

    logger.info(f"Starting burst simulation: {count} messages")
    tracking_ids = []

    try:
        # Use pipeline for better performance
        pipe = redis_client.pipeline()

        for i in range(count):
            tracking_id = str(uuid.uuid4())[:8]
            timestamp = datetime.utcnow().isoformat()

            # Pick a realistic message randomly
            content = random.choice(REALISTIC_MESSAGES)

            message_payload = {
                "tracking_id": tracking_id,
                "user_id": random.randint(1, 10000),
                "channel_id": random.randint(1, 100),
                "content": content,
                "created_at": timestamp
            }

            pipe.lpush(REDIS_LIST_KEY, json.dumps(message_payload))
            pipe.lpush(REDIS_QUEUED_IDS_KEY, tracking_id)
            tracking_ids.append(tracking_id)

        # Execute all commands at once
        pipe.execute()

        # Trim tracking IDs list
        redis_client.ltrim(REDIS_QUEUED_IDS_KEY, 0, 999)

        logger.info(f"Burst simulation completed: {count} messages queued")
        return tracking_ids

    except Exception as e:
        logger.error(f"Error in burst simulation: {e}")
        return tracking_ids


@app.post("/simulate", status_code=status.HTTP_202_ACCEPTED)
async def run_simulation(request: SimulationRequest):
    """
    Burst simulation endpoint with configurable message count.

    Educational purpose: Demonstrates how messages queue up and get batched.
    - If you send 10 messages, they stay as 'Queued' until batch threshold (50) is met
    - If you send 100 messages, you'll see 2 batches complete (50 each)

    Returns the tracking IDs so the frontend can track their lifecycle.
    """
    if redis_client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Message queue service unavailable"
        )

    count = request.count

    # Send messages synchronously and get the tracking IDs
    tracking_ids = send_burst_messages_sync(count)

    # Calculate expected batches
    current_queue = redis_client.llen(REDIS_LIST_KEY)
    total_after = current_queue
    complete_batches = total_after // BATCH_SIZE
    remaining = total_after % BATCH_SIZE

    return {
        "status": "simulation_started",
        "messages_count": count,
        "tracking_ids": tracking_ids,  # Return the actual IDs for frontend tracking
        "current_queue": current_queue,
        "expected_total": total_after,
        "expected_complete_batches": complete_batches,
        "expected_remaining_queued": remaining,
        "batch_threshold": BATCH_SIZE,
        "message": f"Injecting {count} messages. {complete_batches} batch(es) will flush, {remaining} will remain queued."
    }

@app.websocket("/ws/stats")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket client connected")

    # Track stats for throughput calculation
    last_total_messages = 0
    last_check_time = asyncio.get_event_loop().time()

    # Create a separate Redis connection for pub/sub
    pubsub = None
    pubsub_client = None
    try:
        pubsub_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=5
        )
        pubsub = pubsub_client.pubsub()
        pubsub.subscribe(REDIS_BATCH_CHANNEL)
        logger.info(f"Subscribed to Redis channel: {REDIS_BATCH_CHANNEL}")
    except Exception as e:
        logger.warning(f"Failed to subscribe to Redis channel: {e}")

    try:
        while True:
            try:
                # Check for pub/sub messages (non-blocking)
                if pubsub:
                    message = pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
                    if message and message['type'] == 'message':
                        try:
                            batch_event = json.loads(message['data'])
                            # Forward the batch_persisted event immediately
                            if batch_event.get('type') == 'persisted':
                                persisted_event = {
                                    "type": "batch_persisted",
                                    "ids": batch_event.get('ids', []),
                                    "batch_id": batch_event.get('batch_id'),
                                    "batch_size": batch_event.get('batch_size', 0),
                                    "worker_timestamp": batch_event.get('timestamp'),
                                }
                                logger.info(f"🟢 Broadcasting batch_persisted with {len(persisted_event['ids'])} IDs from batch {batch_event.get('batch_id')} at {batch_event.get('timestamp')}")
                                await websocket.send_json(persisted_event)
                        except json.JSONDecodeError:
                            pass

                # Get queue stats from Redis
                # queue_depth combines: messages still in Redis queue + messages in worker's buffer
                redis_queue_depth = redis_client.llen(REDIS_LIST_KEY) if redis_client else 0
                worker_buffer_size = 0
                if redis_client:
                    buffer_size_str = redis_client.get("worker_buffer_size")
                    worker_buffer_size = int(buffer_size_str) if buffer_size_str else 0

                # Total queue depth = Redis queue + worker's internal buffer
                queue_depth = redis_queue_depth + worker_buffer_size

                # Read worker's real-time metrics from Redis (set by the batch processor)
                total_messages = 0
                total_batches = 0
                messages_per_second = 0
                avg_batch_size = 0.0

                if redis_client:
                    try:
                        # Read metrics that the worker updates in real-time
                        total_messages_str = redis_client.get("total_messages")
                        total_batches_str = redis_client.get("total_batches")
                        current_rps_str = redis_client.get("current_rps")

                        total_messages = int(total_messages_str) if total_messages_str else 0
                        total_batches = int(total_batches_str) if total_batches_str else 0
                        messages_per_second = int(float(current_rps_str)) if current_rps_str else 0

                        # Calculate avg batch size
                        if total_batches > 0:
                            avg_batch_size = total_messages / total_batches
                    except (ValueError, TypeError) as e:
                        logger.debug(f"Error reading Redis metrics: {e}")
                        # Fallback to DB count if Redis metrics not available
                        conn = get_db_connection()
                        if conn:
                            try:
                                with conn.cursor() as cursor:
                                    cursor.execute("SELECT COUNT(*) FROM messages")
                                    result = cursor.fetchone()
                                    total_messages = result[0] if result else 0
                            except Exception as db_err:
                                logger.warning(f"DB query error: {db_err}")
                            finally:
                                conn.close()

                batch_progress = queue_depth % BATCH_SIZE
                batch_progress_percent = (batch_progress / BATCH_SIZE) * 100 if BATCH_SIZE > 0 else 0

                # Build stats payload matching frontend expectations
                stats_data = {
                    "type": "stats_update",
                    "total_messages": total_messages,
                    "queue_depth": queue_depth,
                    "messages_per_second": messages_per_second,
                    "total_batches": total_batches,
                    "avg_batch_size": round(avg_batch_size, 1),
                    "batch_threshold": BATCH_SIZE,
                    "batch_progress": batch_progress,
                    "batch_progress_percent": round(batch_progress_percent, 1),
                    "batches_ready": queue_depth // BATCH_SIZE,
                }

                await websocket.send_json(stats_data)

            except Exception as e:
                logger.warning(f"Error gathering stats: {e}")
                # Send safe defaults on error
                await websocket.send_json({
                    "type": "stats_update",
                    "total_messages": 0,
                    "queue_depth": 0,
                    "messages_per_second": 0,
                    "total_batches": 0,
                    "avg_batch_size": 0,
                    "batch_threshold": BATCH_SIZE,
                    "batch_progress": 0,
                    "batch_progress_percent": 0,
                    "batches_ready": 0,
                })

            await asyncio.sleep(0.5)  # Faster polling for more responsive updates

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if pubsub:
            try:
                pubsub.unsubscribe()
                pubsub.close()
            except Exception:
                pass
        if pubsub_client:
            try:
                pubsub_client.close()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
    
@app.on_event("shutdown")
async def shutdown_event():
    """Clean up Redis connection on shutdown"""
    if redis_client:
        redis_client.close()
        logger.info("Redis connection closed")
