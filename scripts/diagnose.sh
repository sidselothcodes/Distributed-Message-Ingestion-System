#!/bin/bash

# System Diagnostic Script for High-Speed Ingestor
# Checks all connection points between frontend and backend

echo "========================================================================"
echo "HIGH-SPEED INGESTOR - SYSTEM DIAGNOSTIC"
echo "========================================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASS=0
FAIL=0

# Function to test endpoint
test_endpoint() {
    local url=$1
    local name=$2

    echo -n "Testing $name... "
    if curl -s -f -m 5 "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASS++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  URL: $url"
        ((FAIL++))
        return 1
    fi
}

# Function to test WebSocket
test_websocket() {
    local url=$1
    local name=$2

    echo -n "Testing $name... "

    # Use Python to test WebSocket
    python3 - <<EOF 2>/dev/null
import asyncio
import sys
try:
    from websockets import connect
    async def test():
        try:
            async with connect('$url', timeout=5) as ws:
                await ws.recv()
                return True
        except:
            return False
    result = asyncio.run(test())
    sys.exit(0 if result else 1)
except ImportError:
    # If websockets not installed, try with telnet
    import socket
    try:
        host, port = '$url'.replace('ws://', '').split(':')
        port = int(port.split('/')[0])
        s = socket.socket()
        s.settimeout(5)
        s.connect((host, port))
        s.close()
        sys.exit(0)
    except:
        sys.exit(1)
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASS++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        echo "  URL: $url"
        ((FAIL++))
    fi
}

echo "1. Backend Health Checks"
echo "------------------------"

# Test API root
test_endpoint "http://localhost:8000/" "API Root"

# Test health endpoint
test_endpoint "http://localhost:8000/health" "Health Endpoint"

# Test with 127.0.0.1
test_endpoint "http://127.0.0.1:8000/health" "Health Endpoint (127.0.0.1)"

echo ""
echo "2. CORS Configuration"
echo "---------------------"

# Test CORS headers
echo -n "Testing CORS headers... "
CORS_HEADER=$(curl -s -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    -X OPTIONS http://localhost:8000/health \
    -I 2>/dev/null | grep -i "access-control-allow-origin")

if [ -n "$CORS_HEADER" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    echo "  $CORS_HEADER"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  CORS headers not found"
    ((FAIL++))
fi

echo ""
echo "3. WebSocket Connection"
echo "-----------------------"

# Test WebSocket endpoint
test_websocket "ws://localhost:8000/ws/stats" "WebSocket Endpoint"

echo ""
echo "4. Redis Connection"
echo "-------------------"

# Check if Redis is accessible
echo -n "Testing Redis... "
if docker exec message-buffer redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"

    # Get current metrics
    TOTAL_MESSAGES=$(docker exec message-buffer redis-cli GET total_messages 2>/dev/null || echo "0")
    CURRENT_RPS=$(docker exec message-buffer redis-cli GET current_rps 2>/dev/null || echo "0")
    QUEUE_LENGTH=$(docker exec message-buffer redis-cli LLEN pending_messages 2>/dev/null || echo "0")

    echo "  Total Messages: $TOTAL_MESSAGES"
    echo "  Current RPS: $CURRENT_RPS"
    echo "  Queue Length: $QUEUE_LENGTH"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  Redis container not accessible"
    ((FAIL++))
fi

echo ""
echo "5. PostgreSQL Connection"
echo "------------------------"

echo -n "Testing PostgreSQL... "
if docker exec message-db pg_isready -U ingestor > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}"

    # Get message count
    MSG_COUNT=$(docker exec message-db psql -U ingestor -d messages_db -t -c "SELECT COUNT(*) FROM messages;" 2>/dev/null | tr -d ' ')
    echo "  Messages in DB: ${MSG_COUNT:-0}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  PostgreSQL container not accessible"
    ((FAIL++))
fi

echo ""
echo "6. Docker Services"
echo "------------------"

# Check running containers
echo "Docker containers:"
docker ps --filter "name=message" --format "  {{.Names}}: {{.Status}}" 2>/dev/null || echo "  Docker not running"

echo ""
echo "7. Frontend Configuration"
echo "-------------------------"

# Check .env.local
if [ -f "../frontend/.env.local" ]; then
    echo -e "${GREEN}✓${NC} .env.local exists"
    echo "Contents:"
    cat ../frontend/.env.local | grep -v "^#" | grep -v "^$" | sed 's/^/  /'
else
    echo -e "${RED}✗${NC} .env.local NOT FOUND"
    echo "  Create frontend/.env.local with:"
    echo "  NEXT_PUBLIC_API_URL=http://localhost:8000"
    echo "  NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/stats"
fi

echo ""
echo "8. Network Connectivity"
echo "-----------------------"

# Test if ports are listening
echo -n "Port 8000 (API): "
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep ":8000.*LISTEN" >/dev/null; then
    echo -e "${GREEN}✓ LISTENING${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ NOT LISTENING${NC}"
    ((FAIL++))
fi

echo -n "Port 3000 (Frontend): "
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep ":3000.*LISTEN" >/dev/null; then
    echo -e "${GREEN}✓ LISTENING${NC}"
else
    echo -e "${YELLOW}✗ NOT LISTENING${NC} (Frontend not running)"
fi

echo ""
echo "========================================================================"
echo "DIAGNOSTIC SUMMARY"
echo "========================================================================"
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All systems operational!${NC}"
    echo ""
    echo "If dashboard still shows connection error:"
    echo "  1. Restart Next.js dev server (Ctrl+C, then 'npm run dev')"
    echo "  2. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)"
    echo "  3. Check browser console for errors (F12)"
    exit 0
else
    echo -e "${RED}✗ Issues detected!${NC}"
    echo ""
    echo "Troubleshooting steps:"

    if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "  1. Backend not responding - restart it:"
        echo "     cd infrastructure && docker-compose restart api"
    fi

    if ! docker exec message-buffer redis-cli ping > /dev/null 2>&1; then
        echo "  2. Redis not accessible - check Docker:"
        echo "     docker-compose ps"
        echo "     docker-compose up redis -d"
    fi

    echo "  3. Check logs:"
    echo "     docker-compose logs api"
    echo "     docker-compose logs worker"
    exit 1
fi
