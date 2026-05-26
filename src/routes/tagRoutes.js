const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const communicationController = require('../controllers/communicationController');

// ==========================================
// 🏷️ TAG MANAGEMENT ROUTES
// ==========================================

// Create a brand new smart asset tag record
router.post(
    '/tags',
    tagController.uploadMiddleware,
    tagController.createTag
);

// Fetch public, filtered tag profile for the Next.js scanner frontend
router.get('/tags/public/:tagId', tagController.getPublicTag);

// Update textual metadata config for an existing tag from the owner dashboard
router.put('/tags/:tagId', tagController.updateTag);

// Upload/Replace item photo binary directly from the smartphone gallery picker
router.put(
    '/tags/:tagId/upload-image',
    tagController.uploadMiddleware,
    tagController.uploadItemImage
);




// ==========================================
// 🛡️ MASKED COMMUNICATION GATEWAY ROUTES
// ==========================================

// Dispatches a masked SMS notification packet safely to the owner
router.post('/communications/sms', communicationController.sendMaskedSMS);

// Initial trigger fired by the frontend button to kick off a call sequence
router.post('/communications/call', communicationController.makeMaskedCall);

// Twilio webhook wrapper targeting live structural runtime voice execution parameters
router.get('/communications/voice-bridge', communicationController.handleTwimlVoiceBridge);

// Internal background synchronization hook to spin up and warm up active finder instances
router.post('/communications/prewarm', communicationController.prewarmSession);

// Low-latency endpoint validating and parsing zero-friction direct incoming calls
router.post('/communications/incoming-voice', communicationController.handleIncomingZeroFrictionCall);

// Security boundary allowing target owners to completely blackhole abusive caller sessions
router.post('/communications/block-session', communicationController.blockFinderBySession);


module.exports = router;