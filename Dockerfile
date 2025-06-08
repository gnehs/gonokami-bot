FROM node:22-alpine

ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app
COPY ./package.json ./
COPY ./package-lock.json ./
RUN npm install --production
RUN echo {} >> votes.json
ENV NODE_ENV=production
ENV BOT_TOKEN=1234:abcd
COPY . .
CMD ["npm", "start"]