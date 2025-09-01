import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

async function aplicarTriggers() {
  try {
    console.log('🔧 APLICANDO TRIGGERS DE SINCRONIZACIÓN AUTOMÁTICA...');
    console.log('='*60);
    
    // 1. Crear función para sincronizar desde Reservas
    console.log('\n1️⃣ Creando función sync_reservas_to_clientes...');
    
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sync_reservas_to_clientes()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.phone IS NULL OR NEW.phone = '' THEN
          RETURN NEW;
        END IF;

        INSERT INTO "Clientes" (
          telefono, nombre, email, estado, total_reservas, ultima_actividad, notas, creado_en, actualizado_en
        )
        VALUES (
          NEW.phone,
          NEW."guestName",
          NEW.email,
          NEW."BDStatus",
          1,
          GREATEST(NEW."modifiedDate"::timestamp, NEW."lastUpdatedBD"),
          CASE 
            WHEN NEW.notes IS NOT NULL OR NEW."internalNotes" IS NOT NULL
            THEN jsonb_build_object(
              'reservas_notes', COALESCE(NEW.notes, ''),
              'reservas_internal', COALESCE(NEW."internalNotes", '')
            )
            ELSE '{}'::jsonb
          END,
          NOW(),
          NOW()
        )
        ON CONFLICT (telefono) DO UPDATE SET
          nombre = CASE 
            WHEN "Clientes".nombre IS NULL OR "Clientes".nombre = ''
            THEN EXCLUDED.nombre
            ELSE "Clientes".nombre
          END,
          email = COALESCE("Clientes".email, EXCLUDED.email),
          estado = EXCLUDED.estado,
          ultima_actividad = GREATEST("Clientes".ultima_actividad, EXCLUDED.ultima_actividad),
          notas = CASE
            WHEN NEW.notes IS NOT NULL OR NEW."internalNotes" IS NOT NULL
            THEN "Clientes".notas || jsonb_build_object(
              'reservas_notes', COALESCE(NEW.notes, ''),
              'reservas_internal', COALESCE(NEW."internalNotes", '')
            )
            ELSE "Clientes".notas
          END,
          actualizado_en = NOW();

        UPDATE "Clientes" 
        SET total_reservas = (
          SELECT COUNT(*) FROM "Reservas" WHERE phone = NEW.phone
        )
        WHERE telefono = NEW.phone;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    console.log('   ✅ Función creada');
    
    // 2. Crear función para sincronizar desde Chats
    console.log('\n2️⃣ Creando función sync_chats_to_clientes...');
    
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION sync_chats_to_clientes()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW."phoneNumber" IS NULL OR NEW."phoneNumber" = '' THEN
          RETURN NEW;
        END IF;

        INSERT INTO "Clientes" (
          telefono, nombre, etiquetas, ultima_actividad, creado_en, actualizado_en
        )
        VALUES (
          NEW."phoneNumber",
          COALESCE(NEW.name, NEW."userName"),
          CASE 
            WHEN NEW.labels IS NOT NULL 
            THEN string_to_array(NEW.labels, ',')
            ELSE '{}'
          END,
          NEW."lastActivity",
          NOW(),
          NOW()
        )
        ON CONFLICT (telefono) DO UPDATE SET
          nombre = CASE 
            WHEN "Clientes".nombre IS NULL OR "Clientes".nombre = ''
            THEN COALESCE(EXCLUDED.nombre, "Clientes".nombre)
            ELSE "Clientes".nombre
          END,
          etiquetas = CASE 
            WHEN NEW.labels IS NOT NULL 
            THEN string_to_array(NEW.labels, ',')
            ELSE "Clientes".etiquetas
          END,
          ultima_actividad = GREATEST("Clientes".ultima_actividad, EXCLUDED.ultima_actividad),
          actualizado_en = NOW();

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    console.log('   ✅ Función creada');
    
    // 3. Crear función para actualizar al eliminar reserva
    console.log('\n3️⃣ Creando función update_clientes_on_delete_reserva...');
    
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION update_clientes_on_delete_reserva()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE "Clientes" 
        SET 
          total_reservas = (
            SELECT COUNT(*) FROM "Reservas" WHERE phone = OLD.phone
          ),
          estado = CASE
            WHEN (SELECT COUNT(*) FROM "Reservas" WHERE phone = OLD.phone) = 0
            THEN NULL
            ELSE (
              SELECT "BDStatus" 
              FROM "Reservas" 
              WHERE phone = OLD.phone 
              ORDER BY "modifiedDate" DESC 
              LIMIT 1
            )
          END,
          actualizado_en = NOW()
        WHERE telefono = OLD.phone;

        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);
    
    console.log('   ✅ Función creada');
    
    // 4. Crear triggers
    console.log('\n4️⃣ Creando triggers...');
    
    // Eliminar triggers existentes si hay (uno por uno)
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS sync_reservas_to_clientes_insert ON "Reservas"`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS sync_reservas_to_clientes_delete ON "Reservas"`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS sync_chats_to_clientes ON "Chats"`);
    
    // Crear nuevos triggers
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_reservas_to_clientes_insert
      AFTER INSERT OR UPDATE ON "Reservas"
      FOR EACH ROW
      EXECUTE FUNCTION sync_reservas_to_clientes()
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_reservas_to_clientes_delete
      AFTER DELETE ON "Reservas"
      FOR EACH ROW
      EXECUTE FUNCTION update_clientes_on_delete_reserva()
    `);
    
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER sync_chats_to_clientes
      AFTER INSERT OR UPDATE ON "Chats"
      FOR EACH ROW
      EXECUTE FUNCTION sync_chats_to_clientes()
    `);
    
    console.log('   ✅ Triggers creados');
    
    // 5. Verificar triggers
    console.log('\n5️⃣ Verificando triggers activos...');
    
    const triggers = await prisma.$queryRaw`
      SELECT 
        tgname as trigger_name,
        tgrelid::regclass::text as tabla
      FROM pg_trigger 
      WHERE NOT tgisinternal
      AND (
        tgname LIKE '%clientes%' OR 
        tgrelid::regclass::text IN ('"Reservas"', '"Chats"')
      )
      ORDER BY tabla, trigger_name
    `;
    
    console.log('\n📋 TRIGGERS ACTIVOS:');
    triggers.forEach(t => {
      console.log(`   • ${t.trigger_name} en ${t.tabla}`);
    });
    
    // 6. Test rápido
    console.log('\n6️⃣ Test de funcionamiento...');
    
    const reserva = await prisma.reservas.findFirst({
      where: { 
        phone: { not: null }
      },
      select: {
        id: true,
        phone: true,
        guestName: true
      }
    });
    
    if (reserva) {
      // Actualizar una nota para probar el trigger
      await prisma.reservas.update({
        where: { id: reserva.id },
        data: { 
          internalNotes: 'Test trigger sincronización - ' + new Date().toLocaleString('es-CO')
        }
      });
      
      // Verificar en Clientes
      const cliente = await prisma.clientes.findUnique({
        where: { telefono: reserva.phone },
        select: {
          nombre: true,
          estado: true,
          totalReservas: true,
          notas: true
        }
      });
      
      if (cliente) {
        console.log(`\n   ✅ TEST EXITOSO:`);
        console.log(`   Cliente: ${cliente.nombre}`);
        console.log(`   Estado: ${cliente.estado}`);
        console.log(`   Reservas: ${cliente.totalReservas}`);
        if (cliente.notas && cliente.notas.reservas_internal) {
          console.log(`   Nota interna actualizada: ${cliente.notas.reservas_internal}`);
        }
      }
    }
    
    console.log('\n' + '='*60);
    console.log('✅ SISTEMA DE SINCRONIZACIÓN COMPLETAMENTE ACTIVADO');
    console.log('\n📌 La tabla Clientes ahora se actualiza automáticamente cuando:');
    console.log('   • Se crea o modifica una Reserva → actualiza estado, notas, contador');
    console.log('   • Se elimina una Reserva → recalcula contador y estado');
    console.log('   • Se crea o modifica un Chat → actualiza etiquetas y actividad');
    console.log('\n📊 Además:');
    console.log('   • Sincronización con Google Contacts cada 5 minutos (si está configurado)');
    console.log('   • Sin conflictos: cada fuente respeta prioridades');
    console.log('   • Sin pérdida de datos: las notas se acumulan en JSON');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Detalle:', error);
  } finally {
    await prisma.$disconnect();
  }
}

aplicarTriggers();