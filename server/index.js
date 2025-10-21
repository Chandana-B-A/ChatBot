const express = require('express');
const cors = require('cors');
const basicAuth = require('./middleware/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import order verification functions
const {
    verifyOrderId,
    verifyPhoneNumber,
    fetchTrackingStatus,
    verifyDOB,
    fetchTrackingStatusByDOB,
    fetchOrderData: fetchOrderDataService,
    invalidateOrdersCache: invalidateOrdersCacheService
} = require('./src/services/orderVerification');

// Import order cancellation functions
const {
    verifyOrderId: verifyOrderIdCancel,
    verifyPhone: verifyPhoneCancel,
    updateOrderData,
    fetchOrderData
} = require('./src/services/orderCancel');

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the server!' });
});


app.post('/api/order', basicAuth, async (req, res) => {
    console.log(req.body);
    try {
        // Optional cache busting for debugging/stale data issues
        const forceRefresh = (req.body && (req.body.forceRefresh === true || req.body.forceRefresh === 'true'))
            || (req.query && (req.query.forceRefresh === 'true' || req.query.refreshCache === 'true'));
        if (forceRefresh) {
            console.log('Force refresh requested; invalidating orders cache');
            invalidateOrdersCacheService();
        }
        // Read tag from either top-level or Dialogflow CX shape
        let tag = req.body.tag || (req.body.fulfillmentInfo && req.body.fulfillmentInfo.tag);
        console.log(tag);

        // Read orderId safely. Keep the original line when available.
        let orderIdSafe = (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.orderid) 
            ?? req.body.orderId 
            ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.order_id);
        console.log(orderIdSafe);
        

        // Fetch orders from Cloud Storage, but do not crash if it fails
        let orders = [];
        try {
            orders = await fetchOrderDataService();
        } catch (e) {
            console.error('Failed to fetch order data from GCS:', e.message);
        }

        if (tag === 'verify-orderid') {
            console.log('Verifying order ID');
            // Keep the explicit line when sessionInfo exists; otherwise fall back
            let orderId;
            if (req.body.sessionInfo && req.body.sessionInfo.parameters && (req.body.sessionInfo.parameters.orderid !== undefined)) {
                orderId = req.body.sessionInfo.parameters.orderid; // keep this line as requested
            } else {
                orderId = orderIdSafe;
            }
            console.log("orderId: ", orderId);

            const r = verifyOrderId(orderId, orders);
            console.log('Order ID verification result:', r);
            if (r.ok) {
                return res.json({ sessionInfo: { parameters: { orderFound: 'true' } } });
            }
            return res.json({ sessionInfo: { parameters: { orderFound: 'false' } } });
        }

        if (tag === 'verify-phonenumber') {
            console.log('Verifying phone number');
            let phonenumber = (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.phonenumber)
                ?? req.body.phonenumber
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.phone_number);
            console.log("orderId: ", orderIdSafe);
                console.log("phoneNumber: ", phonenumber);
                const r = verifyPhoneNumber(orderIdSafe, phonenumber, orders);
            console.log('Phone verification result:', r);
            if (r.ok) {
                return res.json({ sessionInfo: { parameters: { phoneFound: 'true' } } });
            }
            return res.json({ sessionInfo: { parameters: { phoneFound: 'false' } } });
        }

        if (tag === 'verify-dob') {
            console.log('Verifying date of birth');
            let dob = (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.dob)
                ?? req.body.dob
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.date_of_birth)
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.birthdate)
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.dateOfBirth);
            console.log("orderId: ", orderIdSafe);
            console.log("dob: ", dob);
            const r = verifyDOB(orderIdSafe, dob, orders);
            console.log('DOB verification result:', r);
            if (r.ok) {
                return res.json({ sessionInfo: { parameters: { dobFound: 'true' } } });
            }
            return res.json({ sessionInfo: { parameters: { dobFound: 'false' } } });
        }

        if (tag === 'fetch-status') {
            let dob = (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.dob)
                ?? req.body.dob
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.date_of_birth)
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.birthdate)
                ?? (req.body.sessionInfo && req.body.sessionInfo.parameters && req.body.sessionInfo.parameters.dateOfBirth);
            const r = fetchTrackingStatusByDOB(orderIdSafe, dob, orders);
            console.log("orderId: ", orderIdSafe);
            console.log("dob: ", dob);
            console.log('Fetch tracking status result:', r);
            if (r.ok) {
                return res.status(200).json({
                    success: true,
                    data: r.data,
                    sessionInfo: { parameters: { status: r.data.status } }
                });
            }
            return res.status(200).json({ success: false, error: 'Tracking order validation failed', code: r.code });
        }

        // Default behavior for backward compatibility
        if (!orderIdSafe) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        const order = orders.find(order => order.orderId === parseInt(orderIdSafe));
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        return res.status(200).json({ success: true, data: order });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Order Cancellation Endpoint - Uses orderCancel.js functions
app.post('/api/orderCancel', basicAuth, async (req, res) => {
    console.log('Order cancellation endpoint called with body:', req.body);
    try {
        let tag = req.body.fulfillmentInfo?.tag || req.body.tag;
        console.log('Cancellation tag:', tag);
        
        let orderId = req.body.sessionInfo?.parameters?.orderid || req.body.orderId;
        // Get phone number from webhook parameter and sanitize to digits
        let rawPhone = req.body.sessionInfo?.parameters?.phonenumber;
        let phoneNumber = rawPhone ? String(rawPhone).replace(/\D/g, '') : undefined;
        
        console.log('OrderId:', orderId, 'PhoneNumber:', phoneNumber);

        if (tag === 'verify-orderid-cancel' || tag === 'verify_orderId') {
            console.log('Verifying order ID for cancellation');
            
            const result = await verifyOrderIdCancel(orderId);
            console.log('verifyOrderIdCancel result:', result);
            
            if (result.success) {
                return res.status(200).json({
                    fulfillmentResponse: {},
                    sessionInfo: {
                        parameters: {
                            orderFound: 'true',
                            bookName: result.data.bookName,
                            orderStatus: result.data.status
                        }
                    }
                });
            } else {
                return res.status(200).json({
                    fulfillmentResponse: {},
                    sessionInfo: {
                        parameters: {
                            orderFound: 'false'
                        }
                    }
                });
            }
        }

        if (tag === 'verify-phone-cancel') {
            console.log('Verifying phone number for cancellation');
            
            if (!orderId || !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'Both orderId and phoneNumber are required'
                });
            }
            
            const result = await verifyPhoneCancel(orderId, phoneNumber);
            console.log('verifyPhoneCancel result:', result);
            
            if (result.success) {
                // Phone number verified successfully for the provided order ID
                return res.status(200).json({
                    fulfillmentResponse: {},
                    sessionInfo: {
                        parameters: {
                            phoneVerified: 'true'
                        }
                    }
                });
            } else if (result.error === 'Order already cancelled') {
                // Order is already cancelled but phone verification was successful
                return res.status(200).json({
                    fulfillmentResponse: {
                        messages: [{
                            text: {
                                text: ['Good news! This order has already been cancelled. No further action needed.']
                            }
                        }]
                    },
                    sessionInfo: {
                        parameters: {
                            phoneVerified: 'true',
                            orderStatus: 'cancelled'
                        }
                    }
                });
            } else {
                return res.status(200).json({
                    fulfillmentResponse: {},
                    sessionInfo: {
                        parameters: {
                            phoneVerified: 'false'
                        }
                    }
                });
            }
        }

        if (tag === 'cancel-order') {
            console.log('Processing order cancellation');
            
            // Get confirmation response
            const confirmationResponse = req.body.sessionInfo?.parameters?.confirmationresponse;
            console.log('Confirmation response:', confirmationResponse);
            
            // Check if user confirmed cancellation
            if (confirmationResponse !== 'yes') {
                console.log('Order cancellation declined by user');
                return res.status(200).json({
                    fulfillmentResponse: {
                        messages: [{
                            text: {
                                text: ['Order cancellation has been cancelled. Your order remains active.']
                            }
                        }]
                    },
                    sessionInfo: {
                        parameters: {
                            cancellationComplete: 'false',
                            cancellationDeclined: 'true'
                        }
                    }
                });
            }
            
            if (!orderId || !phoneNumber) {
                return res.status(400).json({
                    fulfillmentResponse: {}
                });
            }
            
            // First verify the phone number
            const phoneVerification = await verifyPhoneCancel(orderId, phoneNumber);
            
            if (!phoneVerification.success) {
                return res.status(200).json({
                    fulfillmentResponse: {}
                });
            }
            
            // If phone verification successful, proceed with cancellation
            try {
                // Fetch current orders data
                const orders = await fetchOrderData();
                
                // Find and update the order
                const orderIndex = orders.findIndex(order => 
                    order.orderId === parseInt(orderId) && 
                    order.phNum === parseInt(phoneNumber)
                );
                
                if (orderIndex === -1) {
                    return res.status(200).json({
                        fulfillmentResponse: {
                            messages: [{
                                text: {
                                    text: ['Order not found for cancellation.']
                                }
                            }]
                        }
                    });
                }
                
                // Mark order as cancelled
                orders[orderIndex].cancelled = true;
                orders[orderIndex].status = 'cancelled';
                
                // Update the data in cloud storage
                await updateOrderData(orders);
                
                return res.status(200).json({
                    fulfillmentResponse: {
                        messages: [{
                            text: {
                                text: [`Success! Your order for "${orders[orderIndex].bookName}" (Order ID: ${orders[orderIndex].orderId}) has been cancelled successfully. You will receive a confirmation email shortly.`]
                            }
                        }]
                    },
                    sessionInfo: {
                        parameters: {
                            cancellationComplete: 'true',
                            cancelledOrderId: orders[orderIndex].orderId,
                            cancelledBookName: orders[orderIndex].bookName
                        }
                    }
                });
                
            } catch (updateError) {
                console.error('Error updating order:', updateError);
                return res.status(500).json({
                    fulfillmentResponse: {
                        messages: [{
                            text: {
                                text: ['Failed to cancel order. Please try again or contact customer support.']
                            }
                        }]
                    }
                });
            }
        }
        return res.status(400).json({
            fulfillmentResponse: {
                messages: [{
                    text: {
                        text: ['Unknown operation. Please try again.']
                    }
                }]
            }
        });        
    } catch (error) {
        console.error('Order cancellation error:', error);
        return res.status(500).json({
            fulfillmentResponse: {
                messages: [{
                    text: {
                        text: ['Sorry, there was an error processing your request. Please try again later.']
                    }
                }]
            }
        });
    }
});

// Manually update cancelled status from true to false
app.put('/api/updateCancelledOrders', basicAuth, async (req, res) => {
    console.log('Update cancelled orders endpoint called');
    try {
        // Fetch current orders data
        const orders = await fetchOrderData();
        
        let updatedCount = 0;
        
        // Update all orders where cancelled is true to false
        orders.forEach(order => {
            if (order.cancelled === true) {
                order.cancelled = false;
                order.status = order.status === 'cancelled' ? 'active' : order.status;
                updatedCount++;
            }
        });
        
        if (updatedCount === 0) {
            return res.status(200).json({
                success: true,
                message: 'No cancelled orders found to update',
                updatedCount: 0
            });
        }
        
        // Update the data in cloud storage
        await updateOrderData(orders);
        
        console.log(`Successfully updated ${updatedCount} orders from cancelled=true to cancelled=false`);
        
        return res.status(200).json({
            success: true,
            message: `Successfully updated ${updatedCount} orders from cancelled=true to cancelled=false`,
            updatedCount: updatedCount
        });
        
    } catch (error) {
        console.error('Error updating cancelled orders:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update cancelled orders',
            message: error.message
        });
    }
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});