<#
.SYNOPSIS
  End-to-End FoodRush Deployment: Infra Provisioning -> Cloud Build -> ACA Deployment
#>

$ErrorActionPreference = "Stop"

# ─── Configuration ───────────────────────────────────────────────────────────
$Project       = "foodrush"
$Env           = "dev"
$Location      = "centralindia"   # <-- Changed to Pune region
$LocShort      = "cin"

$ResourceGroup = "rg-$Project-$Env-$LocShort"
$VNetName      = "vnet-$Project-$Env"
$PgServer      = "psql-$Project-$Env-$LocShort"
$EvhNsName     = "evhns-$Project-$Env-$LocShort"
$AcrName       = "acr$Project$Env$LocShort"
$LawName       = "law-$Project$Env-$LocShort"
$AcaEnvName    = "cae-$Project$Env-$LocShort"

# DB Credentials (Change for Prod!)
$PgAdminUser   = "foodrushadmin"
$PgAdminPass   = "FoodRush@2026#Secure!" 
$PgDbName      = "foodrush"
$JwtSecret     = "supersecretjwtkey123-cloud-dev"

Write-Host "🚀 Starting Full Azure Deployment for FoodRush..." -ForegroundColor Cyan

# ─── 0. Register Providers (One-time setup for new subscriptions) ────────────
Write-Host "🔍 Ensuring required Azure resource providers are registered..." -ForegroundColor Yellow
az provider register --namespace Microsoft.Cache --wait
az provider register --namespace Microsoft.EventHub --wait
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait 

# ─── 1. Core Infrastructure & Networking ─────────────────────────────────────
Write-Host "`n📁 Creating Resource Group..."
az group create --name $ResourceGroup --location $Location --output none

Write-Host "🌐 Creating VNet and Subnets..."
az network vnet create --resource-group $ResourceGroup --name $VNetName --location $Location --address-prefix "10.0.0.0/16" --output none
az network vnet subnet create --resource-group $ResourceGroup --vnet-name $VNetName --name "snet-postgres" `
    --address-prefix "10.0.1.0/24" --delegations "Microsoft.DBforPostgreSQL/flexibleServers" --output none

$DnsZone = "$Project-$Env.private.postgres.database.azure.com"
az network private-dns zone create --resource-group $ResourceGroup --name $DnsZone --output none
$VNetId = az network vnet show --resource-group $ResourceGroup --name $VNetName --query id -o tsv
az network private-dns link vnet create --resource-group $ResourceGroup --zone-name $DnsZone `
    --name "dns-link-postgres" --virtual-network $VNetId --registration-enabled false --output none

# ─── 2. Container Environment & Registry ─────────────────────────────────────
Write-Host "`n📦 Provisioning Container Environment & ACR..." -ForegroundColor Yellow
az acr create --resource-group $ResourceGroup --name $AcrName --sku Basic --admin-enabled true --output none
$AcrLoginServer = az acr show --name $AcrName --query loginServer -o tsv

az monitor log-analytics workspace create --resource-group $ResourceGroup --workspace-name $LawName --location $Location --output none
$LawClientId = az monitor log-analytics workspace show --resource-group $ResourceGroup --workspace-name $LawName --query customerId -o tsv
$LawSecret = az monitor log-analytics workspace get-shared-keys --resource-group $ResourceGroup --workspace-name $LawName --query primarySharedKey -o tsv

az containerapp env create --name $AcaEnvName --resource-group $ResourceGroup --location $Location `
    --logs-workspace-id $LawClientId --logs-workspace-key $LawSecret --output none

# ─── 3. Databases & Cache ────────────────────────────────────────────────────
Write-Host "`n🐘 Provisioning PostgreSQL Flexible Server (Takes ~5-10 mins)..." -ForegroundColor Yellow
$SnetPgId = az network vnet subnet show --resource-group $ResourceGroup --vnet-name $VNetName --name "snet-postgres" --query id -o tsv
$DnsZoneId = az network private-dns zone show --resource-group $ResourceGroup --name $DnsZone --query id -o tsv

az postgres flexible-server create `
    --resource-group $ResourceGroup --name $PgServer --location $Location `
    --admin-user $PgAdminUser --admin-password $PgAdminPass `
    --sku-name "Standard_B1ms" --tier "Burstable" --storage-size 32 --version 16 `
    --subnet $SnetPgId --private-dns-zone $DnsZoneId --yes --output none

Write-Host "🐘 Creating Database: $PgDbName..." -ForegroundColor Yellow
az postgres flexible-server db create `
    --resource-group $ResourceGroup --server-name $PgServer --database-name $PgDbName --output none

az postgres flexible-server parameter set --resource-group $ResourceGroup --server-name $PgServer `
    --name "azure.extensions" --value "UUID-OSSP,PGCRYPTO" --output none

$DbUrl = "postgresql://${PgAdminUser}:${PgAdminPass}@${PgServer}.postgres.database.azure.com:5432/${PgDbName}?sslmode=require"

Write-Host "🔴 Provisioning Internal Redis Container App (Bypassing Retirement)..." -ForegroundColor Yellow
az containerapp create --name "redis-cache" --resource-group $ResourceGroup --environment $AcaEnvName `
    --image "redis:alpine" --ingress internal --target-port 6379 --transport tcp --exposed-port 6379 --output none

$RedisFqdn = az containerapp show --name "redis-cache" --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$RedisUrl = "redis://$RedisFqdn:6379"

# ─── 4. Event Hubs ───────────────────────────────────────────────────────────
Write-Host "`n📨 Provisioning Event Hubs..." -ForegroundColor Yellow
az eventhubs namespace create --resource-group $ResourceGroup --name $EvhNsName --location $Location --sku Standard --capacity 1 --output none
foreach ($Hub in @("evh-orders", "evh-order-status")) {
    # FIXED: Removed deprecated --message-retention flag
    az eventhubs eventhub create --resource-group $ResourceGroup --namespace-name $EvhNsName --name $Hub --partition-count 2 --output none
    az eventhubs eventhub authorization-rule create --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name $Hub --name "send" --rights Send --output none
}
$EvhOrdersSend = az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-orders" --name "send" --query primaryConnectionString -o tsv
$EvhStatusSend = az eventhubs eventhub authorization-rule keys list --resource-group $ResourceGroup --namespace-name $EvhNsName --eventhub-name "evh-order-status" --name "send" --query primaryConnectionString -o tsv

# ─── 5. Build and Deploy Apps ────────────────────────────────────────────────
Write-Host "`n☁️ Building and Deploying Apps via ACR Tasks..." -ForegroundColor Cyan

$SharedSecrets = "database-url=$DbUrl redis-url=$RedisUrl jwt-secret=$JwtSecret"

function Deploy-App ($AppName, $Path, $Port, $EnvVars, $Secrets, $Ingress) {
    Write-Host "   -> Building & Deploying $AppName..."
    
    # FIXED: Wrapped $AppName in $() to prevent PowerShell scope resolution bugs
    az acr build --registry $AcrName --image "foodrush/$($AppName):latest" $Path --output none
    
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

Write-Host "   -> Building & Deploying frontend..."
az acr build --registry $AcrName --image "foodrush/frontend:latest" --build-arg "REACT_APP_API_URL=$GatewayUrl" ./frontend --output none
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