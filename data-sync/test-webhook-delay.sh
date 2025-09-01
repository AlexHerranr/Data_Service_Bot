#!/bin/bash

echo "=== TEST DE DELAY EN WEBHOOKS DE BEDS24 ==="
echo ""

# URL del servidor (ajustar según tu configuración)
BASE_URL="http://localhost:8080"

# Función para enviar webhook
send_webhook() {
    local action=$1
    local booking_id=$2
    local description=$3
    
    echo "📨 Enviando webhook: $description"
    echo "   Action: $action"
    echo "   Booking ID: $booking_id"
    echo "   Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
    
    curl -X POST "$BASE_URL/webhooks/beds24" \
        -H "Content-Type: application/json" \
        -H "x-beds24-token: ${BEDS24_WEBHOOK_TOKEN:-test-token}" \
        -d "{
            \"action\": \"$action\",
            \"id\": $booking_id,
            \"booking\": {
                \"id\": $booking_id,
                \"firstName\": \"Test\",
                \"lastName\": \"User\",
                \"arrival\": \"2025-09-01\",
                \"departure\": \"2025-09-05\",
                \"price\": 500000,
                \"status\": \"confirmed\"
            }
        }" \
        -w "\n   Response: %{http_code}\n"
    
    echo ""
}

echo "🧪 TEST 1: Nueva reserva (CREATED) - debe procesarse inmediatamente"
send_webhook "created" "99999001" "Nueva reserva - procesamiento inmediato"
sleep 2

echo "🧪 TEST 2: Modificación de reserva (MODIFY) - debe esperar 3 minutos"
send_webhook "modified" "99999002" "Modificación - delay de 3 minutos"
sleep 2

echo "🧪 TEST 3: Cancelación de reserva (CANCEL) - debe procesarse inmediatamente"
send_webhook "cancelled" "99999003" "Cancelación - procesamiento inmediato"
sleep 2

echo "🧪 TEST 4: Múltiples modificaciones de la misma reserva"
send_webhook "modified" "99999004" "Primera modificación"
sleep 5
send_webhook "modified" "99999004" "Segunda modificación (debe cancelar la primera)"
sleep 5
send_webhook "modified" "99999004" "Tercera modificación (debe cancelar la segunda)"

echo ""
echo "✅ Webhooks enviados. Revisa los logs para verificar:"
echo "   1. CREATED y CANCEL se procesan inmediatamente"
echo "   2. MODIFY se programa para 3 minutos después"
echo "   3. Múltiples MODIFY de la misma reserva cancelan el anterior"
echo ""
echo "📋 Para ver los logs en tiempo real:"
echo "   docker logs -f data-sync-app-1 2>&1 | grep -E 'webhook|STEP|MODIFY|CREATED|CANCEL|delay'"