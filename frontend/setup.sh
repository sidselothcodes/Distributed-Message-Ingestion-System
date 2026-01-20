#!/bin/bash

# Frontend Setup Script for Next.js Dashboard

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$(dirname "$0")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Setting up Next.js Dashboard${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}Error: Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js version: $(node --version)"
echo -e "${GREEN}✓${NC} npm version: $(npm --version)"
echo ""

# Check if package.json already exists
if [ -f "package.json" ]; then
    echo -e "${YELLOW}package.json already exists. Skipping Next.js initialization.${NC}"
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
else
    echo -e "${YELLOW}Initializing Next.js project...${NC}"
    echo ""

    # Create Next.js app
    npx create-next-app@latest . \
        --typescript \
        --tailwind \
        --app \
        --no-src-dir \
        --import-alias "@/*" \
        --use-npm

    echo ""
    echo -e "${GREEN}✓${NC} Next.js project initialized"
    echo ""

    # Install additional dependencies
    echo -e "${YELLOW}Installing additional dependencies...${NC}"
    npm install recharts lucide-react date-fns

    echo -e "${GREEN}✓${NC} Additional dependencies installed"
fi

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}Creating .env.local...${NC}"
    cat > .env.local << EOF
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:8000

# Polling interval (ms)
NEXT_PUBLIC_POLL_INTERVAL=2000
EOF
    echo -e "${GREEN}✓${NC} .env.local created"
fi

# Create directory structure
echo -e "${YELLOW}Creating directory structure...${NC}"
mkdir -p components hooks lib

echo -e "${GREEN}✓${NC} Directories created"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "  1. cd frontend"
echo "  2. npm run dev"
echo "  3. Open http://localhost:3000"
echo ""
echo "Start building your dashboard components in:"
echo "  - app/page.tsx (main dashboard)"
echo "  - components/ (reusable components)"
echo ""
