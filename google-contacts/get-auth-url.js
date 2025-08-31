#!/usr/bin/env node
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCOPES = ['https://www.googleapis.com/auth/contacts'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// Leer credenciales
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;

// Crear cliente OAuth2
const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
);

// Generar URL de autorización
const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
});

console.log('🔐 AUTORIZACIÓN DE GOOGLE CONTACTS');
console.log('='*60);
console.log('\n📋 PASO 1: Abre esta URL en tu navegador:\n');
console.log(authUrl);
console.log('\n📋 PASO 2: Autoriza la aplicación con tu cuenta de Google');
console.log('\n📋 PASO 3: Copia el código de autorización que aparece');
console.log('\n📋 PASO 4: Ejecuta este comando con tu código:');
console.log('\n   node save-token.js "TU_CODIGO_AQUI"');
console.log('\n='*60);