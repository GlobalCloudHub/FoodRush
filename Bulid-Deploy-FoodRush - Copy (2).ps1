<#
.SYNOPSIS
  FoodRush Deployment using Local/VM Docker Engine (Batch File Semicolon Bypass).
#>

$ErrorActionPreference = "Stop"

# ─── Helper to remove hidden newlines from Azure CLI outputs ────
function Clean-Text($InputString) {
    if ([string]::IsNullOrWhiteSpace($InputString)) { return "" }
    return ($InputString -join "").Trim() -replace "`r","" -replace "`n",""
}

# ─── Configuration ───────────────────────────────────────────────────────────
$Project       = "foodrush"
$Env           = "dev"
$Location      = "centralindia" 
$LocShort      = "cin"

$ResourceGroup = "rg-$Project-$Env-$LocShort"
$AcrName       = "acr$Project$Env$LocShort"
$AcaEnvName    = "cae-$Project$Env-$LocShort"
$PgServer      = "psql-$Project-$Env-$LocShort"
$EvhNsName     = "evhns-$Project-$Env-$LocShort"

$PgAdminUser   = "foodrushadmin"
$PgAdminPass   = "FoodRush@2026#Secure!" 
$PgDbName      = "foodrush"
$JwtSecret     = "supersecretjwtkey123-cloud-dev"

Write-Host "🚀 Resuming VM-Based Deployment for FoodRush..." -ForegroundColor Cyan

# Fetch existing infrastructure details
Write-Host "🔍 Fetching Infrastructure connection strings..." -ForegroundColor Yellow
$AcrLoginServer = Clean-Text (az acr show --name $AcrName --query loginServer -o tsv)
$DbUrl = "postgresql://${PgAdminUser}:${PgAdminPass}@${PgServer}.postgres.database.azure.com:5432/${PgDbName}?sslmode=require"

$RedisFqdn = Clean-Text (az containerapp show --name "redis-cache" --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv)
$RedisUrl = "redis://$RedisFqdn:6379"

$EvhOrdersSend = Clean-Text (az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-orders" --name "send" --query primaryConnectionString -o tsv)
$EvhStatusSend = Clean-Text (az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-order-status" --name "send" --query primaryConnectionString -o tsv)

# ─── Authenticate Local Docker to Azure Container Registry ───────────────────
Write-Host "🔐 Logging Docker into Azure Container Registry ($AcrName)..." -ForegroundColor Yellow
az acr login --name $AcrName

# ─── Build and Deploy Apps ───────────────────────────────────────────────────
Write-Host "`n🐳 Building Images Locally and Deploying to ACA..." -ForegroundColor Cyan

function Deploy-App ($AppName, $Path, $Port, $EnvVars, $Secrets, $Ingress) {
    Write-Host "`n   -> [1/3] Building $AppName locally on VM..." -ForegroundColor Cyan
    docker build -t "$AcrLoginServer/foodrush/$($AppName):latest" $Path 
    
    Write-Host "   -> [2/3] Pushing $AppName to Azure ACR..." -ForegroundColor Cyan
    docker push "$AcrLoginServer/foodrush/$($AppName):latest"
    
    Write-Host "   -> [3/3] Deploying $AppName to Azure Container Apps..." -ForegroundColor Cyan
    
    # ⚠️ THE FIX: We write the exact command to a .cmd file to bypass PowerShell's quoting bugs
    $cmdStr = "az containerapp create --name $AppName --resource-group $ResourceGroup --environment $AcaEnvName --image `"$AcrLoginServer/foodrush/$($AppName):latest`" --registry-server $AcrLoginServer --ingress $Ingress --target-port $Port --secrets $Secrets --env-vars $EnvVars --output none"
    
    $cmdStr | Out-File -FilePath "deploy_temp.cmd" -Encoding ASCII
    cmd.exe /c "deploy_temp.cmd"
        
    $fqdn = Clean-Text (az containerapp show --name $AppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv)
    return "https://$fqdn"
}

# Safely format variables into single strings with literal double quotes protecting the values
$SharedSecrets = "database-url=`"$DbUrl`" redis-url=`"$RedisUrl`" jwt-secret=`"$JwtSecret`""
$BaseEnv = "DATABASE_URL=secretref:database-url REDIS_URL=secretref:redis-url JWT_SECRET=secretref:jwt-secret"

# 1. User Service
$UserEnv = "$BaseEnv PORT=3001"
$UserUrl = Deploy-App "user-service" "./services/user-service" 3001 $UserEnv $SharedSecrets "internal"

# 2. Restaurant Service
$RestEnv = "$BaseEnv PORT=3002"
$RestUrl = Deploy-App "restaurant-service" "./services/restaurant-service" 3002 $RestEnv $SharedSecrets "internal"

# 3. Menu Service
$MenuEnv = "$BaseEnv PORT=3003"
$MenuUrl = Deploy-App "menu-service" "./services/menu-service" 3003 $MenuEnv $SharedSecrets "internal"

# 4. Order Service (Semicolons are now safely wrapped in quotes inside the .cmd file)
$OrderSecrets = "$SharedSecrets evh-orders-send=`"$EvhOrdersSend`" evh-status-send=`"$EvhStatusSend`""
$OrderEnv = "$BaseEnv PORT=3004 MENU_SERVICE_URL=`"$MenuUrl`" EVH_ORDERS_SEND_CONN=secretref:evh-orders-send EVH_STATUS_SEND_CONN=secretref:evh-status-send"
$OrderUrl = Deploy-App "order-service" "./services/order-service" 3004 $OrderEnv $OrderSecrets "internal"

# 5. API Gateway
$GatewayEnv = "PORT=8080 JWT_SECRET=secretref:jwt-secret USER_SERVICE_URL=`"$UserUrl`" RESTAURANT_SERVICE_URL=`"$RestUrl`" MENU_SERVICE_URL=`"$MenuUrl`" ORDER_SERVICE_URL=`"$OrderUrl`""
$GatewaySecrets = "jwt-secret=`"$JwtSecret`""
$GatewayUrl = Deploy-App "api-gateway" "./services/api-gateway" 8080 $GatewayEnv $GatewaySecrets "external"

# 6. React Frontend
Write-Host "`n   -> [1/3] Building frontend locally (Injecting Gateway URL: $GatewayUrl)..." -ForegroundColor Cyan
docker build --build-arg REACT_APP_API_URL=$GatewayUrl -t "$AcrLoginServer/foodrush/frontend:latest" ./frontend
Write-Host "   -> [2/3] Pushing frontend to Azure ACR..." -ForegroundColor Cyan
docker push "$AcrLoginServer/foodrush/frontend:latest"
Write-Host "   -> [3/3] Deploying frontend Container App..." -ForegroundColor Cyan

$frontendCmd = "az containerapp create --name frontend --resource-group $ResourceGroup --environment $AcaEnvName --image `"$AcrLoginServer/foodrush/frontend:latest`" --registry-server $AcrLoginServer --ingress external --target-port 80 --output none"
$frontendCmd | Out-File -FilePath "deploy_temp.cmd" -Encoding ASCII
cmd.exe /c "deploy_temp.cmd"

$FrontendFqdn = Clean-Text (az containerapp show --name "frontend" --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv)

# Clean up temp file
if (Test-Path "deploy_temp.cmd") { Remove-Item "deploy_temp.cmd" }

Write-Host "`n🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "=========================================================="
Write-Host "🖥️  Frontend UI : https://$FrontendFqdn"
Write-Host "🔀  API Gateway : $GatewayUrl"
Write-Host "🐘 Database URL : $DbUrl"