#!/bin/bash

# Script para probar el manejo de mensajes en webhooks
# Simula diferentes escenarios de mensajes

WEBHOOK_URL="http://localhost:8080/webhooks/beds24"
BEDS24_TOKEN="your_beds24_webhook_token" # Reemplaza con tu token real

echo "🧪 PRUEBAS DE MANEJO DE MENSAJES"
echo "================================="
echo ""

# --- Prueba 1: Crear reserva nueva con mensajes iniciales ---
echo "📝 Prueba 1: CREAR reserva con mensajes iniciales"
echo "-------------------------------------------------"
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Token: $BEDS24_TOKEN" \
  -d '{
    "action": "created",
    "bookingId": 888001,
    "booking": {
      "id": 888001,
      "status": "new",
      "arrival": "2025-10-01",
      "departure": "2025-10-05",
      "firstName": "Test",
      "lastName": "Messages",
      "price": 500000
    },
    "messages": [
      {
        "id": 1001,
        "message": "Hola, quisiera confirmar mi reserva",
        "time": "2025-08-27T10:00:00Z",
        "source": "guest",
        "read": false
      },
      {
        "id": 1002,
        "message": "Su reserva está confirmada. Gracias!",
        "time": "2025-08-27T10:30:00Z",
        "source": "host",
        "read": true
      }
    ]
  }'
echo -e "\n✅ Reserva creada con 2 mensajes iniciales\n"
sleep 2

# --- Prueba 2: Agregar mensaje nuevo (simula mensaje del huésped) ---
echo "📝 Prueba 2: MODIFY con mensaje nuevo del huésped"
echo "-------------------------------------------------"
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Token: $BEDS24_TOKEN" \
  -d '{
    "action": "modified",
    "bookingId": 888001,
    "booking": {
      "id": 888001,
      "status": "confirmed",
      "arrival": "2025-10-01",
      "departure": "2025-10-05",
      "firstName": "Test",
      "lastName": "Messages",
      "price": 500000
    },
    "messages": [
      {
        "id": 1003,
        "message": "A qué hora puedo hacer el check-in?",
        "time": "2025-08-27T14:00:00Z",
        "source": "guest",
        "read": false
      }
    ]
  }'
echo -e "\n✅ Mensaje nuevo agregado (debería procesarse INMEDIATAMENTE)\n"
sleep 2

# --- Prueba 3: Modificación de datos sin mensajes (delay 3 min) ---
echo "📝 Prueba 3: MODIFY sin mensajes (cambio de precio)"
echo "-------------------------------------------------"
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Token: $BEDS24_TOKEN" \
  -d '{
    "action": "modified",
    "bookingId": 888001,
    "booking": {
      "id": 888001,
      "status": "confirmed",
      "arrival": "2025-10-01",
      "departure": "2025-10-05",
      "firstName": "Test",
      "lastName": "Messages",
      "price": 550000,
      "notes": "Cliente VIP - Descuento aplicado"
    },
    "messages": []
  }'
echo -e "\n⏰ Modificación SIN mensajes (se procesará con DELAY de 3 minutos)\n"
sleep 2

# --- Prueba 4: Múltiples mensajes nuevos ---
echo "📝 Prueba 4: MODIFY con múltiples mensajes nuevos"
echo "-------------------------------------------------"
curl -X POST $WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -H "X-Beds24-Token: $BEDS24_TOKEN" \
  -d '{
    "action": "modified",
    "bookingId": 888001,
    "booking": {
      "id": 888001,
      "status": "confirmed",
      "arrival": "2025-10-01",
      "departure": "2025-10-05",
      "firstName": "Test",
      "lastName": "Messages",
      "price": 550000
    },
    "messages": [
      {
        "id": 1004,
        "message": "El check-in es desde las 3 PM",
        "time": "2025-08-27T15:00:00Z",
        "source": "host",
        "read": false
      },
      {
        "id": 1005,
        "message": "Perfecto, llegaré a las 4 PM",
        "time": "2025-08-27T15:30:00Z",
        "source": "guest",
        "read": false
      },
      {
        "id": 1006,
        "message": "Necesitan algo especial para su llegada?",
        "time": "2025-08-27T16:00:00Z",
        "source": "host",
        "read": false
      }
    ]
  }'
echo -e "\n✅ Múltiples mensajes agregados (procesamiento INMEDIATO)\n"

echo ""
echo "================================="
echo "📊 RESUMEN DE PRUEBAS:"
echo "================================="
echo "1. ✅ Reserva 888001 creada con 2 mensajes iniciales"
echo "2. ✅ 1 mensaje nuevo agregado (procesamiento inmediato)"
echo "3. ⏰ Modificación de precio sin mensajes (delay 3 min)"
echo "4. ✅ 3 mensajes nuevos agregados (procesamiento inmediato)"
echo ""
echo "📌 RESULTADO ESPERADO EN BD:"
echo "   - La reserva 888001 debería tener 6 mensajes en total"
echo "   - Los mensajes antiguos deben preservarse"
echo "   - Los nuevos mensajes deben agregarse sin duplicar"
echo ""
echo "🔍 Para verificar en la BD, ejecuta:"
echo "   node -e \"const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.booking.findUnique({where:{bookingId:'888001'},select:{messages:true}}).then(r => console.log(JSON.stringify(r?.messages, null, 2))).then(() => p.\$disconnect())\""
echo ""