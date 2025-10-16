const { Storage } = require('@google-cloud/storage');
require('dotenv').config();

// GCP Storage Configuration
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

const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME;
const fileName = 'order.json';

// Cache configuration
let ordersData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch order data from Google Cloud Storage with caching
 */
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

/**
 * Update order data in Google Cloud Storage
 * Can handle updating the "cancelled" field to true or false
 */
async function updateOrderData(updatedOrders) {
    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        
        await file.save(JSON.stringify(updatedOrders, null, 2), {
            metadata: {
                contentType: 'application/json',
            },
        });
        
        // Update cache
        ordersData = updatedOrders;
        lastFetchTime = Date.now();
        
        return true;
    } catch (error) {
        throw new Error(`Failed to update order data in Google Cloud Storage: ${error.message}`);
    }
}

/**
 * Verify if an order ID exists in the system
 */
async function verifyOrderId(orderId) {
    try {
        // Validate input
        if (!orderId) {
            return {
                success: false,
                error: "Missing orderId",
                message: "OrderId is required"
            };
        }
        
        const orders = await fetchOrderData();
        const order = orders.find(order => order.orderId === parseInt(orderId));
        
        if (!order) {
            return {
                success: false,
                error: "Order not found",
                message: "No order found with this OrderId"
            };
        }
        
        // Return basic order info for OrderId verification
        return {
            success: true,
            data: {
                orderId: order.orderId,
                orderExists: true,
                bookName: order.bookName,
                status: order.status
            }
        };
        
    } catch (error) {
        console.error('OrderId verification error:', error);
        return {
            success: false,
            error: "Internal server error",
            message: "Unable to verify OrderId at this time"
        };
    }
}

/**
 * Verify phone number against order ID and return complete order details
 */
async function verifyPhone(orderId, phoneNumber) {
    try {
        // Validate required fields
        if (!orderId || !phoneNumber) {
            return {
                success: false,
                error: "Missing required fields",
                message: "Both orderId and phoneNumber are required"
            };
        }
        
        const orders = await fetchOrderData();
        const order = orders.find(order => 
            order.orderId === parseInt(orderId) && 
            order.phNum === parseInt(phoneNumber)
        );
        
        if (!order) {
            return {
                success: false,
                error: "Phone number mismatch",
                message: "Phone number does not match the order record"
            };
        }
        
        // Check if order is already cancelled
        if (order.cancelled) {
            return {
                success: false,
                error: "Order already cancelled",
                message: "This order has already been cancelled"
            };
        }
        
        // Return complete order details after phone verification
        return {
            success: true,
            data: {
                orderId: order.orderId,
                bookName: order.bookName,
                userName: order.userName,
                pinCode: order.pinCode,
                status: order.status,
                cancelled: order.cancelled || false,
                phoneVerified: true,
                amount: order.amount || 299 // Default amount if not specified
            }
        };
        
    } catch (error) {
        console.error('Phone verification error:', error);
        return {
            success: false,
            error: "Internal server error",
            message: "Unable to verify phone number at this time"
        };
    }
}

module.exports = {
    verifyOrderId,
    verifyPhone,
    updateOrderData
};