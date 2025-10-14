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

app.post('/api/order', basicAuth, async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ 
                error: 'Order ID is required'
            });
        }
        
        const orders = await fetchOrderData();
        const order = orders.find(order => order.orderId === parseInt(orderId));
        
        if (!order) {
            return res.status(404).json({ 
                error: 'Order not found'
            });
        }
        
        res.json({
            success: true,
            data: order
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: 'Internal server error'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});