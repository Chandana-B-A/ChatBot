const express = require('express');
const cors = require('cors');
const { Storage } = require('@google-cloud/storage');
const basicAuth = require('./middleware/auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// GCP environment variables
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_CLOUD_PROJECT_ID,
        private_key_id: process.env.GOOGLE_CLOUD_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/"/g, ''),
        client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLOUD_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.GOOGLE_CLOUD_CLIENT_X509_CERT_URL
    }
});

// Cloud Storage
const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;
const fileName = 'order.json';

let ordersData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;


// Function to fetch data from Cloud Storage
async function fetchOrderData() {
    try {
        const now = Date.now();
        
        if (ordersData && (now - lastFetchTime) < CACHE_DURATION) {
            return ordersData;
        }
        
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        
        const [data] = await file.download();
        ordersData = JSON.parse(data.toString());
        lastFetchTime = now;
        
        return ordersData;
    } catch (error) {
        throw new Error(`Failed to fetch order data from Google Cloud Storage: ${error.message}`);
    }
}

// Middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the server!' });
});

const {
    verifyOrderId,
    verifyPhoneNumber,
    fetchTrackingStatus
} = require('./services/orderVerification');

// Import order cancellation functions
const {
    verifyOrderId: verifyOrderIdCancel,
    verifyPhone: verifyPhoneCancel,
    updateOrderData
} = require('./services/orderCancel');

app.post('/api/order', basicAuth, async (req, res) => {
    console.log(req.body);
    try {
        let tag = req.body.fulfillmentInfo.tag;
        console.log(tag);
        
        let orderId = req.body.sessionInfo.parameters.orderid;
        console.log(orderId);
        

        const orders = await fetchOrderData();

        if (tag === 'verify-orderid') {
            console.log('Verifying order ID');
            let orderId = req.body.sessionInfo.parameters.orderid;
            console.log("orderId: ", orderId);
            
            const r = verifyOrderId(orderId, orders);
            return res.json({sessionInfo: {parameters: { orderFound: 'true' }}});
        }

        if (tag === 'verify-phonenumber') {
            let phoneNumber = req.body.sessionInfo.parameters.phoneNumber;
            const r = verifyPhoneNumber(orderId, phoneNumber, orders);
            return res.status(200).json({ success: r.ok, code: r.code });
        }

        if (tag === 'fetch-status') {
            const r = fetchTrackingStatus(orderId, phoneNumber, orders);
            if (r.ok) return res.status(200).json({ success: true, data: r.data });
            return res.status(200).json({ success: false, error: 'Tracking order validation failed', code: r.code });
        }

        // Default behavior for backward compatibility
        if (!orderId) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        const order = orders.find(order => order.orderId === parseInt(orderId));
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
        let phoneNumber = req.body.sessionInfo?.parameters?.phoneNumber || req.body.phoneNumber;
        
        console.log('OrderId:', orderId, 'PhoneNumber:', phoneNumber);

        if (tag === 'verify-orderid-cancel' || tag === 'verify_orderId') {
            console.log('Verifying order ID for cancellation');
            
            const result = await verifyOrderIdCancel(orderId);
            console.log('verifyOrderIdCancel result:', result);
            
            if (result.success) {
                return res.status(200).json({
                    success: true,
                    data: result.data,
                    sessionInfo: { parameters: { orderFound: 'true' } }
                });
            } else {
                return res.status(200).json({
                    success: false,
                    error: result.error,
                    message: result.message
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
            
            return res.status(200).json(result);
        }

        if (tag === 'cancel-order') {
            console.log('Processing order cancellation');
            
            if (!orderId || !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields',
                    message: 'Both orderId and phoneNumber are required for cancellation'
                });
            }
            
            // First verify the phone number
            const phoneVerification = await verifyPhoneCancel(orderId, phoneNumber);
            
            if (!phoneVerification.success) {
                return res.status(200).json(phoneVerification);
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
                        success: false,
                        error: 'Order not found',
                        message: 'Order not found for cancellation'
                    });
                }
                
                // Mark order as cancelled
                orders[orderIndex].cancelled = true;
                orders[orderIndex].status = 'cancelled';
                
                // Update the data in cloud storage
                await updateOrderData(orders);
                
                return res.status(200).json({
                    success: true,
                    message: 'Order cancelled successfully',
                    data: {
                        orderId: orders[orderIndex].orderId,
                        bookName: orders[orderIndex].bookName,
                        status: 'cancelled',
                        cancelled: true
                    }
                });
                
            } catch (updateError) {
                console.error('Error updating order:', updateError);
                return res.status(500).json({
                    success: false,
                    error: 'Update failed',
                    message: 'Failed to cancel order. Please try again.'
                });
            }
        }

        // Default response for unknown tags
        return res.status(400).json({
            success: false,
            error: 'Invalid tag',
            message: 'Unknown operation tag'
        });
        
    } catch (error) {
        console.error('Order cancellation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: 'Unable to process cancellation request'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});