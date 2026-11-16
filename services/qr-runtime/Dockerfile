FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
COPY services/qr-runtime/tsconfig.json ./services/qr-runtime/tsconfig.json
COPY services/qr-runtime/package.json ./services/qr-runtime/package.json

RUN npm install
RUN npx prisma generate --schema=prisma/schema.prisma

COPY services/qr-runtime/src ./services/qr-runtime/src
RUN npm run qr:build

ENV NODE_ENV=production
EXPOSE 4100
CMD ["npm", "run", "qr:start"]
