// Test simple de acción programada
const WEBHOOK_URL = 'https://bot-wsp-whapi-ia-10-production.up.railway.app/hook';
const TEST_CHAT_ID = '573003913251@s.whatsapp.net';

async function testScheduledAction() {
  try {
    console.log('📤 Enviando webhook de acción programada...');

    // Generar ID único para evitar duplicados
    const uniqueId = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const payload = {
      messages: [
        {
          id: uniqueId,
          from_me: false,
          type: 'text',
          chat_id: TEST_CHAT_ID,
          timestamp: Math.floor(Date.now() / 1000),
          source: 'crm-scheduler',
          text: {
            body: 'Instrucciones internas: Este cliente se llama Alexander, estuvo consultando sobre sus vacaciones próximas. Pregúntale cómo van sus planes y si necesita ayuda con algo.'
          },
          from: TEST_CHAT_ID.replace('@s.whatsapp.net', ''),
          from_name: 'Alexander'
        }
      ],
      event: {
        type: 'messages',
        event: 'post'
      }
    };

    console.log('📦 Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('✅ Webhook enviado');
    console.log('📥 Respuesta:', data);
    console.log('📊 Status:', response.status);
    console.log('\n⏳ Ahora espera el mensaje de WhatsApp en tu número...');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testScheduledAction();
