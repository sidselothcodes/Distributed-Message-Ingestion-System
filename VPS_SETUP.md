# VPS Setup Guide

Step-by-step guide for deploying the High-Speed Message Ingestor on an Ubuntu VPS.

## Prerequisites

- Ubuntu 22.04 LTS VPS (minimum 2GB RAM, 2 vCPU recommended)
- SSH access with sudo privileges
- Domain name (optional, for HTTPS)

## Step 1: Initial Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git ufw
```

## Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (avoids needing sudo)
sudo usermod -aG docker $USER

# Apply group changes (or logout/login)
newgrp docker

# Verify installation
docker --version
docker compose version
```

## Step 3: Configure Firewall

```bash
# Allow SSH (important - do this first!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify rules
sudo ufw status
```

## Step 4: Clone the Repository

```bash
# Create app directory
mkdir -p ~/apps
cd ~/apps

# Clone the repository
git clone https://github.com/YOUR_USERNAME/high-speed-ingestor.git
cd high-speed-ingestor
```

## Step 5: Configure Environment

```bash
# Copy the production environment template
cp infrastructure/.env.production infrastructure/.env

# Edit with your values
nano infrastructure/.env
```

Update these values in `.env`:

```bash
# Generate strong passwords (run this to generate random passwords)
openssl rand -base64 32

# Required changes:
POSTGRES_PASSWORD=your_generated_password_here
REDIS_PASSWORD=another_generated_password_here

# Update frontend URLs with your server IP or domain:
# For IP-based access:
NEXT_PUBLIC_API_URL=http://YOUR_VPS_IP/api
NEXT_PUBLIC_WS_URL=ws://YOUR_VPS_IP/ws/stats

# For domain-based access:
NEXT_PUBLIC_API_URL=https://your-domain.com/api
NEXT_PUBLIC_WS_URL=wss://your-domain.com/ws/stats
```

## Step 6: Deploy

```bash
# Make deploy script executable
chmod +x deploy.sh

# Build and start all services
./deploy.sh deploy
```

This will:
1. Build all Docker images
2. Start all services
3. Run health checks

## Step 7: Verify Deployment

```bash
# Check service status
./deploy.sh status

# View logs (Ctrl+C to exit)
./deploy.sh logs

# Test the API
curl http://localhost/api/health
```

## Common Operations

```bash
# View logs for specific service
./deploy.sh logs ingestor-api
./deploy.sh logs batch-worker
./deploy.sh logs frontend-app

# Restart services (quick, no rebuild)
./deploy.sh restart

# Stop all services
./deploy.sh stop

# Full redeploy (pull latest code, rebuild, restart)
./deploy.sh deploy
```

## Setting Up HTTPS (Optional)

For production with a domain, use Let's Encrypt:

```bash
# Install certbot
sudo apt install -y certbot

# Stop nginx temporarily
./deploy.sh stop

# Get certificate (replace with your domain)
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates to infrastructure folder
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem infrastructure/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem infrastructure/ssl/
sudo chown $USER:$USER infrastructure/ssl/*

# Update nginx.conf to enable HTTPS (uncomment the SSL server block)
nano infrastructure/nginx.conf

# Restart services
./deploy.sh start
```

## Troubleshooting

### Services not starting

```bash
# Check Docker logs
docker compose -f infrastructure/docker-compose.prod.yml logs

# Check specific service
docker logs ingestor-api
docker logs batch-worker
```

### Database connection issues

```bash
# Verify postgres is running
docker exec -it message-db psql -U ingestor -d messages_db -c "SELECT 1"

# Check if tables exist
docker exec -it message-db psql -U ingestor -d messages_db -c "\dt"
```

### Redis connection issues

```bash
# Test Redis connection
docker exec -it message-buffer redis-cli -a YOUR_REDIS_PASSWORD ping
```

### WebSocket not connecting

1. Check nginx logs: `docker logs nginx-proxy`
2. Verify WebSocket URL in frontend matches your server
3. Ensure firewall allows port 80/443

### View resource usage

```bash
# See CPU/memory usage per container
docker stats
```

## Updating the Application

```bash
cd ~/apps/high-speed-ingestor

# Full update (pulls code, rebuilds, restarts)
./deploy.sh deploy
```

## Backup Database

```bash
# Create backup
docker exec message-db pg_dump -U ingestor messages_db > backup_$(date +%Y%m%d).sql

# Restore backup
cat backup_20240115.sql | docker exec -i message-db psql -U ingestor messages_db
```

## Monitoring

For basic monitoring, check:

```bash
# Service health
./deploy.sh status

# Resource usage
docker stats --no-stream

# Disk usage
df -h
docker system df
```

## Clean Up (Caution)

```bash
# Remove unused Docker resources
docker system prune -a

# Full reset (DELETES ALL DATA)
./deploy.sh clean
```
