import { logger } from '../../utils/logger.js';
import { prisma } from '../../infra/db/prisma.client.js';
const VALID_TABLES = ['ClientView', 'Booking', 'Leads', 'hotel_apartments', 'IA_CMR_Clientes'];
const TABLE_TO_PRISMA_MODEL = {
    'ClientView': 'clientView',
    'Booking': 'booking',
    'Leads': 'leads',
    'hotel_apartments': 'hotel_apartments',
    'IA_CMR_Clientes': 'iA_CMR_Clientes'
};
function isValidTable(table) {
    return VALID_TABLES.includes(table);
}
export function registerTablesRoute(router) {
    router.get('/tables/:tableName', async (req, res) => {
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
            const limitNum = Math.min(parseInt(limit) || 50, 100);
            const offsetNum = parseInt(offset) || 0;
            logger.debug({ tableName, filters, limit: limitNum, offset: offsetNum }, 'Fetching table data');
            const prismaModelName = TABLE_TO_PRISMA_MODEL[tableName];
            const model = prisma[prismaModelName];
            const where = Object.keys(filters).length > 0 ? filters : undefined;
            let orderBy = { id: 'desc' };
            if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
                orderBy = { phoneNumber: 'asc' };
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
        }
        catch (error) {
            logger.error({ error: error.message, tableName: req.params.tableName }, 'Failed to fetch table data');
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.get('/tables/:tableName/:id', async (req, res) => {
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
            const model = prisma[prismaModelName];
            let whereClause;
            if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
                whereClause = { phoneNumber: id };
            }
            else {
                whereClause = { id: parseInt(id) };
            }
            const data = await model.findUnique({
                where: whereClause
            });
            if (!data) {
                res.status(404).json({ error: 'Record not found' });
                return;
            }
            res.json(data);
        }
        catch (error) {
            logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to fetch record');
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.post('/tables/:tableName', async (req, res) => {
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
            const model = prisma[prismaModelName];
            const created = await model.create({ data });
            res.status(201).json(created);
        }
        catch (error) {
            logger.error({ error: error.message, tableName: req.params.tableName }, 'Failed to create record');
            if (error.code === 'P2002') {
                res.status(409).json({ error: 'Record with this key already exists' });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.patch('/tables/:tableName/:id', async (req, res) => {
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
            const model = prisma[prismaModelName];
            let whereClause;
            if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
                whereClause = { phoneNumber: id };
            }
            else {
                whereClause = { id: parseInt(id) };
            }
            const updated = await model.update({
                where: whereClause,
                data
            });
            res.json(updated);
        }
        catch (error) {
            logger.error({ error: error.message, tableName: req.params.tableName, id: req.params.id }, 'Failed to update record');
            if (error.code === 'P2025') {
                res.status(404).json({ error: 'Record not found' });
                return;
            }
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    router.delete('/tables/:tableName/:id', async (req, res) => {
        try {
            const { tableName, id } = req.params;
            if (!isValidTable(tableName)) {
                res.status(400).json({
                    error: 'Invalid table name',
                    validTables: VALID_TABLES
                });
                return;
            }
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
            const model = prisma[prismaModelName];
            let whereClause;
            if (tableName === 'ClientView' || tableName === 'IA_CMR_Clientes') {
                whereClause = { phoneNumber: id };
            }
            else {
                whereClause = { id: parseInt(id) };
            }
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
        }
        catch (error) {
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
