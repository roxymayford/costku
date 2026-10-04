# Node.js backend Dockerfile
#
# Node 22 wajib: @supabase/supabase-js 2.116.0 (dan @supabase/realtime-js)
# menetapkan engines.node ">=22.0.0" DAN memanggil global WebSocket di dalam
# konstruktor SupabaseClient. Di Node 20 global WebSocket belum ada, jadi
# createClient() melempar:
#   "Node.js detected but native WebSocket not found."
# yang membuat proses crash saat boot (lihat deploy logs Railway). Jangan
# turunkan base image ini ke Node 20.
FROM node:22-alpine AS builder

WORKDIR /app

# npm ci menolak install kalau tree di lockfile tidak cocok dengan package.json.
# Kita tetap pakai npm ci supaya build reproducible, tapi kalau lockfile drift
# build akan gagal cepat dengan pesan jelas — bukan diam-diam memakai versi lain.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Runtime
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
# --omit=dev tetap memasang optionalDependencies (nodemailer, redis) — itu memang
# yang kita mau: OTP email dan rate limiter Redis bergantung padanya.
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5000

CMD ["node", "dist/index.js"]
