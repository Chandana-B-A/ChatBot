const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Load order data
const ordersData = JSON.parse(fs.readFileSync(path.join(__dirname, 'order.json'), 'utf8'));

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the server!' });
});

app.post('/api/order', (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({ 
                error: 'Order ID is required'
            });
        }
        
        const order = ordersData.find(order => order.orderId === parseInt(orderId));
        
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