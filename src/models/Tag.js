const mongoose = require('mongoose');

const tagImageSchema = new mongoose.Schema({
    url: { type: String, default: null },
    fileId: { type: String, default: null },
}, { _id: false });

const testTagSchema = new mongoose.Schema({
    // Simplified unique human-readable ID (e.g., "TAG-9921")
    tagId: {
        type: String,
        required: true,
        unique: true
    },
    title: { type: String, required: true },
    category: { type: String, enum: ['Person', 'Pets', 'Vehicles', 'Asset'], required: true },
    subCategory: { type: String, required: true },
    description: { type: String, default: null },

    itemImageUrl: { type: tagImageSchema, default: null },

    // Status controls for UI toggles
    itemStatus: { type: String, enum: ['safe', 'lost', 'recovered'], default: 'safe' },

    recoveryFeatures: {
        maskedCalling: { type: Boolean, default: false },
        maskedMessaging: { type: Boolean, default: false },
        messageForFinder: {
            type: String,
            default: "Hi! I've lost my item. Please help me recover it."
        },
    },

    scanUrl: { type: String, default: null },
    qrCodeImage: { type: tagImageSchema, default: null }
}, { timestamps: true });

module.exports = mongoose.model('TestTag', testTagSchema);