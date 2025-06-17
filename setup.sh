#!/bin/bash
# RoadDesignApp - Setup Script
# This script prepares the system for deployment by creating necessary directories
# and initializing configuration files.
# Version 1.0 - Last updated: 2025-06-17

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

# Print header
echo -e "${BOLD}${GREEN}=========================================${RESET}"
echo -e "${BOLD}${GREEN}  RoadDesignApp - Setup Script          ${RESET}"
echo -e "${BOLD}${GREEN}=========================================${RESET}"
echo ""

# Check if script is run with root privileges
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Please do not run this script as root.${RESET}"
  exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Docker is not installed. Please install Docker first.${RESET}"
  echo "You can install Docker using: curl -fsSL https://get.docker.com | bash"
  exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
  echo -e "${YELLOW}Docker Compose plugin not found. Checking for docker-compose...${RESET}"
  if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${RESET}"
    echo "For Docker Compose plugin: https://docs.docker.com/compose/install/"
    exit 1
  fi
fi

# Create base directory structure
echo -e "${BOLD}Creating directory structure...${RESET}"

# Create main directories
mkdir -p infra/nginx/conf.d
mkdir -p infra/nginx/certs
mkdir -p logs/{nginx,frontend,api-gateway,alignment-engine,model-service,terrain-service,cost-estimator,junction-engine,signage-engine,drainage-suite,grading-engine}
mkdir -p reports
mkdir -p frontend
mkdir -p services/{api-gateway,alignment-engine,model-service,terrain-service,cost-estimator,junction-engine,signage-engine,drainage-suite,grading-engine}

echo -e "${GREEN}✓ Directory structure created${RESET}"

# Copy environment file if it doesn't exist
if [ ! -f infra/.env ]; then
  echo -e "${BOLD}Creating environment file...${RESET}"
  if [ -f infra/.env.sample ]; then
    cp infra/.env.sample infra/.env
    echo -e "${GREEN}✓ Environment file created from sample${RESET}"
    echo -e "${YELLOW}Please edit infra/.env with your configuration values${RESET}"
  else
    echo -e "${RED}Error: .env.sample file not found in infra directory${RESET}"
    exit 1
  fi
fi

# Generate self-signed certificates for development
if [ ! -f infra/nginx/certs/server.crt ] || [ ! -f infra/nginx/certs/server.key ]; then
  echo -e "${BOLD}Generating self-signed SSL certificates for development...${RESET}"
  
  # Check if OpenSSL is installed
  if ! command -v openssl &> /dev/null; then
    echo -e "${RED}OpenSSL is not installed. Cannot generate certificates.${RESET}"
    echo "Please install OpenSSL or manually place your certificates in infra/nginx/certs/"
  else
    # Generate certificates
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout infra/nginx/certs/server.key \
      -out infra/nginx/certs/server.crt \
      -subj "/C=US/ST=State/L=City/O=RoadDesignApp/CN=localhost" \
      -addext "subjectAltName = DNS:localhost,DNS:roadapp.test.local,IP:127.0.0.1"
    
    chmod 644 infra/nginx/certs/server.crt
    chmod 600 infra/nginx/certs/server.key
    
    echo -e "${GREEN}✓ Self-signed certificates generated${RESET}"
    echo -e "${YELLOW}Note: These are self-signed certificates for development only.${RESET}"
    echo -e "${YELLOW}      For production, replace with proper certificates.${RESET}"
  fi
fi

# Create NGINX configuration if it doesn't exist
if [ ! -f infra/nginx/conf.d/default.conf ]; then
  echo -e "${BOLD}Creating NGINX configuration...${RESET}"
  cat > infra/nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    
    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # API Gateway
    location /api/ {
        proxy_pass http://api-gateway:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket connections
    location /ws/ {
        proxy_pass http://api-gateway:4000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Keycloak
    location /auth/ {
        proxy_pass http://keycloak:8080/;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
    
    # MinIO API
    location /minio/ {
        proxy_pass http://minio:9000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # MinIO Console
    location /minio-console/ {
        proxy_pass http://minio:9001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Increase max body size for file uploads
    client_max_body_size 100M;
    
    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
EOF
  echo -e "${GREEN}✓ NGINX configuration created${RESET}"
fi

# Create frontend Nginx config for SPA routing
mkdir -p frontend/nginx
if [ ! -f frontend/nginx/default.conf ]; then
  echo -e "${BOLD}Creating frontend NGINX configuration for SPA routing...${RESET}"
  cat > frontend/nginx/default.conf << 'EOF'
server {
    listen 3000;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # SPA routing - send all requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 '{"status":"UP"}';
        add_header Content-Type application/json;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
    
    # Don't cache HTML files
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate";
    }
}
EOF
  echo -e "${GREEN}✓ Frontend NGINX configuration created${RESET}"
fi

# Create sample data directory and download sample terrain file
echo -e "${BOLD}Creating sample data directory...${RESET}"
mkdir -p samples
if [ ! -f samples/dem_utm33.tif ]; then
  echo -e "${YELLOW}Note: Sample terrain file not available.${RESET}"
  echo -e "${YELLOW}      You'll need to upload your own terrain data for testing.${RESET}"
  touch samples/dem_utm33.tif.placeholder
fi

# Set proper permissions
echo -e "${BOLD}Setting permissions...${RESET}"
chmod -R 755 infra
chmod -R 755 logs
chmod -R 755 reports
chmod -R 755 samples
echo -e "${GREEN}✓ Permissions set${RESET}"

# Create a simple README file
if [ ! -f README.md ]; then
  echo -e "${BOLD}Creating README file...${RESET}"
  cat > README.md << 'EOF'
# RoadDesignApp

A comprehensive web-based road design application with features similar to SierraSoft Roads Design.

## Features

- AASHTO-compliant horizontal and vertical alignment design
- 3D modeling of roads with terrain integration
- Junction and intersection design
- Traffic signage and marking
- Drainage system design
- Terrain leveling and grading

## Getting Started

1. Run the setup script: `./setup.sh`
2. Start the application: `docker compose -f infra/docker-compose.yml up -d`
3. Access the application at: https://localhost

## Documentation

See the `docs` directory for detailed documentation on each module.
EOF
  echo -e "${GREEN}✓ README file created${RESET}"
fi

echo ""
echo -e "${BOLD}${GREEN}Setup completed successfully!${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo -e "1. Edit ${YELLOW}infra/.env${RESET} with your configuration values"
echo -e "2. Start the application with: ${YELLOW}docker compose -f infra/docker-compose.yml up -d${RESET}"
echo -e "3. Access the application at: ${YELLOW}https://localhost${RESET}"
echo ""
echo -e "${BOLD}${GREEN}Happy road designing!${RESET}"
echo ""
