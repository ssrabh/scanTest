const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const tagRoutes = require('./routes/tagRoutes');

const app = express();

// Enable wide cors so your deployed Flutter Web app can easily hit it
app.use(cors());
// Increase payload limit for raw image uploads
app.use(express.json({ limit: '10mb' }));

app.use('/api', tagRoutes);

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB Test Sandbox'))
    .catch(err => console.error('Database connection error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Test server running on port ${PORT}`));