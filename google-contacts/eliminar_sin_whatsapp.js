#!/usr/bin/env node
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function eliminarContactosSinWhatsApp() {
  console.log('🗑️ ELIMINACIÓN DE CONTACTOS SIN WHATSAPP DE GOOGLE');
  console.log('='*60);
  
  try {
    // Configurar autenticación
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    auth.setCredentials(token);
    
    const service = google.people({ version: 'v1', auth });
    
    // Leer números inválidos
    const contactosEliminados = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../CONTACTOS_ELIMINADOS_SIN_WHATSAPP.json'))
    );
    
    const numerosInvalidos = new Set(
      contactosEliminados.map(c => c.telefono.replace('+', ''))
    );
    
    console.log(`📊 Números a buscar y eliminar: ${numerosInvalidos.size}`);
    
    // Obtener todos los contactos de Google (paginado)
    console.log('\n🔍 Obteniendo contactos de Google...');
    let allContacts = [];
    let nextPageToken = null;
    let pageCount = 0;
    
    do {
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        pageToken: nextPageToken,
        personFields: 'names,phoneNumbers,metadata'
      });
      
      if (response.data.connections) {
        allContacts = allContacts.concat(response.data.connections);
      }
      
      nextPageToken = response.data.nextPageToken;
      pageCount++;
      console.log(`   Página ${pageCount}: ${response.data.connections?.length || 0} contactos`);
      
    } while (nextPageToken);
    
    console.log(`✅ Total contactos en Google: ${allContacts.length}`);
    
    // Identificar contactos a eliminar
    console.log('\n🔍 Identificando contactos sin WhatsApp...');
    const contactosAEliminar = [];
    
    for (const contact of allContacts) {
      if (contact.phoneNumbers) {
        for (const phone of contact.phoneNumbers) {
          const numero = phone.value.replace(/[^0-9]/g, ''); // Limpiar número
          
          if (numerosInvalidos.has(numero)) {
            contactosAEliminar.push({
              resourceName: contact.resourceName,
              name: contact.names?.[0]?.displayName || 'Sin nombre',
              phone: phone.value
            });
            break; // No revisar más números de este contacto
          }
        }
      }
    }
    
    console.log(`\n❌ Contactos a eliminar: ${contactosAEliminar.length}`);
    
    if (contactosAEliminar.length > 0) {
      console.log('\n🗑️ Eliminando contactos...');
      
      // Mostrar primeros 10 como ejemplo
      console.log('\nEjemplos de contactos a eliminar:');
      contactosAEliminar.slice(0, 10).forEach((c, i) => {
        console.log(`   ${i+1}. ${c.name} - ${c.phone}`);
      });
      
      // Eliminar en lotes para evitar límites de API
      const batchSize = 50;
      let eliminados = 0;
      let errores = 0;
      
      for (let i = 0; i < contactosAEliminar.length; i += batchSize) {
        const batch = contactosAEliminar.slice(i, i + batchSize);
        
        // Crear batch request
        const batchDeleteRequest = {
          requests: batch.map(contact => ({
            method: 'DELETE',
            resourceName: contact.resourceName
          }))
        };
        
        try {
          // Google People API no tiene batch delete directo, eliminar uno por uno
          for (const contact of batch) {
            try {
              await service.people.deleteContact({
                resourceName: contact.resourceName
              });
              eliminados++;
              
              if (eliminados % 100 === 0) {
                console.log(`   ✅ Eliminados: ${eliminados}/${contactosAEliminar.length}`);
              }
            } catch (err) {
              console.error(`   ❌ Error eliminando ${contact.name}: ${err.message}`);
              errores++;
            }
          }
          
          // Pausa para evitar límites de rate
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`   ❌ Error en lote: ${error.message}`);
          errores += batch.length;
        }
      }
      
      console.log(`\n✅ Eliminación completada:`);
      console.log(`   Eliminados: ${eliminados}`);
      console.log(`   Errores: ${errores}`);
    }
    
    // Verificación final
    console.log('\n📊 VERIFICACIÓN FINAL:');
    const finalResponse = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1,
      personFields: 'names'
    });
    
    console.log(`   Total contactos restantes: ${finalResponse.data.totalPeople || 'N/A'}`);
    console.log(`   Contactos eliminados: ${contactosAEliminar.length}`);
    
    // Crear o actualizar grupo "WhatsApp Válidos"
    console.log('\n📁 Creando grupo "WhatsApp Válidos"...');
    const groupsResponse = await service.contactGroups.list();
    let whatsappGroup = groupsResponse.data.contactGroups?.find(
      g => g.name === 'WhatsApp Válidos'
    );
    
    if (!whatsappGroup) {
      const createGroupResponse = await service.contactGroups.create({
        requestBody: {
          contactGroup: {
            name: 'WhatsApp Válidos'
          }
        }
      });
      whatsappGroup = createGroupResponse.data;
      console.log('   ✅ Grupo creado');
    } else {
      console.log('   ✅ Grupo ya existe');
    }
    
    console.log('\n✅ PROCESO COMPLETADO');
    console.log('Los contactos sin WhatsApp han sido eliminados de Google Contacts');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('⚠️  El token expiró. Ejecuta: npm run setup');
    }
  }
}

// Ejecutar
eliminarContactosSinWhatsApp();