FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV NODE_OPTIONS="--max-old-space-size=400"

CMD ["npm", "run", "scheduler"]
