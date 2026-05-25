const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const communicationController = require('../controllers/communicationController'); // Import

// Tag Management Routes
router.post('/tags', tagController.createTag);
router.get('/tags/public/:tagId', tagController.getPublicTag);

// Masked Communication Core Endpoint
router.post('/communications/sms', communicationController.sendMaskedSMS);

// Route triggered by the frontend form to kick off the call
router.post('/communications/call', communicationController.makeMaskedCall);

// Webhook route that Twilio's servers call automatically to fetch the TwiML XML script
router.post('/communications/voice-bridge', communicationController.handleTwimlVoiceBridge);

module.exports = router;

