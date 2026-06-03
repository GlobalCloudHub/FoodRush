# FoodRush - Stop all services
# Run with: .\stop.ps1

param(
    [switch]$Wipe  # Use -Wipe to also delete the database volume
)

Write-Host ""
if ($Wipe) {
    Write-Host "🗑️  Stopping FoodRush and wiping database..." -ForegroundColor Yellow
    docker compose down -v
} else {
    Write-Host "🛑 Stopping FoodRush (data preserved)..." -ForegroundColor Yellow
    docker compose down
}

Write-Host "✅ Done." -ForegroundColor Green
Write-Host ""
Write-Host "  To start again:  .\start.ps1" -ForegroundColor Cyan
Write-Host "  To wipe data:    .\stop.ps1 -Wipe" -ForegroundColor Cyan
Write-Host ""
