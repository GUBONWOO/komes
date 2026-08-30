FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    xvfb \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV DISPLAY=:99

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4000
CMD ["./start.sh"]
