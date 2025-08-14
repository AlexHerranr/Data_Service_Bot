# Migration Scripts - Beds24 Sync Service

Scripts para migración y optimización de base de datos.

## Scripts Disponibles

### Core Migrations
- `improve-leads-structure.ts` - Mejora estructura Leads para múltiples fuentes
- `optimize-leads-table.ts` - Optimización y limpieza de tabla Leads  
- `setup-leads-sync-trigger.ts` - Configuración de triggers automáticos
- `migrate-booking-table.ts` - Migración principal de tabla Booking

### Uso
```bash
npx tsx migration-scripts/script-name.ts
```

Estos scripts son seguros de ejecutar múltiples veces (incluyen verificaciones IF EXISTS).