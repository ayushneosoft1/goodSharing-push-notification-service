FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY src ./src

COPY migrations ./migrations

EXPOSE 4003

CMD ["npm", "start"]