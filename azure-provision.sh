#!/bin/bash
# ============================================================
#  FoodRush — Azure Resource Provisioning Script
#  Run: chmod +x azure-provision.sh && ./azure-provision.sh
#  Windows PowerShell: bash azure-provision.sh
# ============================================================
set -e

# ── Config — edit these before running ──────────────────────
PROJECT="foodrush"
ENV="dev"
LOCATION="southindia"
LOCATION_SHORT="sin"
PG_ADMIN_USER="foodrushadmin"
PG_ADMIN_PASSWORD="FoodRush@2025#Secure"   # change this!
PG_DB_NAME="foodrush"

# Derived names (consistent naming convention)
SUFFIX="${PROJECT}${ENV}"
RG="rg-${PROJECT}-${ENV}-${LOCATION_SHORT}"
PG_SERVER="psql-${PROJECT}-${ENV}-${LOCATION_SHORT}"
REDIS_NAME="redis-${SUFFIX}-${LOCATION_SHORT}"
EVHNS_NAME="evhns-${SUFFIX}-${LOCATION_SHORT}"
ACR_NAME="acr${PROJECT}${ENV}${LOCATION_SHORT}"         # no hyphens for ACR
LAW_NAME="law-${SUFFIX}-${LOCATION_SHORT}"
VNET_NAME="vnet-${PROJECT}-${ENV}"
SNET_PG="snet-postgres"
SNET_SVC="snet-services"
DNS_ZONE="${PROJECT}-${ENV}.private.postgres.database.azure.com"

echo ""
echo "======================================================"
echo "  🔥 FoodRush Azure Infrastructure Provisioning"
echo "======================================================"
echo "  Resource Group : $RG"
echo "  Location       : $LOCATION"
echo "  Postgres       : $PG_SERVER"
echo "  Redis          : $REDIS_NAME"
echo "  Event Hubs NS  : $EVHNS_NAME"
echo "  ACR            : $ACR_NAME"
echo "======================================================"
echo ""

# ── Login check ─────────────────────────────────────────────
echo "🔐 Checking Azure login..."
az account show --output none 2>/dev/null || { echo "❌ Not logged in. Run: az login"; exit 1; }
SUBSCRIPTION=$(az account show --query "name" -o tsv)
echo "✅ Logged in — subscription: $SUBSCRIPTION"
echo ""

# ── Resource Group ───────────────────────────────────────────
echo "📁 Creating Resource Group..."
az group create \
  --name "$RG" \
  --location "$LOCATION" \
  --tags project=$PROJECT environment=$ENV managed_by=azure-cli \
  --output none
echo "✅ Resource Group: $RG"

# ── Log Analytics ────────────────────────────────────────────
echo ""
echo "📊 Creating Log Analytics Workspace..."
az monitor log-analytics workspace create \
  --resource-group "$RG" \
  --workspace-name "$LAW_NAME" \
  --location "$LOCATION" \
  --sku PerGB2018 \
  --retention-time 30 \
  --output none
echo "✅ Log Analytics: $LAW_NAME"

# ── Virtual Network ──────────────────────────────────────────
echo ""
echo "🌐 Creating Virtual Network..."
az network vnet create \
  --resource-group "$RG" \
  --name "$VNET_NAME" \
  --location "$LOCATION" \
  --address-prefix "10.0.0.0/16" \
  --output none

az network vnet subnet create \
  --resource-group "$RG" \
  --vnet-name "$VNET_NAME" \
  --name "$SNET_PG" \
  --address-prefix "10.0.1.0/24" \
  --delegations "Microsoft.DBforPostgreSQL/flexibleServers" \
  --service-endpoints "Microsoft.Storage" \
  --output none

az network vnet subnet create \
  --resource-group "$RG" \
  --vnet-name "$VNET_NAME" \
  --name "$SNET_SVC" \
  --address-prefix "10.0.2.0/24" \
  --output none
echo "✅ VNet + Subnets created"

# ── Private DNS for Postgres ─────────────────────────────────
echo ""
echo "🔒 Creating Private DNS Zone for PostgreSQL..."
az network private-dns zone create \
  --resource-group "$RG" \
  --name "$DNS_ZONE" \
  --output none

VNET_ID=$(az network vnet show --resource-group "$RG" --name "$VNET_NAME" --query id -o tsv)
az network private-dns link vnet create \
  --resource-group "$RG" \
  --zone-name "$DNS_ZONE" \
  --name "dns-link-postgres" \
  --virtual-network "$VNET_ID" \
  --registration-enabled false \
  --output none
echo "✅ Private DNS Zone: $DNS_ZONE"

# ── PostgreSQL Flexible Server ───────────────────────────────
echo ""
echo "🐘 Creating PostgreSQL Flexible Server (this takes ~5 min)..."
SNET_PG_ID=$(az network vnet subnet show \
  --resource-group "$RG" \
  --vnet-name "$VNET_NAME" \
  --name "$SNET_PG" \
  --query id -o tsv)

DNS_ZONE_ID=$(az network private-dns zone show \
  --resource-group "$RG" \
  --name "$DNS_ZONE" \
  --query id -o tsv)

az postgres flexible-server create \
  --resource-group "$RG" \
  --name "$PG_SERVER" \
  --location "$LOCATION" \
  --admin-user "$PG_ADMIN_USER" \
  --admin-password "$PG_ADMIN_PASSWORD" \
  --database-name "$PG_DB_NAME" \
  --sku-name "B_Standard_B1ms" \
  --tier "Burstable" \
  --storage-size 32 \
  --version 16 \
  --subnet "$SNET_PG_ID" \
  --private-dns-zone "$DNS_ZONE_ID" \
  --public-access Disabled \
  --backup-retention 7 \
  --output none
echo "✅ PostgreSQL: $PG_SERVER"

# Enable extensions needed by app
az postgres flexible-server parameter set \
  --resource-group "$RG" \
  --server-name "$PG_SERVER" \
  --name "azure.extensions" \
  --value "UUID-OSSP,PGCRYPTO" \
  --output none

# ── Azure Cache for Redis ────────────────────────────────────
echo ""
echo "🔴 Creating Azure Cache for Redis..."
az redis create \
  --resource-group "$RG" \
  --name "$REDIS_NAME" \
  --location "$LOCATION" \
  --sku Standard \
  --vm-size C1 \
  --minimum-tls-version 1.2 \
  --output none
echo "✅ Redis: $REDIS_NAME"

# ── Event Hubs Namespace ─────────────────────────────────────
echo ""
echo "📨 Creating Event Hubs Namespace..."
az eventhubs namespace create \
  --resource-group "$RG" \
  --name "$EVHNS_NAME" \
  --location "$LOCATION" \
  --sku Standard \
  --capacity 1 \
  --output none

# Event Hubs
for HUB in "evh-orders" "evh-order-status" "evh-notifications"; do
  az eventhubs eventhub create \
    --resource-group "$RG" \
    --namespace-name "$EVHNS_NAME" \
    --name "$HUB" \
    --partition-count 4 \
    --message-retention 1 \
    --output none
  echo "   ✅ Event Hub: $HUB"
done

# Authorization rules
az eventhubs eventhub authorization-rule create \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-orders" --name "order-service-send" \
  --rights Send --output none

az eventhubs eventhub authorization-rule create \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-orders" --name "notification-service-listen" \
  --rights Listen --output none

az eventhubs eventhub authorization-rule create \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-order-status" --name "order-service-status-send" \
  --rights Send --output none

az eventhubs eventhub authorization-rule create \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-order-status" --name "status-listen" \
  --rights Listen --output none

echo "✅ Event Hubs + Authorization Rules created"

# ── Azure Container Registry ─────────────────────────────────
echo ""
echo "📦 Creating Azure Container Registry..."
az acr create \
  --resource-group "$RG" \
  --name "$ACR_NAME" \
  --location "$LOCATION" \
  --sku Basic \
  --admin-enabled true \
  --output none
echo "✅ ACR: $ACR_NAME"

# ── Diagnostic Settings ──────────────────────────────────────
echo ""
echo "📊 Configuring Diagnostic Settings..."
LAW_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RG" --workspace-name "$LAW_NAME" \
  --query id -o tsv)

EVHNS_ID=$(az eventhubs namespace show \
  --resource-group "$RG" --name "$EVHNS_NAME" \
  --query id -o tsv)

az monitor diagnostic-settings create \
  --name "diag-eventhub" \
  --resource "$EVHNS_ID" \
  --workspace "$LAW_ID" \
  --logs '[{"category":"ArchiveLogs","enabled":true},{"category":"OperationalLogs","enabled":true}]' \
  --metrics '[{"category":"AllMetrics","enabled":true}]' \
  --output none

REDIS_ID=$(az redis show --resource-group "$RG" --name "$REDIS_NAME" --query id -o tsv)
az monitor diagnostic-settings create \
  --name "diag-redis" \
  --resource "$REDIS_ID" \
  --workspace "$LAW_ID" \
  --metrics '[{"category":"AllMetrics","enabled":true}]' \
  --output none

echo "✅ Diagnostic settings configured"

# ── Collect all connection strings ───────────────────────────
echo ""
echo "🔑 Collecting connection strings..."

PG_CONN="postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_SERVER}.postgres.database.azure.com:5432/${PG_DB_NAME}?sslmode=require"

REDIS_HOST=$(az redis show --resource-group "$RG" --name "$REDIS_NAME" --query hostName -o tsv)
REDIS_KEY=$(az redis list-keys --resource-group "$RG" --name "$REDIS_NAME" --query primaryKey -o tsv)
REDIS_CONN="rediss://:${REDIS_KEY}@${REDIS_HOST}:6380"

EVH_ORDERS_SEND=$(az eventhubs eventhub authorization-rule keys list \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-orders" --name "order-service-send" \
  --query primaryConnectionString -o tsv)

EVH_ORDERS_LISTEN=$(az eventhubs eventhub authorization-rule keys list \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-orders" --name "notification-service-listen" \
  --query primaryConnectionString -o tsv)

EVH_STATUS_SEND=$(az eventhubs eventhub authorization-rule keys list \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-order-status" --name "order-service-status-send" \
  --query primaryConnectionString -o tsv)

EVH_STATUS_LISTEN=$(az eventhubs eventhub authorization-rule keys list \
  --resource-group "$RG" --namespace-name "$EVHNS_NAME" \
  --eventhub-name "evh-order-status" --name "status-listen" \
  --query primaryConnectionString -o tsv)

ACR_SERVER=$(az acr show --resource-group "$RG" --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USER=$(az acr credential show --resource-group "$RG" --name "$ACR_NAME" --query username -o tsv)
ACR_PASS=$(az acr credential show --resource-group "$RG" --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# ── Write .env file ──────────────────────────────────────────
ENV_FILE=".env.azure"
cat > "$ENV_FILE" <<ENVEOF
# ============================================================
#  FoodRush — Azure Environment Variables
#  Generated by azure-provision.sh on $(date)
#  DO NOT commit this file to git
# ============================================================

# PostgreSQL
DATABASE_URL=${PG_CONN}
PG_SERVER=${PG_SERVER}.postgres.database.azure.com

# Redis
REDIS_URL=${REDIS_CONN}

# Event Hubs
EVENTHUB_NAMESPACE=${EVHNS_NAME}.servicebus.windows.net
EVH_ORDERS_SEND_CONN=${EVH_ORDERS_SEND}
EVH_ORDERS_LISTEN_CONN=${EVH_ORDERS_LISTEN}
EVH_STATUS_SEND_CONN=${EVH_STATUS_SEND}
EVH_STATUS_LISTEN_CONN=${EVH_STATUS_LISTEN}

# JWT
JWT_SECRET=change-this-to-a-strong-random-secret-in-prod

# ACR
ACR_LOGIN_SERVER=${ACR_SERVER}
ACR_USERNAME=${ACR_USER}
ACR_PASSWORD=${ACR_PASS}

# App
REACT_APP_API_URL=http://localhost:8080
ENVEOF

echo "✅ Environment variables written to: $ENV_FILE"

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  ✅  All Azure resources provisioned successfully!"
echo "======================================================"
echo ""
echo "  Resource Group  : $RG"
echo "  PostgreSQL      : ${PG_SERVER}.postgres.database.azure.com"
echo "  Redis           : ${REDIS_HOST}:6380"
echo "  Event Hubs NS   : ${EVHNS_NAME}.servicebus.windows.net"
echo "  ACR             : $ACR_SERVER"
echo ""
echo "  ⚡ Next step:"
echo "     cp .env.azure .env"
echo "     docker compose -f docker-compose.azure.yml up --build"
echo ""
echo "  🔒 Secret file .env.azure created — DO NOT commit it!"
echo ""
