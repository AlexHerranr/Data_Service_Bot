# 📱 Google Contacts Sync - Configuración

## 🚀 Configuración Inicial

### Paso 1: Obtener las credenciales de Google

1. **Ve a Google Cloud Console**: https://console.cloud.google.com

2. **Selecciona tu proyecto** (o crea uno nuevo)

3. **Habilita la API** (si no lo has hecho):
   - Ve a "APIs y servicios" > "Biblioteca"
   - Busca "People API"
   - Click en "HABILITAR"

4. **Configura la pantalla de consentimiento OAuth**:
   - Ve a "APIs y servicios" > "Pantalla de consentimiento OAuth"
   - Selecciona "Externo" (a menos que tengas Google Workspace)
   - Completa los campos obligatorios:
     - Nombre de la aplicación: "Sync Contactos"
     - Email de soporte: tu email
     - Emails de desarrollador: tu email
   - En "Ámbitos", agrega: `../auth/contacts`
   - Agrega tu email como usuario de prueba

5. **Crea las credenciales OAuth 2.0**:
   - Ve a "APIs y servicios" > "Credenciales"
   - Click en "+ CREAR CREDENCIALES"
   - Selecciona "ID de cliente de OAuth"
   - Tipo de aplicación: **"Aplicación de escritorio"**
   - Nombre: "Sync Desktop Client"
   - Click en "CREAR"

6. **Descarga el archivo JSON**:
   - En la lista de credenciales, busca el cliente que acabas de crear
   - Click en el ícono de descarga (⬇️)
   - Guarda el archivo como: `/workspace/google-contacts/credentials.json`

### Paso 2: Configurar la autenticación

```bash
cd /workspace/google-contacts

# Ejecutar el setup
npm run setup
```

Esto te mostrará:
1. Una URL para autorizar la aplicación
2. Abre la URL en tu navegador
3. Inicia sesión con tu cuenta de Google
4. Acepta los permisos
5. Copia el código que aparece
6. Pégalo en la terminal

### Paso 3: Verificar la conexión

```bash
npm run test
```

Esto mostrará:
- Total de contactos en tu cuenta
- Estadísticas de contactos
- Grupos existentes

## 📝 Archivos Importantes

| Archivo | Descripción |
|---------|-------------|
| `credentials.json` | Credenciales OAuth de Google (DESCARGAR DE GOOGLE CLOUD) |
| `token.json` | Token de acceso (se genera automáticamente) |
| `setup-google-auth.js` | Script de configuración inicial |
| `test-connection.js` | Script de prueba de conexión |

## 🔐 Seguridad

⚠️ **IMPORTANTE**: 
- NO subas `credentials.json` ni `token.json` a GitHub
- Estos archivos contienen información sensible
- Ya están en `.gitignore`

## 🎯 Próximos Pasos

Una vez configurado, podrás:
1. **Importar contactos** desde tu BD a Google
2. **Sincronizar cambios** automáticamente
3. **Crear grupos** según el estado del cliente (VIP, Leads, etc.)
4. **Actualizar notas** según el estado de las reservas

## 🆘 Troubleshooting

### Error: "invalid_grant"
El token expiró. Ejecuta nuevamente:
```bash
npm run setup
```

### Error: "Quota exceeded"
Has superado el límite de la API. Espera o solicita más cuota en Google Cloud Console.

### No aparece credentials.json
Asegúrate de:
1. Descargar el archivo correcto (OAuth 2.0 Client ID)
2. Guardarlo en `/workspace/google-contacts/`
3. Nombrarlo exactamente `credentials.json`

## 📊 Límites de la API

- **Lectura**: 1000 solicitudes por minuto
- **Escritura**: 60 solicitudes por minuto
- **Total diario**: 1,000,000 solicitudes

Para 6,048 contactos, la sincronización inicial tomará ~10 minutos.