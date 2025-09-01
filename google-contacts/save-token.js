#!/usr/bin/env node
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Obtener el código de los argumentos
const code = process.argv[2];

if (!code) {
    console.log('❌ Error: Debes proporcionar el código de autorización');
    console.log('Uso: node save-token.js "CODIGO_AQUI"');
    process.exit(1);
}

// Leer credenciales
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;

// Crear cliente OAuth2
const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
);

// Obtener token con el código
oAuth2Client.getToken(code, (err, token) => {
    if (err) {
        console.error('❌ Error obteniendo el token:', err.message);
        console.log('\nPosibles causas:');
        console.log('1. El código expiró (genera uno nuevo)');
        console.log('2. El código ya fue usado');
        console.log('3. El código no es válido');
        return;
    }
    
    // Guardar el token
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log('✅ Token guardado exitosamente en:', TOKEN_PATH);
    console.log('\n🎉 ¡Configuración completa!');
    console.log('Ahora puedes ejecutar: npm run test');
});