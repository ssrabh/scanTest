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
// router.post('/communications/voice-bridge', communicationController.handleTwimlVoiceBridge);
router.get('/communications/voice-bridge', communicationController.handleTwimlVoiceBridge);

// Add this alongside your other communication endpoints
router.post('/communications/prewarm', communicationController.prewarmSession);

// Replace your old voice routing lines with this entry:
router.post('/communications/incoming-voice', communicationController.handleIncomingZeroFrictionCall);

// Add this route to your existing routes/tagRoutes.js file
router.post('/communications/block-session', communicationController.blockFinderBySession);

module.exports = router;

