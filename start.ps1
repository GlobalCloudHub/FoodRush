# FoodRush - Windows Startup Script
# Run with: .\start.ps1

Write-Host ""
Write-Host "🔥 FoodRush — Starting up..." -ForegroundColor Yellow
Write-Host ""

# Check Docker
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop for Windows." -ForegroundColor Red
    Write-Host "   Download: https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    exit 1
}

# Check Docker Compose
try {
    docker compose version | Out-Null
} catch {
    Write-Host "❌ Docker Compose not found. It comes bundled with Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker Desktop is not running. Please start it first." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Building and starting all services (first build takes ~3-5 min)..." -ForegroundColor Cyan
docker compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services. Check the logs:" -ForegroundColor Red
    Write-Host "   docker compose logs" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "✅ FoodRush is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Frontend      →  http://localhost:3000" -ForegroundColor White
Write-Host "  🔀 API Gateway   →  http://localhost:8080" -ForegroundColor White
Write-Host "  👤 User Service  →  http://localhost:3001/health" -ForegroundColor Gray
Write-Host "  🍽️  Restaurants  →  http://localhost:3002/health" -ForegroundColor Gray
Write-Host "  🍕 Menu Service  →  http://localhost:3003/health" -ForegroundColor Gray
Write-Host "  📦 Orders        →  http://localhost:3004/health" -ForegroundColor Gray
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Yellow
Write-Host "    docker compose logs -f              # stream all logs"
Write-Host "    docker compose logs -f user-service # logs for one service"
Write-Host "    docker compose down                 # stop everything"
Write-Host "    docker compose down -v              # stop + wipe database"
Write-Host ""

# Open browser automatically
$url = "http://localhost:3000"
Write-Host "  Opening $url in your browser..." -ForegroundColor Cyan
Start-Process $url
