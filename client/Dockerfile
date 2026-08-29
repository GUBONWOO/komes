# ── Stage 1: 빌드 ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# nginx가 /api를 프록시하므로 상대경로 사용
RUN VITE_API_BASE_URL=/api npm run build

# ── Stage 2: nginx 서빙 ─────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
