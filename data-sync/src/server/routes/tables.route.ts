import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../infra/db/prisma.client.js';

const VALID_TABLES = ['ClientView', 'Booking', 'Leads', 'hotel_apartments', 'IA_CMR_Clientes'] as const;
type ValidTable = typeof VALID_TABLES[number];

// Mapeo de nombres API → nombres modelo Prisma (camelCase)
const TABLE_TO_PRISMA_MODEL: Record<ValidTable, string> = {
  'ClientView': 'clientView',
  'Booking': 'booking', 
  'Leads': 'leads',  // Plural (como en schema)
  'hotel_apartments': 'hotel_apartments',
  'IA_CMR_Clientes': 'iA_CMR_Clientes'
};

function isValidTable(table: string): table is ValidTable {
  return VALID_TABLES.includes(table as ValidTable);
}

export function registerTablesRoute(router: Router): void {
  
  // GET /api/tables/:tableName - Lista registros con filtros
  router.get('/tables/:tableName', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName } = req.params;
      const { limit = '50', offset = '0', ...filters } = req.query;
      
      if (!isValidTable(tableName)) {
        res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
        return;
      }
      
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = parseInt(offset as string) || 0;
      
      logger.debug({ tableName, filters, limit: limitNum, offset: offsetNum }, 'Fetching table data');
      
      const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
      const model = (prisma as any)[prismaModelName];
      const where = Object.keys(filters).length > 0 ? filters : undefined;
      
      // Configurar ordenación según la tabla
      let orderBy: any = { id: 'desc' }; // Default para Booking, Leads, hotel_apartments
      if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
        orderBy = { phoneNumber: 'asc' }; // phoneNumber es string, mejor asc
      }
      
      const [data, total] = await Promise.all([
        model.findMany({
          where,
          take: limitNum,
          skip: offsetNum,
          orderBy
        }),
        model.count({ where })
      ]);
      
      res.json({
        data,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < total
        }
      });
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName }, 'Failed to fetch table data');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/tables/:tableName/:id - Obtener registro por ID
  router.get('/tables/:tableName/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName, id } = req.params;
      
      if (!isValidTable(tableName)) {
        res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
        return;
      }
      
      logger.debug({ tableName, id }, 'Fetching record by ID');
      
      const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
      const model = (prisma as any)[prismaModelName];
      
      // Construir where clause según la tabla
      let whereClause: any;
      if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
        whereClause = { phoneNumber: id }; // phoneNumber es string
      } else {
        whereClause = { id: parseInt(id) }; // id es number para otras tablas
      }
      
      const data = await model.findUnique({
        where: whereClause
      });
      
      if (!data) {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      
      res.json(data);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to fetch record');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/tables/:tableName - Crear nuevo registro
  router.post('/tables/:tableName', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName } = req.params;
      const data = req.body;
      
      if (!isValidTable(tableName)) {
        res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
        return;
      }
      
      if (!data || Object.keys(data).length === 0) {
        res.status(400).json({ error: 'Request body cannot be empty' });
        return;
      }
      
      logger.debug({ tableName, data }, 'Creating new record');
      
      const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
      const model = (prisma as any)[prismaModelName];
      const created = await model.create({ data });
      
      res.status(201).json(created);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName }, 'Failed to create record');
      
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'Record with this key already exists' });
        return;
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/tables/:tableName/:id - Actualizar registro
  router.patch('/tables/:tableName/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName, id } = req.params;
      const data = req.body;
      
      if (!isValidTable(tableName)) {
        res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
        return;
      }
      
      if (!data || Object.keys(data).length === 0) {
        res.status(400).json({ error: 'Request body cannot be empty' });
        return;
      }
      
      logger.debug({ tableName, id, data }, 'Updating record');
      
      const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
      const model = (prisma as any)[prismaModelName];
      
      // Construir where clause según la tabla
      let whereClause: any;
      if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
        whereClause = { phoneNumber: id }; // phoneNumber es string
      } else {
        whereClause = { id: parseInt(id) }; // id es number para otras tablas
      }
      
      const updated = await model.update({
        where: whereClause,
        data
      });
      
      res.json(updated);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to update record');
      
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/tables/:tableName/:id - Eliminar registro (CON PROTECCIÓN)
  router.delete('/tables/:tableName/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { tableName, id } = req.params;
      
      if (!isValidTable(tableName)) {
        res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
        return;
      }
      
      // PROTECCIÓN: Solo permitir DELETE en desarrollo
      if (process.env.NODE_ENV === 'production') {
        logger.warn({ tableName, id, action: 'DELETE_BLOCKED' }, '🚫 DELETE blocked in production');
        res.status(403).json({ 
          error: 'DELETE operations are disabled in production for safety',
          suggestion: 'Use PATCH to update status instead of deleting'
        });
        return;
      }
      
      logger.warn({ tableName, id, action: 'DELETE_ATTEMPT' }, '⚠️ DELETE record attempt');
      
      const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
      const model = (prisma as any)[prismaModelName];
      
      // Construir where clause según la tabla
      let whereClause: any;
      if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
        whereClause = { phoneNumber: id }; // phoneNumber es string
      } else {
        whereClause = { id: parseInt(id) }; // id es number para otras tablas
      }
      
      // Verificar que el registro existe antes de eliminarlo
      const existing = await model.findUnique({
        where: whereClause
      });
      
      if (!existing) {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      
      await model.delete({
        where: whereClause
      });
      
      logger.warn({ tableName, id, deletedRecord: existing, action: 'DELETE_SUCCESS' }, '🗑️ Record deleted successfully');
      
      res.json({ deleted: true, id, deletedRecord: existing });
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to delete record');
      
      if (error.code === 'P2025') {
        res.status(404).json({ error: 'Record not found' });
        return;
      }
      
      if (error.code === 'P2003') {
        res.status(409).json({ error: 'Cannot delete record with foreign key references' });
        return;
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}