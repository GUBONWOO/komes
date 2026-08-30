FROM node:20-bookworm-slim

# Chrome + Xvfb 의존성 설치
RUN apt-get update && apt-get install -y \
    wget gnupg xvfb \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# puppeteer가 Chrome을 따로 다운받지 않도록 (시스템 Chrome 사용)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV DISPLAY=:99

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 4000
CMD ["./start.sh"]
