FROM node:18-alpine

WORKDIR /app

# Install dependencies (production only)
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY backend/ .

# Create logs directory and set ownership
RUN mkdir -p /app/logs && chown -R node:node /app

# Run as non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 5000

# Start application
CMD ["node", "server.js"]
