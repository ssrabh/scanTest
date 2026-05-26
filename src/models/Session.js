const mongoose = require('mongoose');

const scannedSessionSchema = new mongoose.Schema({
    tagId: {
        type: String,
        required: true
    },
    // We will save the finder's public IP address here to track who initiated the scan
    finderIp: {
        type: String,
        required: true
    },
    // This will temporarily store the Finder's Phone Number once Twilio captures it via Caller ID
    capturedFinderNumber: {
        type: String,
        default: null
    },
    // Status can track if the session is 'pending', 'connected', or 'completed'
    sessionStatus: {
        type: String,
        enum: ['pending', 'connected', 'completed'],
        default: 'pending'
    },
    // TTL Index: MongoDB will automatically delete this entire document exactly 20 minutes (1200 seconds) after it is created!
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 1200
    }
});

module.exports = mongoose.model('ScannedSession', scannedSessionSchema);


