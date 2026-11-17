# FormCraft container: works on any host that runs Docker (Railway, Fly.io, a VPS...)
FROM node:24-slim

WORKDIR /app
COPY . .

# The database and uploads go to /data; mount a permanent volume there
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TRUST_PROXY=1
RUN mkdir -p /data
VOLUME /data

EXPOSE 3000
CMD ["node", "server.js"]
