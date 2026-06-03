# 🔥 FoodRush — Food Delivery Microservices App

A modern food delivery platform built with **Node.js Fastify microservices** + **React 18** frontend, orchestrated with **Docker Compose**.

## Architecture

```
                        ┌─────────────────────────┐
                        │     React Frontend       │
                        │   (Port 3000 → Nginx)    │
                        └───────────┬─────────────┘
                                    │ HTTP
                        ┌───────────▼─────────────┐
                        │      API Gateway         │
                        │      (Port 8080)         │
                        │   JWT Auth + Routing     │
                        └──┬──────┬──────┬────┬───┘
                           │      │      │    │
              ┌────────────▼─┐  ┌─▼──┐ ┌▼──┐ ┌▼──────────┐
              │  User Service │  │Rest│ │Menu│ │   Order   │
              │   Port 3001   │  │3002│ │3003│ │  Service  │
              │ Auth + JWT    │  │    │ │    │ │  Port 3004 │
              └──────┬────────┘  └─┬──┘ └──┬─┘ └─────┬─────┘
                     │             │        │          │
              ┌──────▼─────────────▼────────▼──────────▼──┐
              │              PostgreSQL 16                  │
              │              Redis 7 (Cache)                │
              └────────────────────────────────────────────┘
```

## Services

| Service | Port | Responsibility |
|---------|------|----------------|
| **api-gateway** | 8080 | JWT validation, request proxying, rate limiting |
| **user-service** | 3001 | Registration, login, JWT issuance |
| **restaurant-service** | 3002 | List/search restaurants (Redis cached) |
| **menu-service** | 3003 | Menu grouped by category (Redis cached) |
| **order-service** | 3004 | Place orders, order history, status tracking |

## Quick Start

### Prerequisites
- Docker Desktop (with Compose v2)
- Ports 3000, 3001–3004, 5432, 6379, 8080 free

### Run

```bash
# Make the script executable
chmod +x start.sh

# Start everything
./start.sh

# Or manually:
docker compose up --build
```

Open **http://localhost:3000** 🎉

### Stop
```bash
docker compose down

# Remove volumes too (fresh DB)
docker compose down -v
```

## API Reference

### Auth
```bash
# Register
curl -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Subash","email":"subash@example.com","password":"test123"}'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"subash@example.com","password":"test123"}'
```

### Restaurants
```bash
# List all
curl http://localhost:8080/api/restaurants

# Search
curl http://localhost:8080/api/restaurants/search/indian

# Single restaurant
curl http://localhost:8080/api/restaurants/1
```

### Menu
```bash
# Get menu for restaurant (grouped by category)
curl http://localhost:8080/api/menu/restaurant/1
```

### Orders (requires auth token)
```bash
TOKEN="your_jwt_token"

# Place order
curl -X POST http://localhost:8080/api/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "restaurant_id": 1,
    "items": [{"menu_item_id": 1, "quantity": 2}],
    "delivery_address": "123 Main Street, Pune"
  }'

# My orders
curl http://localhost:8080/api/orders/my \
  -H "Authorization: Bearer $TOKEN"
```

## Tech Stack

| Layer | Tech |
|-------|------|
| **Runtime** | Node.js 20 |
| **Framework** | Fastify 4 (all services) |
| **Frontend** | React 18 + React Router 6 |
| **Database** | PostgreSQL 16 |
| **Cache** | Redis 7 |
| **Auth** | JWT (via @fastify/jwt) |
| **API** | REST with proxy routing |
| **Container** | Docker + Docker Compose |
| **Frontend server** | Nginx (Alpine) |

## Useful Commands

```bash
# Logs for a specific service
docker compose logs -f order-service

# Shell into a container
docker compose exec postgres psql -U foodrush

# Rebuild a single service
docker compose up --build user-service

# Check health
curl http://localhost:8080/health
curl http://localhost:3001/health
```

## Next Steps → Deploy to AKS

When ready to move to Azure:
1. Push images to **Azure Container Registry**
2. Create **AKS cluster** (or reuse your ShopWave cluster)
3. Convert `docker-compose.yml` → Kubernetes manifests (use `kompose convert`)
4. Replace hardcoded secrets with **Azure Key Vault** + UAMI
5. Replace PostgreSQL container with **Azure Database for PostgreSQL Flexible Server**
6. Replace Redis with **Azure Cache for Redis**
7. Add **AGIC** (Application Gateway Ingress Controller) for routing
