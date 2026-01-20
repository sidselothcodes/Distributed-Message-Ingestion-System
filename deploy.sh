#!/bin/bash
set -e

# ===========================================
# Production Deployment Script
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if .env exists
check_env() {
    if [ ! -f "$INFRA_DIR/.env" ]; then
        log_error ".env file not found in $INFRA_DIR"
        log_info "Copy .env.production to .env and update the values:"
        log_info "  cp $INFRA_DIR/.env.production $INFRA_DIR/.env"
        exit 1
    fi
}

# Pull latest code
pull_latest() {
    log_info "Pulling latest code from git..."
    cd "$SCRIPT_DIR"
    git fetch origin
    git pull origin main
}

# Build images
build_images() {
    log_info "Building Docker images..."
    cd "$INFRA_DIR"
    docker compose -f docker-compose.prod.yml build --no-cache
}

# Deploy with zero-downtime (rolling update)
deploy() {
    log_info "Deploying services..."
    cd "$INFRA_DIR"

    # Start/update services
    docker compose -f docker-compose.prod.yml up -d --remove-orphans

    # Wait for health checks
    log_info "Waiting for services to become healthy..."
    sleep 10

    # Check service health
    check_health
}

# Quick deploy (just restart, no rebuild)
quick_deploy() {
    log_info "Quick deploy - restarting services..."
    cd "$INFRA_DIR"
    docker compose -f docker-compose.prod.yml restart
}

# Check health of all services
check_health() {
    log_info "Checking service health..."
    cd "$INFRA_DIR"

    services=("nginx-proxy" "ingestor-api" "batch-worker" "frontend-app" "message-buffer" "message-db")

    for service in "${services[@]}"; do
        status=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no-healthcheck")
        running=$(docker inspect --format='{{.State.Running}}' "$service" 2>/dev/null || echo "false")

        if [ "$running" = "true" ]; then
            if [ "$status" = "healthy" ] || [ "$status" = "no-healthcheck" ]; then
                log_info "$service: ${GREEN}running${NC}"
            else
                log_warn "$service: running but $status"
            fi
        else
            log_error "$service: not running"
        fi
    done
}

# View logs
logs() {
    cd "$INFRA_DIR"
    service=${1:-""}
    if [ -n "$service" ]; then
        docker compose -f docker-compose.prod.yml logs -f "$service"
    else
        docker compose -f docker-compose.prod.yml logs -f
    fi
}

# Stop all services
stop() {
    log_info "Stopping all services..."
    cd "$INFRA_DIR"
    docker compose -f docker-compose.prod.yml down
}

# Clean up (remove volumes too)
clean() {
    log_warn "This will remove all data including database!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$INFRA_DIR"
        docker compose -f docker-compose.prod.yml down -v
        log_info "Cleanup complete"
    fi
}

# Show usage
usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  deploy      Full deployment (pull, build, deploy)"
    echo "  build       Build images only"
    echo "  start       Start services (no rebuild)"
    echo "  restart     Quick restart of services"
    echo "  stop        Stop all services"
    echo "  status      Check service health"
    echo "  logs [svc]  View logs (optionally for specific service)"
    echo "  clean       Stop and remove all data (DESTRUCTIVE)"
    echo ""
    echo "Examples:"
    echo "  $0 deploy           # Full deployment"
    echo "  $0 logs api         # View API logs"
    echo "  $0 status           # Check health"
}

# Main
case "${1:-}" in
    deploy)
        check_env
        pull_latest
        build_images
        deploy
        ;;
    build)
        check_env
        build_images
        ;;
    start)
        check_env
        deploy
        ;;
    restart)
        quick_deploy
        ;;
    stop)
        stop
        ;;
    status)
        check_health
        ;;
    logs)
        logs "$2"
        ;;
    clean)
        clean
        ;;
    *)
        usage
        exit 1
        ;;
esac
