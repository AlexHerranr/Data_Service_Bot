import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../infra/db/prisma.client.js';

const VALID_TABLES = ['ClientView', 'Booking', 'Leads', 'hotel_apartments'] as const;
type ValidTable = typeof VALID_TABLES[number];

function isValidTable(table: string): table is ValidTable {
  return VALID_TABLES.includes(table as ValidTable);
}

export function registerTablesRoute(router: Router): void {
  
  // GET /api/tables/:tableName - Lista registros con filtros
  router.get('/tables/:tableName', async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      const { limit = '50', offset = '0', ...filters } = req.query;
      
      if (!isValidTable(tableName)) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
      }
      
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = parseInt(offset as string) || 0;
      
      logger.debug({ tableName, filters, limit: limitNum, offset: offsetNum }, 'Fetching table data');
      
      const model = (prisma as any)[tableName];
      const where = Object.keys(filters).length > 0 ? filters : undefined;
      
      // Determinar el campo de ordenación según la tabla
      const orderByField = tableName === 'ClientView' ? 'phoneNumber' : 'id';
      
      const [data, total] = await Promise.all([
        model.findMany({
          where,
          take: limitNum,
          skip: offsetNum,
          orderBy: { [orderByField]: 'desc' }
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
  router.get('/tables/:tableName/:id', async (req: Request, res: Response) => {
    try {
      const { tableName, id } = req.params;
      
      if (!isValidTable(tableName)) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
      }
      
      logger.debug({ tableName, id }, 'Fetching record by ID');
      
      const model = (prisma as any)[tableName];
      const data = await model.findUnique({
        where: { id: tableName === 'ClientView' ? id : parseInt(id) }
      });
      
      if (!data) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      res.json(data);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to fetch record');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/tables/:tableName - Crear nuevo registro
  router.post('/tables/:tableName', async (req: Request, res: Response) => {
    try {
      const { tableName } = req.params;
      const data = req.body;
      
      if (!isValidTable(tableName)) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
      }
      
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Request body cannot be empty' });
      }
      
      logger.debug({ tableName, data }, 'Creating new record');
      
      const model = (prisma as any)[tableName];
      const created = await model.create({ data });
      
      res.status(201).json(created);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName }, 'Failed to create record');
      
      if (error.code === 'P2002') {
        return res.status(409).json({ error: 'Record with this key already exists' });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/tables/:tableName/:id - Actualizar registro
  router.patch('/tables/:tableName/:id', async (req: Request, res: Response) => {
    try {
      const { tableName, id } = req.params;
      const data = req.body;
      
      if (!isValidTable(tableName)) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
      }
      
      if (!data || Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Request body cannot be empty' });
      }
      
      logger.debug({ tableName, id, data }, 'Updating record');
      
      const model = (prisma as any)[tableName];
      const updated = await model.update({
        where: { id: tableName === 'ClientView' ? id : parseInt(id) },
        data
      });
      
      res.json(updated);
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to update record');
      
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/tables/:tableName/:id - Eliminar registro (CON PROTECCIÓN)
  router.delete('/tables/:tableName/:id', async (req: Request, res: Response) => {
    try {
      const { tableName, id } = req.params;
      
      if (!isValidTable(tableName)) {
        return res.status(400).json({ 
          error: 'Invalid table name',
          validTables: VALID_TABLES 
        });
      }
      
      // PROTECCIÓN: Solo permitir DELETE en desarrollo
      if (process.env.NODE_ENV === 'production') {
        logger.warn({ tableName, id, action: 'DELETE_BLOCKED' }, '🚫 DELETE blocked in production');
        return res.status(403).json({ 
          error: 'DELETE operations are disabled in production for safety',
          suggestion: 'Use PATCH to update status instead of deleting'
        });
      }
      
      logger.warn({ tableName, id, action: 'DELETE_ATTEMPT' }, '⚠️ DELETE record attempt');
      
      const model = (prisma as any)[tableName];
      
      // Verificar que el registro existe antes de eliminarlo
      const existing = await model.findUnique({
        where: { id: tableName === 'ClientView' ? id : parseInt(id) }
      });
      
      if (!existing) {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      await model.delete({
        where: { id: tableName === 'ClientView' ? id : parseInt(id) }
      });
      
      logger.warn({ tableName, id, deletedRecord: existing, action: 'DELETE_SUCCESS' }, '🗑️ Record deleted successfully');
      
      res.json({ deleted: true, id, deletedRecord: existing });
      
    } catch (error: any) {
      logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to delete record');
      
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
      }
      
      if (error.code === 'P2003') {
        return res.status(409).json({ error: 'Cannot delete record with foreign key references' });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}