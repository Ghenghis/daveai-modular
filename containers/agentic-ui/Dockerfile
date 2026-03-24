FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY agentic-ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY agentic-ui/ .

# Build Next.js app
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built app and dependencies
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Install curl for health checks
RUN apk add --no-cache curl

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

# Start Next.js
CMD ["npm", "start"]
