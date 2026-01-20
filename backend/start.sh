#!/bin/bash

# High-Speed Ingestor - Local Development Start Script
# This script runs the API and Worker locally without Docker

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default environment variables for local development
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_DB="${POSTGRES_DB:-messages_db}"
export POSTGRES_USER="${POSTGRES_USER:-ingestor}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ingestor_password}"
export BATCH_SIZE="${BATCH_SIZE:-50}"
export BATCH_TIMEOUT="${BATCH_TIMEOUT:-2}"

# Change to backend directory
cd "$(dirname "$0")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}High-Speed Message Ingestor - Local Dev${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is open
check_port() {
    nc -z "$1" "$2" >/dev/null 2>&1
}

# Check Python version
if ! command_exists python3; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo -e "${GREEN}✓${NC} Python version: $(python3 --version)"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Check Redis connection
echo -e "${YELLOW}Checking Redis connection...${NC}"
if check_port "$REDIS_HOST" "$REDIS_PORT"; then
    echo -e "${GREEN}✓${NC} Redis is running at ${REDIS_HOST}:${REDIS_PORT}"
else
    echo -e "${RED}✗${NC} Redis is not running at ${REDIS_HOST}:${REDIS_PORT}"
    echo -e "${YELLOW}Starting Redis with Docker...${NC}"
    echo "Run: docker run -d -p 6379:6379 redis:7-alpine"
    exit 1
fi

# Check PostgreSQL connection
echo -e "${YELLOW}Checking PostgreSQL connection...${NC}"
if check_port "$POSTGRES_HOST" "$POSTGRES_PORT"; then
    echo -e "${GREEN}✓${NC} PostgreSQL is running at ${POSTGRES_HOST}:${POSTGRES_PORT}"
else
    echo -e "${RED}✗${NC} PostgreSQL is not running at ${POSTGRES_HOST}:${POSTGRES_PORT}"
    echo -e "${YELLOW}Start PostgreSQL with Docker...${NC}"
    echo "Run: docker-compose -f ../infrastructure/docker-compose.yml up postgres -d"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Configuration:${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Redis:      ${REDIS_HOST}:${REDIS_PORT}"
echo "PostgreSQL: ${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo "Batch Size: ${BATCH_SIZE} messages"
echo "Timeout:    ${BATCH_TIMEOUT}s"
echo ""

# Parse command line arguments
SERVICE="${1:-both}"

case "$SERVICE" in
    api)
        echo -e "${GREEN}Starting FastAPI server...${NC}"
        echo -e "${YELLOW}API will be available at: http://localhost:8000${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""
        uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
        ;;

    worker)
        echo -e "${GREEN}Starting Batch Worker...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
        echo ""
        python worker/processor.py
        ;;

    both)
        echo -e "${GREEN}Starting API and Worker in parallel...${NC}"
        echo -e "${YELLOW}API: http://localhost:8000${NC}"
        echo -e "${YELLOW}Press Ctrl+C to stop both services${NC}"
        echo ""

        # Trap Ctrl+C and kill both processes
        trap 'kill $API_PID $WORKER_PID 2>/dev/null; exit' INT TERM

        # Start API in background
        uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload &
        API_PID=$!

        # Give API time to start
        sleep 2

        # Start Worker in background
        python worker/processor.py &
        WORKER_PID=$!

        echo -e "${GREEN}✓${NC} API running (PID: $API_PID)"
        echo -e "${GREEN}✓${NC} Worker running (PID: $WORKER_PID)"
        echo ""

        # Wait for both processes
        wait $API_PID $WORKER_PID
        ;;

    *)
        echo "Usage: $0 [api|worker|both]"
        echo ""
        echo "Options:"
        echo "  api    - Start only the FastAPI server"
        echo "  worker - Start only the batch worker"
        echo "  both   - Start both API and worker (default)"
        echo ""
        echo "Examples:"
        echo "  ./start.sh              # Start both services"
        echo "  ./start.sh api          # Start only API"
        echo "  ./start.sh worker       # Start only worker"
        exit 1
        ;;
esac
