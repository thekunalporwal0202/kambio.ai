# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is only needed at runtime; a placeholder keeps `prisma generate`
# and the Next build happy without a live database.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kambio
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Full node_modules (not the slim standalone output) because the worker and
# the migrate/seed steps run tsx and prisma from the same image.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json next.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY worker ./worker
COPY src ./src

RUN mkdir -p /data/storage

EXPOSE 3000
CMD ["npx", "next", "start"]
