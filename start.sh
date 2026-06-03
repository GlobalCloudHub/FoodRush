#!/bin/bash
set -e

echo ""
echo "🔥 FoodRush — Starting up..."
echo ""

# Check docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker Desktop first."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "❌ Docker Compose not found. Please install Docker Compose."
  exit 1
fi

echo "📦 Building and starting all services..."
docker compose up --build -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 8

echo ""
echo "✅ FoodRush is running!"
echo ""
echo "  🌐 Frontend      → http://localhost:3000"
echo "  🔀 API Gateway   → http://localhost:8080"
echo "  👤 User Service  → http://localhost:3001"
echo "  🍽️  Restaurants  → http://localhost:3002"
echo "  🍕 Menu Service  → http://localhost:3003"
echo "  📦 Orders        → http://localhost:3004"
echo ""
echo "  📊 Health checks:"
echo "     curl http://localhost:8080/health"
echo ""
echo "  📋 Logs: docker compose logs -f"
echo "  🛑 Stop: docker compose down"
echo ""
