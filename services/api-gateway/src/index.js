import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import httpProxy from '@fastify/http-proxy'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { fetch } from 'undici'

const {
  PORT = 8080, JWT_SECRET = 'supersecretjwtkey123',
  USER_SERVICE_URL, RESTAURANT_SERVICE_URL, MENU_SERVICE_URL, ORDER_SERVICE_URL,
} = process.env

async function waitForService(url, name, retries = 20, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { console.log(`✅ ${name} ready`); return }
    } catch {}
    console.log(`⏳ Waiting for ${name}... (${i}/${retries})`)
    await new Promise(r => setTimeout(r, delayMs))
  }
  console.warn(`⚠️  ${name} not ready — starting anyway`)
}

async function main() {
  await Promise.all([
    waitForService(USER_SERVICE_URL, 'user-service'),
    waitForService(RESTAURANT_SERVICE_URL, 'restaurant-service'),
    waitForService(MENU_SERVICE_URL, 'menu-service'),
    waitForService(ORDER_SERVICE_URL, 'order-service'),
  ])

  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })
  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })

  await app.register(swagger, {
    openapi: {
      info: { title: 'FoodRush API Gateway', version: '1.0.0', description: 'Unified entry point for all FoodRush microservices' },
      servers: [{ url: 'http://localhost:8080', description: 'Local' }],
      tags: [
        { name: 'gateway', description: 'Gateway health' },
        { name: 'auth' }, { name: 'users' }, { name: 'restaurants' }, { name: 'menu' }, { name: 'orders' }
      ],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
    }
  })
  await app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list', persistAuthorization: true } })

  app.get('/health', {
    schema: { tags: ['gateway'], summary: 'Gateway health check' }
  }, async () => ({ status: 'ok', service: 'api-gateway', timestamp: new Date() }))

  await app.register(httpProxy, { upstream: USER_SERVICE_URL,        prefix: '/api/auth',         rewritePrefix: '/auth' })
  await app.register(httpProxy, { upstream: USER_SERVICE_URL,        prefix: '/api/users',        rewritePrefix: '/users' })
  await app.register(httpProxy, { upstream: RESTAURANT_SERVICE_URL,  prefix: '/api/restaurants',  rewritePrefix: '/restaurants' })
  await app.register(httpProxy, { upstream: MENU_SERVICE_URL,        prefix: '/api/menu',         rewritePrefix: '/menu' })
  await app.register(httpProxy, { upstream: ORDER_SERVICE_URL,       prefix: '/api/orders',       rewritePrefix: '/orders' })

  await app.listen({ port: Number(PORT), host: '0.0.0.0' })
  console.log(`🚀 API Gateway on :${PORT} — Swagger: http://localhost:${PORT}/docs`)
}

main().catch(err => { console.error('💥 API Gateway crashed:', err); process.exit(1) })
