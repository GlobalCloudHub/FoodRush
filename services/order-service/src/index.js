import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import pg from 'pg'
import { createClient } from 'redis'
import { fetch } from 'undici'
import { EventHubProducerClient } from '@azure/event-hubs'

const { Pool } = pg
const {
  PORT = 3004, DATABASE_URL, REDIS_URL, JWT_SECRET = 'supersecretjwtkey123',
  MENU_SERVICE_URL,
  EVH_ORDERS_SEND_CONN, EVH_ORDERS_HUB = 'evh-orders',
  EVH_STATUS_SEND_CONN, EVH_STATUS_HUB = 'evh-order-status'
} = process.env

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

  // Event Hub producers (optional — gracefully skip if not configured)
  let ordersProducer = null
  let statusProducer = null
  if (EVH_ORDERS_SEND_CONN) {
    ordersProducer = new EventHubProducerClient(EVH_ORDERS_SEND_CONN, EVH_ORDERS_HUB)
    console.log('✅ Event Hub (orders) producer ready')
  } else {
    console.log('⚠️  EVH_ORDERS_SEND_CONN not set — Event Hub publishing disabled')
  }
  if (EVH_STATUS_SEND_CONN) {
    statusProducer = new EventHubProducerClient(EVH_STATUS_SEND_CONN, EVH_STATUS_HUB)
    console.log('✅ Event Hub (status) producer ready')
  }

  const publishEvent = async (producer, eventType, data) => {
    if (!producer) return
    try {
      const batch = await producer.createBatch()
      batch.tryAdd({ body: { eventType, data, timestamp: new Date().toISOString() } })
      await producer.sendBatch(batch)
    } catch (err) {
      console.error(`⚠️  Event Hub publish failed (${eventType}):`, err.message)
    }
  }

  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET })

  await app.register(swagger, {
    openapi: {
      info: { title: 'FoodRush Order Service', version: '1.0.0' },
      tags: [{ name: 'orders' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.decorate('authenticate', async (req, reply) => {
    try { await req.jwtVerify() } catch { reply.code(401).send({ error: 'Unauthorized' }) }
  })

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok', service: 'order-service' }))

  // ── Place order ────────────────────────────────────────────
  app.post('/orders', {
    schema: {
      tags: ['orders'], summary: 'Place a new order', security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['restaurant_id','items','delivery_address'], properties: {
        restaurant_id: { type: 'integer' }, delivery_address: { type: 'string' }, notes: { type: 'string' },
        items: { type: 'array', items: { type: 'object', properties: { menu_item_id: { type: 'integer' }, quantity: { type: 'integer' } } } }
      }}
    },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const { restaurant_id, items, delivery_address, notes } = req.body
    const user_id = req.user.id
    if (!items?.length) return reply.code(400).send({ error: 'Order must contain at least one item' })

    const menuRes = await fetch(`${MENU_SERVICE_URL}/menu/items/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: items.map(i => i.menu_item_id) })
    })
    const menuItems = await menuRes.json()
    const menuMap = Object.fromEntries(menuItems.map(m => [m.id, m]))

    let total_amount = 0
    const orderItems = items.map(item => {
      const menu = menuMap[item.menu_item_id]
      if (!menu) throw new Error(`Menu item ${item.menu_item_id} not found`)
      const subtotal = parseFloat(menu.price) * item.quantity
      total_amount += subtotal
      return { ...item, unit_price: menu.price, subtotal }
    })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows: [order] } = await client.query(
        'INSERT INTO orders (user_id, restaurant_id, total_amount, delivery_address, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [user_id, restaurant_id, total_amount.toFixed(2), delivery_address, notes || null]
      )
      for (const oi of orderItems) {
        await client.query(
          'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal) VALUES ($1,$2,$3,$4,$5)',
          [order.id, oi.menu_item_id, oi.quantity, oi.unit_price, oi.subtotal]
        )
      }
      await client.query('COMMIT')

      // Publish to Event Hub
      await publishEvent(ordersProducer, 'ORDER_PLACED', { orderId: order.id, userId: user_id, restaurantId: restaurant_id, totalAmount: total_amount })

      reply.code(201).send({ ...order, items: orderItems })
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  })

  // ── My orders ──────────────────────────────────────────────
  app.get('/orders/my', {
    schema: { tags: ['orders'], summary: 'List my orders', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT o.*, COALESCE(json_agg(json_build_object(
         'menu_item_id',oi.menu_item_id,'quantity',oi.quantity,'unit_price',oi.unit_price,'subtotal',oi.subtotal
       )) FILTER (WHERE oi.id IS NOT NULL),'[]') as items
       FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id
       WHERE o.user_id=$1 GROUP BY o.id ORDER BY o.created_at DESC`,
      [req.user.id]
    )
    reply.send(rows)
  })

  // ── Single order ───────────────────────────────────────────
  app.get('/orders/:id', {
    schema: { tags: ['orders'], summary: 'Get order by ID', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    const isAdmin = req.user.role === 'admin'
    const query = isAdmin
      ? `SELECT o.*, COALESCE(json_agg(json_build_object('menu_item_id',oi.menu_item_id,'quantity',oi.quantity,'unit_price',oi.unit_price,'subtotal',oi.subtotal)) FILTER (WHERE oi.id IS NOT NULL),'[]') as items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 GROUP BY o.id`
      : `SELECT o.*, COALESCE(json_agg(json_build_object('menu_item_id',oi.menu_item_id,'quantity',oi.quantity,'unit_price',oi.unit_price,'subtotal',oi.subtotal)) FILTER (WHERE oi.id IS NOT NULL),'[]') as items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 AND o.user_id=$2 GROUP BY o.id`
    const params = isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    const { rows } = await pool.query(query, params)
    if (!rows.length) return reply.code(404).send({ error: 'Order not found' })
    reply.send(rows[0])
  })

  // ── Admin: list all orders ─────────────────────────────────
  app.get('/orders', {
    schema: { tags: ['orders'], summary: 'List all orders (admin)', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    const { status } = req.query
    const q = status
      ? `SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status=$1 ORDER BY o.created_at DESC`
      : `SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC`
    const { rows } = await pool.query(q, status ? [status] : [])
    reply.send(rows)
  })

  // ── Update order status (admin approves/progresses) ────────
  app.patch('/orders/:id/status', {
    schema: {
      tags: ['orders'], summary: 'Update order status (admin)', security: [{ bearerAuth: [] }],
      body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['confirmed','preparing','out_for_delivery','delivered','cancelled'] } } }
    },
    preHandler: [app.authenticate]
  }, async (req, reply) => {
    if (req.user.role !== 'admin') return reply.code(403).send({ error: 'Only admins can update order status' })
    const { status } = req.body
    const { rows } = await pool.query(
      'UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *', [status, req.params.id]
    )
    if (!rows.length) return reply.code(404).send({ error: 'Order not found' })

    // Publish status change to Event Hub
    await publishEvent(statusProducer, 'ORDER_STATUS_CHANGED', { orderId: rows[0].id, newStatus: status, userId: rows[0].user_id })

    // Cache status in Redis for quick lookup
    await redis.setEx(`order:${rows[0].id}:status`, 3600, status)

    reply.send(rows[0])
  })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  console.log(`📦 Order Service on :${PORT} — Swagger: http://localhost:${PORT}/docs`)
}

main().catch(err => { console.error('💥 Order service crashed:', err); process.exit(1) })
