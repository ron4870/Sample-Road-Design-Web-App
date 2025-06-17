# Frontend Dockerfile for RoadDesignApp
# Multi-stage build with Node.js for building and NGINX for serving

# ---- Build Stage ----
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Add package.json and yarn.lock files
COPY package.json yarn.lock* package-lock.json* ./

# Install dependencies (using cache layer)
RUN if [ -f yarn.lock ]; then \
        yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi

# Copy source code
COPY . .

# Set environment variables for build
ARG REACT_APP_API_URL=/api
ARG REACT_APP_AUTH_URL=/auth
ARG REACT_APP_MINIO_URL=/minio
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_AUTH_URL=$REACT_APP_AUTH_URL
ENV REACT_APP_MINIO_URL=$REACT_APP_MINIO_URL

# Build application
RUN npm run build

# ---- Production Stage ----
FROM nginx:1.25-alpine

# Copy built files from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Create log directory
RUN mkdir -p /app/logs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q -O - http://localhost:3000/health || exit 1

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
