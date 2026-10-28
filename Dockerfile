FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node --test worker/local-parser.test.mjs
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-por tesseract-ocr-data-eng && \
    addgroup -S nextjs && adduser -S nextjs -G nextjs && \
    mkdir -p /data/livro-caixa-arquivos && \
    chown nextjs:nextjs /data/livro-caixa-arquivos
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --chown=nextjs:nextjs scripts ./scripts
COPY --chown=nextjs:nextjs worker ./worker
USER nextjs
EXPOSE 3000
CMD ["node","server.js"]
