// Test de envío de webhook al bot
const WEBHOOK_URL = 'https://bot-wsp-whapi-ia-10-production.up.railway.app/hook';
const TEST_CHAT_ID = '573003913251@s.whatsapp.net';

async function testWebhook() {
  try {
    console.log('📤 Enviando webhook de prueba...');

    const payload = {
      messages: [
        {
          id: 'test-action-scheduler-001',
          from_me: false, // Como si el mensaje viniera del propio chat
          type: 'text',
          chat_id: TEST_CHAT_ID,
          timestamp: Math.floor(Date.now() / 1000),
          source: 'api',
          text: {
            body: '*Mensaje interno:* Procede a decirle a Alexander que se acercan sus vacaciones, ¿qué ha pensado al respecto?'
          },
          from: TEST_CHAT_ID.replace('@s.whatsapp.net', ''),
          from_name: 'Sistema CRM'
        }
      ],
      event: {
        type: 'messages',
        event: 'post'
      },
      channel_id: 'CRM-SCHEDULER'
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('✅ Webhook enviado exitosamente');
    console.log('📥 Respuesta:', data);
    console.log('📊 Status:', response.status);

  } catch (error) {
    console.error('❌ Error al enviar webhook:', error.message);
  }
}

testWebhook();
