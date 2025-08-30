/**
 * Get property name from hotel_apartments table
 */
import { prisma } from '../../infra/db/prisma.client.js';
import { logger } from '../../utils/logger.js';

/**
 * Get property name from hotel_apartments table using propertyId or roomId
 */
export async function getPropertyNameFromDB(propertyId: number | string): Promise<string | null> {
  try {
    const id = typeof propertyId === 'string' ? parseInt(propertyId) : propertyId;
    
    // Try to find by propertyId first
    let apartment = await prisma.hotel_apartments.findFirst({
      where: { propertyId: id }
    });
    
    // If not found, try by roomId
    if (!apartment) {
      apartment = await prisma.hotel_apartments.findFirst({
        where: { roomId: id }
      });
    }
    
    return apartment?.propertyName || null;
  } catch (error) {
    logger.error({ propertyId, error }, 'Error getting property name from DB');
    return null;
  }
}

/**
 * Static fallback map for when DB is not available
 */
export const PROPERTY_MAP_FALLBACK: Record<string, string> = {
  '173207': '2005-A',
  '173307': '1820',
  '173308': '1317',
  '173309': '1722-B',
  '173311': '2005-B',
  '173312': '1722-A',
  '240061': '0715',
  '280243': 'punta arena tierra bomba'
};