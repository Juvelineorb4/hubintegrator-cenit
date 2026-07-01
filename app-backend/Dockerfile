FROM node:20-alpine

# Enable corepack and pin pnpm to the version used to generate pnpm-lock.yaml
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile TypeScript
COPY . .
RUN pnpm build

EXPOSE 3000

# Production start — compiled JS, no file watcher
CMD ["node", "dist/index.js"]