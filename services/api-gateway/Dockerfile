# API Gateway Dockerfile for RoadDesignApp
# Multi-stage build for NestJS application

# ---- Build Stage ----
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Add package.json files
COPY package.json yarn.lock* package-lock.json* ./

# Install dependencies with exact versions for reproducible builds
RUN if [ -f yarn.lock ]; then \
        yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ---- Production Stage ----
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create app directory and set permissions
RUN mkdir -p /app/logs && \
    chown -R node:node /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy package.json files
COPY --from=build /app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Create a non-root user and switch to it
USER node

# Expose the application port
EXPOSE 4000

# Create health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:4000/health || exit 1

# Start the application
CMD ["node", "dist/main"]
