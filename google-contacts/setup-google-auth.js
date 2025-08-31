#!/usr/bin/env node
import { google } from 'googleapis';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de OAuth2
const SCOPES = ['https://www.googleapis.com/auth/contacts'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

/**
 * Crea un cliente OAuth2 con las credenciales dadas
 */
async function authorize() {
  // Verificar si existe el archivo de credenciales
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('❌ No se encontró el archivo credentials.json');
    console.log('\n📝 INSTRUCCIONES:');
    console.log('1. Ve a https://console.cloud.google.com');
    console.log('2. Selecciona tu proyecto');
    console.log('3. Ve a "APIs y servicios" > "Credenciales"');
    console.log('4. Crea credenciales > ID de cliente OAuth 2.0');
    console.log('5. Tipo de aplicación: "Aplicación de escritorio"');
    console.log('6. Descarga el JSON y guárdalo como: /workspace/google-contacts/credentials.json');
    return null;
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Verificar si ya tenemos un token guardado
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    console.log('✅ Token existente cargado');
    return oAuth2Client;
  }

  // Si no hay token, obtener uno nuevo
  return await getNewToken(oAuth2Client);
}

/**
 * Obtiene un nuevo token después de prompting para autorización del usuario
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  
  console.log('🔐 Autoriza esta aplicación visitando esta URL:');
  console.log(authUrl);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve, reject) => {
    rl.question('\n📝 Ingresa el código de la página aquí: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error('❌ Error obteniendo el token:', err);
          reject(err);
          return;
        }
        oAuth2Client.setCredentials(token);
        // Guardar el token para futuros usos
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('✅ Token guardado en:', TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
}

/**
 * Prueba la conexión listando los primeros 10 contactos
 */
async function testConnection(auth) {
  const service = google.people({ version: 'v1', auth });
  
  try {
    console.log('\n🔍 Probando conexión con Google People API...\n');
    
    // Listar contactos
    const res = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 10,
      personFields: 'names,emailAddresses,phoneNumbers',
    });
    
    const connections = res.data.connections || [];
    
    if (connections.length === 0) {
      console.log('📭 No se encontraron contactos en tu cuenta de Google');
    } else {
      console.log(`✅ Conexión exitosa! Se encontraron ${res.data.totalPeople || connections.length} contactos totales\n`);
      console.log('📋 Primeros contactos:');
      console.log('='*60);
      
      connections.forEach((person, index) => {
        const name = person.names?.[0]?.displayName || 'Sin nombre';
        const phone = person.phoneNumbers?.[0]?.value || 'Sin teléfono';
        const email = person.emailAddresses?.[0]?.value || 'Sin email';
        
        console.log(`${index + 1}. ${name}`);
        console.log(`   📱 ${phone}`);
        console.log(`   📧 ${email}`);
        console.log('-'*60);
      });
    }
    
    // Obtener información de la cuenta
    const account = await service.people.get({
      resourceName: 'people/me',
      personFields: 'names,emailAddresses',
    });
    
    console.log('\n👤 Cuenta conectada:');
    console.log(`   Nombre: ${account.data.names?.[0]?.displayName || 'N/A'}`);
    console.log(`   Email: ${account.data.emailAddresses?.[0]?.value || 'N/A'}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error al conectar con Google People API:', error.message);
    return false;
  }
}

// Ejecutar
async function main() {
  console.log('🚀 CONFIGURACIÓN DE GOOGLE PEOPLE API');
  console.log('='*60);
  
  const auth = await authorize();
  if (auth) {
    await testConnection(auth);
    
    console.log('\n✅ CONFIGURACIÓN COMPLETA');
    console.log('Ahora puedes usar la API de Google People con tu aplicación');
  }
}

main().catch(console.error);