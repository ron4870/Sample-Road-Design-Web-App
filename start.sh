#!/bin/bash
# RoadDesignApp - Start Script
# This script pulls the latest container images, starts the application stack,
# and initializes the database if needed.
# Version 1.0 - Last updated: 2025-06-17

# Text formatting
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

# Print header
echo -e "${BOLD}${GREEN}=========================================${RESET}"
echo -e "${BOLD}${GREEN}  RoadDesignApp - Start Script          ${RESET}"
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
  # Use docker-compose instead of docker compose
  COMPOSE_CMD="docker-compose"
else
  COMPOSE_CMD="docker compose"
fi

# Check if environment file exists
if [ ! -f infra/.env ]; then
  echo -e "${YELLOW}Environment file not found. Copying from sample...${RESET}"
  if [ ! -f infra/.env.sample ]; then
    echo -e "${RED}Error: .env.sample file not found in infra directory${RESET}"
    echo "Please run setup.sh first or manually create infra/.env file."
    exit 1
  fi
  cp infra/.env.sample infra/.env
  echo -e "${GREEN}✓ Environment file created from sample${RESET}"
  echo -e "${YELLOW}Please edit infra/.env with your configuration values${RESET}"
  echo -e "${YELLOW}Press Enter to continue with default values or Ctrl+C to abort${RESET}"
  read -r
fi

# Check if setup.sh has been run
if [ ! -d "infra/nginx/conf.d" ] || [ ! -d "logs" ]; then
  echo -e "${YELLOW}It seems setup.sh has not been run. Running it now...${RESET}"
  ./setup.sh
  if [ $? -ne 0 ]; then
    echo -e "${RED}Setup failed. Please fix the issues and try again.${RESET}"
    exit 1
  fi
fi

# Pull the latest container images
echo -e "${BOLD}Pulling the latest container images...${RESET}"
$COMPOSE_CMD --env-file infra/.env -f infra/docker-compose.yml pull
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to pull container images. Check your network connection.${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Container images pulled successfully${RESET}"

# Start the application stack
echo -e "${BOLD}Starting the application stack...${RESET}"
$COMPOSE_CMD --env-file infra/.env -f infra/docker-compose.yml up -d
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to start the application stack. Check the logs for errors.${RESET}"
  exit 1
fi
echo -e "${GREEN}✓ Application stack started successfully${RESET}"

# Wait for the database to be ready
echo -e "${BOLD}Waiting for the database to be ready...${RESET}"
MAX_RETRIES=30
RETRY_COUNT=0
while ! $COMPOSE_CMD exec -T postgres pg_isready -U "${POSTGRES_USER:-roadapp}" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Database is not ready after $MAX_RETRIES attempts. Check the logs for errors.${RESET}"
    echo "Run: $COMPOSE_CMD logs postgres"
    exit 1
  fi
  echo -n "."
  sleep 2
done
echo ""
echo -e "${GREEN}✓ Database is ready${RESET}"

# Wait for the API Gateway to be ready
echo -e "${BOLD}Waiting for the API Gateway to be ready...${RESET}"
RETRY_COUNT=0
while ! $COMPOSE_CMD exec -T api-gateway wget -q -O - http://localhost:4000/health > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${YELLOW}API Gateway is not responding to health checks. Continuing anyway...${RESET}"
    break
  fi
  echo -n "."
  sleep 2
done
echo ""
echo -e "${GREEN}✓ API Gateway is ready${RESET}"

# Check if the database needs initialization
echo -e "${BOLD}Checking if database needs initialization...${RESET}"
# Try to run a simple query to check if migrations have been applied
if ! $COMPOSE_CMD exec -T api-gateway node -e "const { execSync } = require('child_process'); try { execSync('yarn migration:status', { stdio: 'pipe' }); process.exit(0); } catch(e) { process.exit(1); }" > /dev/null 2>&1; then
  echo -e "${YELLOW}Database schema not found. Running migrations...${RESET}"
  $COMPOSE_CMD exec -T api-gateway yarn migration:run
  if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to run database migrations. Check the logs for errors.${RESET}"
    echo "Run: $COMPOSE_CMD logs api-gateway"
    exit 1
  fi
  echo -e "${GREEN}✓ Database migrations applied successfully${RESET}"

  echo -e "${BOLD}Seeding initial data...${RESET}"
  $COMPOSE_CMD exec -T api-gateway yarn seed
  if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to seed initial data. Check the logs for errors.${RESET}"
    echo "Run: $COMPOSE_CMD logs api-gateway"
    exit 1
  fi
  echo -e "${GREEN}✓ Initial data seeded successfully${RESET}"
else
  echo -e "${GREEN}✓ Database schema already exists${RESET}"
fi

# Check if Keycloak needs configuration
echo -e "${BOLD}Checking Keycloak configuration...${RESET}"
if ! $COMPOSE_CMD exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "${KEYCLOAK_ADMIN:-admin}" --password "${KEYCLOAK_ADMIN_PASSWORD:-admin}" > /dev/null 2>&1; then
  echo -e "${YELLOW}Keycloak may need manual configuration.${RESET}"
  echo -e "${YELLOW}Visit https://localhost/auth and import the realm configuration if needed.${RESET}"
else
  # Check if roadapp realm exists
  if ! $COMPOSE_CMD exec -T keycloak /opt/keycloak/bin/kcadm.sh get realms/roadapp > /dev/null 2>&1; then
    echo -e "${YELLOW}Roadapp realm not found in Keycloak.${RESET}"
    if [ -f "infra/keycloak/realm-export.json" ]; then
      echo -e "${BOLD}Importing Keycloak realm configuration...${RESET}"
      $COMPOSE_CMD exec -T keycloak /opt/keycloak/bin/kcadm.sh create realms -f /opt/keycloak/data/import/realm-export.json
      if [ $? -ne 0 ]; then
        echo -e "${YELLOW}Failed to import realm automatically. Manual import may be needed.${RESET}"
      else
        echo -e "${GREEN}✓ Keycloak realm imported successfully${RESET}"
      fi
    else
      echo -e "${YELLOW}Realm configuration file not found. Manual setup may be needed.${RESET}"
    fi
  else
    echo -e "${GREEN}✓ Keycloak realm already configured${RESET}"
  fi
fi

# Display information about how to access the application
echo ""
echo -e "${BOLD}${GREEN}RoadDesignApp is now running!${RESET}"
echo ""
echo -e "${BOLD}Access the application:${RESET}"
echo -e "• Web UI: ${YELLOW}https://localhost${RESET}"
echo -e "• API: ${YELLOW}https://localhost/api${RESET}"
echo -e "• MinIO Console: ${YELLOW}https://localhost/minio-console${RESET}"
echo -e "• Keycloak Admin: ${YELLOW}https://localhost/auth${RESET}"
echo ""
echo -e "${BOLD}Default credentials:${RESET}"
echo -e "• Keycloak Admin: ${YELLOW}admin / admin${RESET} (change this in production)"
echo -e "• MinIO: ${YELLOW}minio / minio_pw${RESET} (from .env file)"
echo ""
echo -e "${BOLD}Useful commands:${RESET}"
echo -e "• View logs: ${YELLOW}$COMPOSE_CMD logs -f [service-name]${RESET}"
echo -e "• Stop the stack: ${YELLOW}$COMPOSE_CMD --env-file infra/.env -f infra/docker-compose.yml down${RESET}"
echo -e "• Restart a service: ${YELLOW}$COMPOSE_CMD --env-file infra/.env -f infra/docker-compose.yml restart [service-name]${RESET}"
echo ""
echo -e "${BOLD}${GREEN}Happy road designing!${RESET}"
echo ""
