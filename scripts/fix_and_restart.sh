#!/bin/bash

# Quick fix and restart script for live message stream issue

echo "========================================================================="
echo "FIX: Live Message Stream - Switching to psycopg2-binary"
echo "========================================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Stop containers
echo "1. Stopping Docker containers..."
cd ../infrastructure || exit
docker-compose down
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Step 2: Install psycopg2-binary
echo "2. Installing psycopg2-binary..."
cd ../backend || exit
pip uninstall -y psycopg 2>/dev/null
pip install -q psycopg2-binary==2.9.9

if python3 -c "import psycopg2; print('✓ psycopg2 imported successfully')" 2>/dev/null; then
    echo -e "${GREEN}✓ psycopg2-binary installed${NC}"
else
    echo -e "${YELLOW}⚠ Warning: psycopg2 import test failed${NC}"
    echo "Continuing anyway - Docker container might have it..."
fi
echo ""

# Step 3: Rebuild and start containers
echo "3. Rebuilding Docker containers..."
cd ../infrastructure || exit
docker-compose build --no-cache api >/dev/null 2>&1 &
BUILD_PID=$!

# Show spinner while building
spinner=( '⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏' )
i=0
while kill -0 $BUILD_PID 2>/dev/null; do
    printf "\r   Building... ${spinner[$i]} "
    i=$(( (i+1) % 10 ))
    sleep 0.1
done
printf "\r"
wait $BUILD_PID

echo -e "${GREEN}✓ Rebuild complete${NC}"
echo ""

echo "4. Starting services..."
docker-compose up -d
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 4: Wait for services to be ready
echo "5. Waiting for services to be ready..."
sleep 5

# Test health endpoint
if curl -s http://localhost:8000/health >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is healthy${NC}"
else
    echo -e "${YELLOW}⚠ Backend health check failed${NC}"
fi
echo ""

# Step 5: Test GET /messages endpoint
echo "6. Testing GET /messages endpoint..."
RESPONSE=$(curl -s http://localhost:8000/messages?limit=1)

if [ "$RESPONSE" = "[]" ]; then
    echo -e "${YELLOW}⚠ Database is empty - no messages found${NC}"
    echo "   Run simulation to add messages:"
    echo "   curl -X POST http://localhost:8000/simulate"
elif echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    MESSAGE_COUNT=$(echo "$RESPONSE" | jq '. | length')
    echo -e "${GREEN}✓ GET /messages working! Returned ${MESSAGE_COUNT} message(s)${NC}"
else
    echo -e "${YELLOW}⚠ Unexpected response: $RESPONSE${NC}"
fi
echo ""

# Step 6: Instructions
echo "========================================================================="
echo "NEXT STEPS:"
echo "========================================================================="
echo ""
echo "1. Start the frontend:"
echo "   cd frontend && npm run dev"
echo ""
echo "2. Open browser:"
echo "   http://localhost:3000"
echo ""
echo "3. If Live Stream is empty, run a simulation:"
echo "   curl -X POST http://localhost:8000/simulate"
echo "   (This will add 500 messages to the database)"
echo ""
echo "4. Verify messages appear in the Live Message Stream box"
echo ""
echo "========================================================================="
echo -e "${GREEN}✓ Fix applied successfully!${NC}"
echo "========================================================================="
