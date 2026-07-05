# Bakerya backend — Node API + embedded PocketBase in a single container.
# Built for Railway (Linux). The repo only ships a Windows pocketbase.exe, so we
# download the matching Linux PocketBase binary at build time.
FROM node:20-bookworm-slim

ARG PB_VERSION=0.39.5

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -o /tmp/pb.zip \
  && unzip /tmp/pb.zip -d /pb \
  && rm /tmp/pb.zip \
  && chmod +x /pb/pocketbase

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh

# Production defaults. Secrets (JWT_SECRET, ADMIN_PASSWORD, POCKETBASE_ADMIN_*)
# are supplied by Railway env vars — never baked into the image.
ENV NODE_ENV=production \
    DATA_STORE=pocketbase-strict \
    POCKETBASE_URL=http://127.0.0.1:8090 \
    SEED_ON_BOOT=true

CMD ["docker-entrypoint.sh"]
