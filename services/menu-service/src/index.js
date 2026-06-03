import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import pg from 'pg'
import { createClient } from 'redis'

const { Pool } = pg
const { PORT = 3003, DATABASE_URL, REDIS_URL, JWT_SECRET = 'supersecretjwtkey123' } = process.env

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
      info: { title: 'FoodRush Menu Service', version: '1.0.0' },
      tags: [{ name: 'menu' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.decorate('authenticate', async (req, reply) => {
    try { await req.jwtVerify() } catch { reply.code(401).send({ error: 'Unauthorized' }) }
  })

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok', service: 'menu-service' }))

  // ── Get menu by restaurant ─────────────────────────────────
  app.get('/menu/restaurant/:restaurantId', {
    schema: { tags: ['menu'], summary: 'Get menu grouped by category for a restaurant' }
  }, async (req, reply) => {
    const { restaurantId } = req.params
    const cached = await redis.get(`menu:${restaurantId}`)
    if (cached) return reply.send(JSON.parse(cached))
    const { rows } = await pool.query(
      'SELECT * FROM menu_items WHERE restaurant_id=$1 AND is_available=true ORDER BY category, name', [restaurantId]
    )
    const grouped = rows.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)
      return acc
    }, {})
    await redis.setEx(`menu:${restaurantId}`, 120, JSON.stringify(grouped))
    reply.send(grouped)
  })

  // ── Get single item ────────────────────────────────────────
  app.get('/menu/item/:id', {
    schema: { tags: ['menu'], summary: 'Get menu item by ID' }
  }, async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM menu_items WHERE id=$1', [req.params.id])
    if (!rows.length) return reply.code(404).send({ error: 'Item not found' })
    reply.send(rows[0])
  })

  // ── Batch fetch (internal use by order-service) ─────────────
  app.post('/menu/items/batch', {
    schema: { tags: ['menu'], summary: 'Batch fetch items by IDs (internal)' }
  }, async (req, reply) => {
    const { ids } = req.body || {}
    if (!ids?.length) return reply.send([])
    const { rows } = await pool.query('SELECT * FROM menu_items WHERE id = ANY($1::int[])', [ids])
    reply.send(rows)
  })

  // ── Admin: add menu item ───────────────────────────────────
  app.post('/menu', {
    schema: {
      tags: ['menu'], summary: 'Add menu item (admin)', security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['restaurant_id','name','price'], properties: {
        restaurant_id: { type: 'integer' }, name: { type: 'string' }, description: { type: 'string' },
        price: { type: 'number' }, category: { type: 'string' }, image_url: { type: 'string' }
      }}
    },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { restaurant_id, name, description, price, category, image_url } = req.body
    const { rows } = await pool.query(
      `INSERT INTO menu_items (restaurant_id, name, description, price, category, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [restaurant_id, name, description, price, category || 'Main Course', image_url || null]
    )
    await redis.del(`menu:${restaurant_id}`)
    reply.code(201).send(rows[0])
  })

  // ── Admin: update menu item ────────────────────────────────
  app.put('/menu/:id', {
    schema: { tags: ['menu'], summary: 'Update menu item (admin)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { name, description, price, category, image_url, is_available } = req.body
    const { rows } = await pool.query(
      `UPDATE menu_items SET name=COALESCE($1,name), description=COALESCE($2,description),
       price=COALESCE($3,price), category=COALESCE($4,category), image_url=COALESCE($5,image_url),
       is_available=COALESCE($6,is_available) WHERE id=$7 RETURNING *`,
      [name, description, price, category, image_url, is_available, req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    await redis.del(`menu:${rows[0].restaurant_id}`)
    reply.send(rows[0])
  })

  // ── Admin: delete menu item ────────────────────────────────
  app.delete('/menu/:id', {
    schema: { tags: ['menu'], summary: 'Delete menu item (admin)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { rows } = await pool.query('DELETE FROM menu_items WHERE id=$1 RETURNING *', [req.params.id])
    if (!rows.length) return reply.code(404).send({ error: 'Not found' })
    await redis.del(`menu:${rows[0].restaurant_id}`)
    reply.send({ message: 'Deleted', item: rows[0] })
  })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  console.log(`🍕 Menu Service on :${PORT} — Swagger: http://localhost:${PORT}/docs`)
}

main().catch(err => { console.error('💥 Menu service crashed:', err); process.exit(1) })
