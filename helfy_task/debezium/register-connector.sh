#!/bin/sh

set -eu # Exit on error and undefined variable

# Environment variables with defaults
: "${CONNECT_URL:=http://connect:8083}"
: "${CONNECTOR_NAME:=mysql-users-connector}"
TEMPLATE_FILE="/config/mysql-connector.json.template"
RENDERED_FILE="/tmp/mysql-connector.json"

# Render the connector configuration template with environment variables
eval "cat <<CONNECTOR_EOF
$(cat "$TEMPLATE_FILE")
CONNECTOR_EOF" > "$RENDERED_FILE"

# Register the connector with Kafka Connect
echo "Waiting for Kafka Connect REST API at ${CONNECT_URL}..."
until curl -sf "${CONNECT_URL}/connectors" >/dev/null; do
  sleep 2
done

# Check if the connector is already registered
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "${CONNECT_URL}/connectors/${CONNECTOR_NAME}")
if [ "$STATUS" = "200" ]; then
  echo "Connector '${CONNECTOR_NAME}' already registered, skipping."
  exit 0
fi

# Register the connector
echo "Registering connector '${CONNECTOR_NAME}'..."
curl -sf -X POST -H "Content-Type: application/json" \
  --data @"${RENDERED_FILE}" \
  "${CONNECT_URL}/connectors"

# Check if the registration was successful
echo
echo "Connector registered successfully."
