# Phase 6: Docker & Kubernetes Deployment

## AIRA Production Dockerfile

FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY backend/package.json .
RUN npm ci --only=production

# Copy application code
COPY backend/ .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 5000

# Start application
CMD ["node", "server.js"]
