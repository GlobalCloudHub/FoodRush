import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import pg from 'pg'
import { createClient } from 'redis'

const { Pool } = pg
const { PORT = 3002, DATABASE_URL, REDIS_URL, JWT_SECRET = 'supersecretjwtkey123' } = process.env

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

  const redis = createClient({ url: REDIS_URL, socket: { tls: REDIS_URL?.startsWith('rediss') } })
  redis.on('error', e => console.error('Redis error:', e.message))
  await retry(() => redis.connect(), 'Redis')

  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET })

  await app.register(swagger, {
    openapi: {
      info: { title: 'FoodRush Restaurant Service', version: '1.0.0' },
      tags: [{ name: 'restaurants' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.decorate('authenticate', async (req, reply) => {
    try { await req.jwtVerify() } catch { reply.code(401).send({ error: 'Unauthorized' }) }
  })

  const invalidateCache = async () => {
    const keys = await redis.keys('restaurant*')
    if (keys.length) await redis.del(keys)
  }

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok', service: 'restaurant-service' }))

  // ── List all ──────────────────────────────────────────────
  app.get('/restaurants', {
    schema: { tags: ['restaurants'], summary: 'List all open restaurants' }
  }, async (req, reply) => {
    const cached = await redis.get('restaurants:all')
    if (cached) return reply.send(JSON.parse(cached))
    const { rows } = await pool.query("SELECT * FROM restaurants WHERE is_open=true AND status='active' ORDER BY rating DESC")
    await redis.setEx('restaurants:all', 60, JSON.stringify(rows))
    reply.send(rows)
  })

  // ── Search ─────────────────────────────────────────────────
  app.get('/restaurants/search/:query', {
    schema: { tags: ['restaurants'], summary: 'Search restaurants', params: { type: 'object', properties: { query: { type: 'string' } } } }
  }, async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM restaurants WHERE is_open=true AND status='active' AND (name ILIKE $1 OR cuisine ILIKE $1 OR description ILIKE $1) ORDER BY rating DESC`,
      [`%${req.params.query}%`]
    )
    reply.send(rows)
  })

  // ── Get one ────────────────────────────────────────────────
  app.get('/restaurants/:id', {
    schema: { tags: ['restaurants'], summary: 'Get restaurant by ID' }
  }, async (req, reply) => {
    const cached = await redis.get(`restaurant:${req.params.id}`)
    if (cached) return reply.send(JSON.parse(cached))
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [req.params.id])
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    await redis.setEx(`restaurant:${req.params.id}`, 120, JSON.stringify(rows[0]))
    reply.send(rows[0])
  })

  // ── Admin: create restaurant ────────────────────────────────
  app.post('/restaurants', {
    schema: {
      tags: ['restaurants'], summary: 'Create restaurant (admin)', security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['name','cuisine'], properties: {
        name: { type: 'string' }, description: { type: 'string' }, cuisine: { type: 'string' },
        address: { type: 'string' }, delivery_time: { type: 'string' },
        delivery_fee: { type: 'number' }, min_order: { type: 'number' }, image_url: { type: 'string' }
      }}
    },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { name, description, cuisine, address, delivery_time, delivery_fee, min_order, image_url } = req.body
    const { rows } = await pool.query(
      `INSERT INTO restaurants (name, description, cuisine, address, delivery_time, delivery_fee, min_order, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, description, cuisine, address, delivery_time || '30-45 min', delivery_fee || 0, min_order || 0, image_url || null]
    )
    await invalidateCache()
    reply.code(201).send(rows[0])
  })

  // ── Admin: update restaurant ────────────────────────────────
  app.put('/restaurants/:id', {
    schema: { tags: ['restaurants'], summary: 'Update restaurant (admin)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { name, description, cuisine, address, delivery_time, delivery_fee, min_order, image_url, is_open, status } = req.body
    const { rows } = await pool.query(
      `UPDATE restaurants SET name=COALESCE($1,name), description=COALESCE($2,description),
       cuisine=COALESCE($3,cuisine), address=COALESCE($4,address), delivery_time=COALESCE($5,delivery_time),
       delivery_fee=COALESCE($6,delivery_fee), min_order=COALESCE($7,min_order), image_url=COALESCE($8,image_url),
       is_open=COALESCE($9,is_open), status=COALESCE($10,status)
       WHERE id=$11 RETURNING *`,
      [name, description, cuisine, address, delivery_time, delivery_fee, min_order, image_url, is_open, status, req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    await invalidateCache()
    reply.send(rows[0])
  })

  // ── Admin: list all (including inactive) ─────────────────
  app.get('/restaurants/admin/all', {
    schema: { tags: ['restaurants'], summary: 'List all restaurants including inactive (admin)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { rows } = await pool.query('SELECT * FROM restaurants ORDER BY created_at DESC')
    reply.send(rows)
  })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  console.log(`🍽️  Restaurant Service on :${PORT} — Swagger: http://localhost:${PORT}/docs`)
}

main().catch(err => { console.error('💥 Restaurant service crashed:', err); process.exit(1) })
