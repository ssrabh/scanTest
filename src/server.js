const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit'); // 1. Import the package
require('dotenv').config();

const tagRoutes = require('./routes/tagRoutes');

const app = express();

// Enable wide cors so your deployed Flutter Web app can easily hit it
app.use(cors());

// Increase payload limit for raw image uploads
app.use(express.json({ limit: '10mb' }));

// 2. Define your Rate Limiting Rule
const publicApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes window
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: "Too many requests from this device, please try again after 15 minutes."
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// 3. Apply the rate limiter specifically to your API routes
// This protects all endpoints sitting under /api (like your public fetch)
app.use('/api', publicApiLimiter, tagRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Test Sandbox'))
    .catch(err => console.error('Database connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Test server running on port ${PORT}`));