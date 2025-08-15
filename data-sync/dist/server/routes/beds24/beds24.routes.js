import { Router } from 'express';
import { logger } from '../../../utils/logger.js';
import { beds24Client } from '../../../integrations/beds24.client.js';
import { z } from 'zod';
const router = Router();
router.get('/bookings', async (req, res) => {
    try {
        const query = z.object({
            filter: z.enum(['arrivals', 'departures', 'new', 'current']).optional(),
            propertyId: z.union([z.string(), z.array(z.string())]).optional(),
            roomId: z.union([z.string(), z.array(z.string())]).optional(),
            id: z.union([z.string(), z.array(z.string())]).optional(),
            masterId: z.union([z.string(), z.array(z.string())]).optional(),
            apiReference: z.union([z.string(), z.array(z.string())]).optional(),
            channel: z.enum([
                'agoda', 'airbnb', 'asiatravel', 'atraveode', 'booking', 'bookingpage',
                'despegar', 'direct', 'edreamsodigeo', 'expedia', 'feratel', 'goibibo',
                'hometogo', 'hostelworld', 'hotelbeds', 'hrs', 'jomres', 'marriott',
                'ostrovokru', 'ota', 'tiket', 'tomastravel', 'traveloka', 'travia',
                'traum', 'trip', 'tripadvisorrentals', 'vacationstay', 'vrbo'
            ]).optional(),
            arrival: z.string().optional(),
            arrivalFrom: z.string().optional(),
            arrivalTo: z.string().optional(),
            departure: z.string().optional(),
            departureFrom: z.string().optional(),
            departureTo: z.string().optional(),
            bookingTimeFrom: z.string().optional(),
            bookingTimeTo: z.string().optional(),
            modifiedFrom: z.string().optional(),
            modifiedTo: z.string().optional(),
            searchString: z.string().optional(),
            status: z.union([
                z.enum(['confirmed', 'request', 'new', 'cancelled', 'black', 'inquiry']),
                z.array(z.enum(['confirmed', 'request', 'new', 'cancelled', 'black', 'inquiry']))
            ]).optional(),
            includeInvoiceItems: z.string().transform(Boolean).optional(),
            includeInfoItems: z.string().transform(Boolean).optional(),
            includeGuests: z.string().transform(Boolean).optional(),
            includeBookingGroup: z.string().transform(Boolean).optional(),
            page: z.string().transform(Number).optional(),
            limit: z.string().transform(Number).optional(),
            offset: z.string().transform(Number).optional(),
            modified: z.string().optional(),
        }).parse(req.query);
        logger.info({ query }, 'Fetching Beds24 bookings with advanced filters');
        const apiParams = { ...query };
        if (query.modified && !query.modifiedFrom) {
            apiParams.modifiedFrom = query.modified;
            delete apiParams.modified;
        }
        if (query.limit || query.offset) {
            if (!query.page) {
                const page = query.offset ? Math.floor(query.offset / (query.limit || 50)) + 1 : 1;
                apiParams.page = page;
            }
            delete apiParams.limit;
            delete apiParams.offset;
        }
        const bookings = await beds24Client.getBookings(apiParams);
        logger.info({
            count: bookings.data?.length || 0,
            total: bookings.count,
            pages: bookings.pages
        }, 'Beds24 bookings fetched successfully');
        res.json({
            success: true,
            data: bookings.data,
            count: bookings.count,
            pages: bookings.pages,
            query: apiParams
        });
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to fetch Beds24 bookings');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
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
    }
    catch (error) {
        logger.error({ error: error.message, bookId: req.params.bookId }, 'Failed to fetch Beds24 booking');
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.post('/bookings', async (req, res) => {
    try {
        const bookings = req.body;
        const bookingSchema = z.array(z.object({
            id: z.number().optional(),
            roomId: z.number().optional(),
            status: z.enum(['new', 'confirmed', 'request', 'cancelled']).optional(),
            arrival: z.string().optional(),
            departure: z.string().optional(),
            numAdult: z.number().optional(),
            numChild: z.number().optional(),
            title: z.string().optional(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            mobile: z.string().optional(),
            address: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            postcode: z.string().optional(),
            country: z.string().optional(),
            notes: z.string().optional(),
            comments: z.string().optional(),
            price: z.number().optional(),
            infoItems: z.array(z.object({
                id: z.number().optional(),
                code: z.string().optional(),
                text: z.string().optional()
            })).optional(),
            invoiceItems: z.array(z.object({
                id: z.number().optional(),
                type: z.enum(['charge', 'payment', 'refund']).optional(),
                description: z.string().optional(),
                qty: z.number().optional(),
                amount: z.number().optional()
            })).optional(),
            actions: z.object({
                makeGroup: z.boolean().optional()
            }).optional()
        }));
        const validatedBookings = bookingSchema.parse(bookings);
        const createCount = validatedBookings.filter(b => !b.id).length;
        const updateCount = validatedBookings.filter(b => b.id).length;
        logger.info({
            totalBookings: validatedBookings.length,
            creates: createCount,
            updates: updateCount
        }, 'Processing Beds24 bookings upsert');
        const result = await beds24Client.upsertBooking(validatedBookings);
        logger.info({
            bookingsCount: validatedBookings.length,
            creates: createCount,
            updates: updateCount,
            result: result
        }, 'Beds24 bookings processed successfully');
        res.status(201).json({
            success: true,
            data: result,
            summary: {
                total: validatedBookings.length,
                creates: createCount,
                updates: updateCount
            }
        });
    }
    catch (error) {
        logger.error({ error: error.message, body: req.body }, 'Failed to process Beds24 bookings');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
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
    }
    catch (error) {
        logger.error({ error: error.message, bookId: req.params.bookId }, 'Failed to update Beds24 booking');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/availability', async (req, res) => {
    try {
        const query = z.object({
            propertyId: z.string(),
            roomId: z.string().optional(),
            checkIn: z.string(),
            checkOut: z.string(),
        }).parse(req.query);
        logger.info({ query }, 'Fetching Beds24 availability');
        const availability = await beds24Client.getAvailability(query);
        res.json({
            success: true,
            data: availability,
            query
        });
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to fetch Beds24 availability');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/properties', async (req, res) => {
    try {
        logger.info('Fetching Beds24 properties');
        const properties = await beds24Client.getProperties();
        res.json({
            success: true,
            data: properties
        });
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to fetch Beds24 properties');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/channels/booking/reviews', async (req, res) => {
    try {
        logger.info('Fetching Booking.com reviews');
        const reviews = await beds24Client.getBookingReviews();
        res.json({
            success: true,
            data: reviews
        });
    }
    catch (error) {
        logger.error({ error: error.message }, 'Failed to fetch Booking.com reviews');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.post('/channels/booking', async (req, res) => {
    try {
        const actions = req.body;
        const actionsSchema = z.array(z.object({
            action: z.enum(['reportNoShow', 'reportInvalidCard', 'requestCancellation', 'markCompleted']),
            bookingId: z.number(),
            reason: z.string().optional(),
            timestamp: z.string().optional(),
            notes: z.string().optional()
        }));
        const validatedActions = actionsSchema.parse(actions);
        logger.info({ actions: validatedActions }, 'Performing Booking.com actions');
        const result = await beds24Client.performBookingActions(validatedActions);
        logger.info({
            actionsCount: validatedActions.length,
            result: result
        }, 'Booking.com actions completed successfully');
        res.status(201).json({
            success: true,
            data: result,
            actionsProcessed: validatedActions.length
        });
    }
    catch (error) {
        logger.error({ error: error.message, body: req.body }, 'Failed to perform Booking.com actions');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
export { router as beds24Routes };
