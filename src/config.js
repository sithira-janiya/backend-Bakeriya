import 'dotenv/config'

function bool(v, fallback = false) {
  if (v == null) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())
}

export const config = {
  port: Number(process.env.PORT || 4000),
  pocketbaseUrl: process.env.POCKETBASE_URL || 'http://127.0.0.1:8090',
  pbAdminEmail: process.env.POCKETBASE_ADMIN_EMAIL || 'admin@bakerya.local',
  pbAdminPassword: process.env.POCKETBASE_ADMIN_PASSWORD || 'changeme-strong-password',
  adminUsername: String(process.env.ADMIN_USERNAME || 'admin'),
  adminPassword: String(process.env.ADMIN_PASSWORD || 'SamanthiM@075'),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'Bakerya <no-reply@bakerya.local>'
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  seedOnBoot: bool(process.env.SEED_ON_BOOT, true)
}

export const ORDER_STATUSES = ['pending', 'cooking', 'ready', 'completed']
