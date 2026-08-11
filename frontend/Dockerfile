# 개발용 Vite dev 서버. (docker compose 로 프론트+백+DB 를 한 번에 띄우기 위한 이미지)
FROM node:22-alpine AS development

WORKDIR /app

# 의존성 레이어 캐시 — lock 기준으로 재현 가능한 설치
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# 컨테이너 밖(호스트)에서 접근하려면 0.0.0.0 바인딩이 필요하다
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
