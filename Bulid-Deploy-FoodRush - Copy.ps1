<#
.SYNOPSIS
  FoodRush Deployment using Local/VM Docker Engine.
#>

$ErrorActionPreference = "Stop"

# ─── Configuration ───────────────────────────────────────────────────────────
$Project       = "foodrush"
$Env           = "dev"
$Location      = "centralindia" 
$LocShort      = "cin"

$ResourceGroup = "rg-$Project-$Env-$LocShort"
$VNetName      = "vnet-$Project-$Env"
$PgServer      = "psql-$Project-$Env-$LocShort"
$EvhNsName     = "evhns-$Project-$Env-$LocShort"
$AcrName       = "acr$Project$Env$LocShort"
$LawName       = "law-$Project$Env-$LocShort"
$AcaEnvName    = "cae-$Project$Env-$LocShort"

$PgAdminUser   = "foodrushadmin"
$PgAdminPass   = "FoodRush@2026#Secure!" 
$PgDbName      = "foodrush"
$JwtSecret     = "supersecretjwtkey123-cloud-dev"

Write-Host "🚀 Starting VM-Based Deployment for FoodRush..." -ForegroundColor Cyan

# Fetch existing infrastructure details
Write-Host "🔍 Fetching Infrastructure connection strings..." -ForegroundColor Yellow
$AcrLoginServer = az acr show --name $AcrName --query loginServer -o tsv
$DbUrl = "postgresql://${PgAdminUser}:${PgAdminPass}@${PgServer}.postgres.database.azure.com:5432/${PgDbName}?sslmode=require"

$RedisFqdn = az containerapp show --name "redis-cache" --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$RedisUrl = "redis://$RedisFqdn:6379"

$EvhOrdersSend = az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-orders" --name "send" --query primaryConnectionString -o tsv
$EvhStatusSend = az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-order-status" --name "send" --query primaryConnectionString -o tsv

# ─── Authenticate Local Docker to Azure Container Registry ───────────────────
Write-Host "🔐 Logging Docker into Azure Container Registry ($AcrName)..." -ForegroundColor Yellow
az acr login --name $AcrName

# ─── Build and Deploy Apps ───────────────────────────────────────────────────
Write-Host "`n🐳 Building Images Locally and Deploying to ACA..." -ForegroundColor Cyan

$SharedSecrets = "database-url=$DbUrl redis-url=$RedisUrl jwt-secret=$JwtSecret"

function Deploy-App ($AppName, $Path, $Port, $EnvVars, $Secrets, $Ingress) {
    Write-Host "`n   -> [1/3] Building $AppName locally on VM..." -ForegroundColor Cyan
    docker build -t "$AcrLoginServer/foodrush/$($AppName):latest" $Path 
    
    Write-Host "   -> [2/3] Pushing $AppName to Azure ACR..." -ForegroundColor Cyan
    docker push "$AcrLoginServer/foodrush/$($AppName):latest"
    
    Write-Host "   -> [3/3] Deploying $AppName to Azure Container Apps..." -ForegroundColor Cyan
    az containerapp create --name $AppName --resource-group $ResourceGroup --environment $AcaEnvName `
        --image "$AcrLoginServer/foodrush/$($AppName):latest" --registry-server $AcrLoginServer `
        --ingress $Ingress --target-port $Port --secrets $Secrets --env-vars $EnvVars --output none
        
    return "https://" + (az containerapp show --name $AppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv)
}

$UserUrl = Deploy-App "user-service" "./services/user-service" 3001 "PORT=3001 DATABASE_URL=secretref:database-url REDIS_URL=secretref:redis-url JWT_SECRET=secretref:jwt-secret" $SharedSecrets "internal"
$RestUrl = Deploy-App "restaurant-service" "./services/restaurant-service" 3002 "PORT=3002 DATABASE_URL=secretref:database-url REDIS_URL=secretref:redis-url JWT_SECRET=secretref:jwt-secret" $SharedSecrets "internal"
$MenuUrl = Deploy-App "menu-service" "./services/menu-service" 3003 "PORT=3003 DATABASE_URL=secretref:database-url REDIS_URL=secretref:redis-url JWT_SECRET=secretref:jwt-secret" $SharedSecrets "internal"

$OrderSecrets = "$SharedSecrets evh-orders-send=$EvhOrdersSend evh-status-send=$EvhStatusSend"
$OrderEnv = "PORT=3004 DATABASE_URL=secretref:database-url REDIS_URL=secretref:redis-url JWT_SECRET=secretref:jwt-secret MENU_SERVICE_URL=$MenuUrl EVH_ORDERS_SEND_CONN=secretref:evh-orders-send EVH_STATUS_SEND_CONN=secretref:evh-status-send"
$OrderUrl = Deploy-App "order-service" "./services/order-service" 3004 $OrderEnv $OrderSecrets "internal"

$GatewayEnv = "PORT=8080 JWT_SECRET=secretref:jwt-secret USER_SERVICE_URL=$UserUrl RESTAURANT_SERVICE_URL=$RestUrl MENU_SERVICE_URL=$MenuUrl ORDER_SERVICE_URL=$OrderUrl"
$GatewayUrl = Deploy-App "api-gateway" "./services/api-gateway" 8080 $GatewayEnv "jwt-secret=$JwtSecret" "external"

Write-Host "`n   -> [1/3] Building frontend locally (Injecting Gateway URL: $GatewayUrl)..." -ForegroundColor Cyan
docker build --build-arg REACT_APP_API_URL=$GatewayUrl -t "$AcrLoginServer/foodrush/frontend:latest" ./frontend
Write-Host "   -> [2/3] Pushing frontend to Azure ACR..." -ForegroundColor Cyan
docker push "$AcrLoginServer/foodrush/frontend:latest"
Write-Host "   -> [3/3] Deploying frontend Container App..." -ForegroundColor Cyan
az containerapp create --name "frontend" --resource-group $ResourceGroup --environment $AcaEnvName `
    --image "$AcrLoginServer/foodrush/frontend:latest" --registry-server $AcrLoginServer `
    --ingress external --target-port 80 --output none

$FrontendFqdn = az containerapp show --name "frontend" --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv

Write-Host "`n🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================================="
Write-Host "🖥️  Frontend UI : https://$FrontendFqdn"
Write-Host "🔀  API Gateway : $GatewayUrl"
Write-Host "🐘 Database URL : $DbUrl"
Write-Host "=========================================================="