#!/usr/bin/env node
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function quickTest() {
  console.log('🔍 PRUEBA RÁPIDA DE CONEXIÓN');
  console.log('='*60);
  
  // Verificar archivos necesarios
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('❌ Falta credentials.json');
    console.log('\n📝 SIGUIENTE PASO:');
    console.log('1. Ve a https://console.cloud.google.com/apis/credentials');
    console.log('2. Crea un ID de cliente OAuth 2.0 (tipo: Aplicación de escritorio)');
    console.log('3. Descarga el JSON');
    console.log('4. Guárdalo como: /workspace/google-contacts/credentials.json');
    return;
  }
  
  if (!fs.existsSync(TOKEN_PATH)) {
    console.log('⚠️  No hay token de autenticación');
    console.log('Ejecuta primero: npm run setup');
    return;
  }
  
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    auth.setCredentials(token);
    
    const service = google.people({ version: 'v1', auth });
    
    // Obtener estadísticas
    console.log('📊 Obteniendo estadísticas de contactos...\n');
    
    const res = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1000,
      personFields: 'names,phoneNumbers,emailAddresses,memberships',
    });
    
    const contacts = res.data.connections || [];
    
    // Analizar contactos
    let withPhone = 0;
    let withEmail = 0;
    let withBoth = 0;
    let withName = 0;
    
    contacts.forEach(person => {
      const hasPhone = person.phoneNumbers && person.phoneNumbers.length > 0;
      const hasEmail = person.emailAddresses && person.emailAddresses.length > 0;
      const hasName = person.names && person.names.length > 0;
      
      if (hasPhone) withPhone++;
      if (hasEmail) withEmail++;
      if (hasPhone && hasEmail) withBoth++;
      if (hasName) withName++;
    });
    
    console.log('✅ CONEXIÓN EXITOSA\n');
    console.log('📈 ESTADÍSTICAS:');
    console.log(`   Total contactos:        ${contacts.length}`);
    console.log(`   Con nombre:             ${withName}`);
    console.log(`   Con teléfono:           ${withPhone}`);
    console.log(`   Con email:              ${withEmail}`);
    console.log(`   Con teléfono y email:   ${withBoth}`);
    
    // Listar grupos de contactos
    console.log('\n📁 GRUPOS DE CONTACTOS:');
    const groups = await service.contactGroups.list();
    
    groups.data.contactGroups?.forEach(group => {
      if (group.name && !group.name.startsWith('System Group')) {
        console.log(`   • ${group.name} (${group.memberCount || 0} contactos)`);
      }
    });
    
    console.log('\n✅ La API está lista para usar!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\n⚠️  El token expiró. Ejecuta: npm run setup');
    }
  }
}

quickTest();