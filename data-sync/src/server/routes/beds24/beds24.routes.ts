import { Router } from 'express';
import { logger } from '../../../utils/logger.js';
import { beds24Client } from '../../../integrations/beds24.client.js';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/beds24/bookings
 * Fetch bookings from Beds24 API with filters
 */
router.get('/bookings', async (req, res) => {
  try {
    const query = z.object({
      bookId: z.string().optional(),
      propertyId: z.string().optional(),
      roomId: z.string().optional(),
      arrival: z.string().optional(), // YYYY-MM-DD
      departure: z.string().optional(), // YYYY-MM-DD
      modified: z.string().optional(), // YYYY-MM-DD
      status: z.enum(['new', 'confirmed', 'cancelled']).optional(),
      limit: z.string().transform(Number).default('50'),
      offset: z.string().transform(Number).default('0'),
    }).parse(req.query);

    logger.info({ query }, 'Fetching Beds24 bookings');

    const bookings = await beds24Client.getBookings(query);

    logger.info({ 
      count: bookings.data?.length || 0,
      total: bookings.count 
    }, 'Beds24 bookings fetched successfully');

    res.json({
      success: true,
      data: bookings.data,
      count: bookings.count,
      query
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch Beds24 bookings');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/beds24/bookings/:bookId
 * Get specific booking by ID
 */
router.get('/bookings/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    
    logger.info({ bookId }, 'Fetching specific Beds24 booking');

    const booking = await beds24Client.getBooking(bookId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    return res.json({
      success: true,
      data: booking
    });

  } catch (error: any) {
    logger.error({ error: error.message, bookId: req.params.bookId }, 'Failed to fetch Beds24 booking');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/beds24/bookings/:bookId
 * Update booking (requires WRITE token)
 */
router.patch('/bookings/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const updateData = req.body;
    
    logger.info({ bookId, updateData }, 'Updating Beds24 booking');

    const result = await beds24Client.updateBooking(bookId, updateData);

    logger.info({ bookId, result }, 'Beds24 booking updated successfully');

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error({ error: error.message, bookId: req.params.bookId }, 'Failed to update Beds24 booking');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/beds24/availability
 * Get availability calendar
 */
router.get('/availability', async (req, res) => {
  try {
    const query = z.object({
      propertyId: z.string(),
      roomId: z.string().optional(),
      checkIn: z.string(), // YYYY-MM-DD
      checkOut: z.string(), // YYYY-MM-DD
    }).parse(req.query);

    logger.info({ query }, 'Fetching Beds24 availability');

    const availability = await beds24Client.getAvailability(query);

    res.json({
      success: true,
      data: availability,
      query
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch Beds24 availability');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/beds24/properties
 * Get all properties
 */
router.get('/properties', async (req, res) => {
  try {
    logger.info('Fetching Beds24 properties');

    const properties = await beds24Client.getProperties();

    res.json({
      success: true,
      data: properties
    });

  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch Beds24 properties');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export { router as beds24Routes };