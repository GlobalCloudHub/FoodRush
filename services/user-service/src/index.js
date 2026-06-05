import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { createClient } from 'redis'

const { Pool } = pg
const { PORT = 3001, DATABASE_URL, REDIS_URL, JWT_SECRET = 'supersecretjwtkey123' } = process.env

async function retry(fn, label, retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try { return await fn() } catch (err) {
      console.log(`⏳ [${label}] attempt ${i}/${retries}: ${err.message}`)
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL?.includes('azure.com') ? { rejectUnauthorized: false } : false })
  await retry(() => pool.query('SELECT 1'), 'PostgreSQL')
  console.log('✅ PostgreSQL connected')

  const redis = createClient({ url: REDIS_URL, socket: { tls: REDIS_URL?.startsWith('rediss') } })
  redis.on('error', e => console.error('Redis error:', e.message))
  await retry(() => redis.connect(), 'Redis')
  console.log('✅ Redis connected')

  const app = Fastify({ logger: true })

  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET })

  await app.register(swagger, {
    openapi: {
      servers: [{ url: '/' }], // 🔥 ADD THIS LINE!
      info: { title: 'FoodRush User Service', version: '1.0.0', description: 'User registration, login and profile management' },
      tags: [{ name: 'auth', description: 'Authentication endpoints' }, { name: 'users', description: 'User endpoints' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
      }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list' } })

  app.decorate('authenticate', async (req, reply) => {
    try { await req.jwtVerify() } catch { reply.code(401).send({ error: 'Unauthorized' }) }
  })

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok', service: 'user-service' }))

  // ── Register ─────────────────────────────────────────────
  app.post('/auth/register', {
    schema: {
      tags: ['auth'], summary: 'Register a new user',
      body: { type: 'object', required: ['name','email','password'], properties: {
        name: { type: 'string' }, email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 }, phone: { type: 'string' }, address: { type: 'string' }
      }},
      response: { 201: { type: 'object', properties: {
        user: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } },
        token: { type: 'string' }
      }}}
    }
  }, async (req, reply) => {
    const { name, email, password, phone, address } = req.body
    const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.rows.length) return reply.code(409).send({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role',
      [name, email, hash, phone || null, address || null]
    )
    // ADDED NAME TO TOKEN
    const token = app.jwt.sign({ id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role }, { expiresIn: '7d' })
    reply.code(201).send({ user: rows[0], token })
  })

  // ── Login ─────────────────────────────────────────────────
  app.post('/auth/login', {
    schema: {
      tags: ['auth'], summary: 'Login and receive JWT',
      body: { type: 'object', required: ['email','password'], properties: {
        email: { type: 'string', format: 'email' }, password: { type: 'string' }
      }},
      response: { 200: { type: 'object', properties: {
        user: { type: 'object' }, token: { type: 'string' }
      }}}
    }
  }, async (req, reply) => {
    const { email, password } = req.body
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email])
    if (!rows.length) return reply.code(401).send({ error: 'Invalid credentials' })
    const valid = await bcrypt.compare(password, rows[0].password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })
    
    // ADDED NAME TO TOKEN (This fixes the React decode crash)
    const token = app.jwt.sign({ id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role }, { expiresIn: '7d' })
    const { password_hash, ...user } = rows[0]
    
    console.log(`✅ User logged in: ${user.email} | Role: ${user.role}`)
    reply.send({ user, token })
  })

  // ── Profile ───────────────────────────────────────────────
  app.get('/users/me', {
    schema: { tags: ['users'], summary: 'Get my profile', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, address, role, created_at FROM users WHERE id=$1', [req.user.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'User not found' })
    reply.send(rows[0])
  })

  // ── Admin: list all users ─────────────────────────────────
  app.get('/users', {
    schema: { tags: ['users'], summary: 'List all users (admin only)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { rows } = await pool.query('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC')
    reply.send(rows)
  })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  console.log(`👤 User Service on :${PORT}  — Swagger available at /docs`)

}

main().catch(err => { console.error('💥 User service crashed:', err); process.exit(1) })