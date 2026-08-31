FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev \
    && npm cache clean --force

COPY server.js ./

ENV NODE_ENV=reliability-lab
ENV SERVICE_ROLE=api
ENV PORT=8080
ENV AIRA_LAB_ID=aira-reliability-lab
ENV AIRA_SAFETY_CLASS=LAB_ONLY

EXPOSE 8080
EXPOSE 8081

RUN addgroup -S aira \
    && adduser -S -G aira aira \
    && chown -R aira:aira /app

USER aira

HEALTHCHECK \
    --interval=10s \
    --timeout=4s \
    --start-period=10s \
    --retries=6 \
    CMD wget -q -O - "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

CMD ["node", "server.js"]