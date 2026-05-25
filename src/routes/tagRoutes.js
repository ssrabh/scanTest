const express = require('express');
const router = express.Router();
const tagController = require('../controllers/tagController');
const communicationController = require('../controllers/communicationController'); // Import

// Tag Management Routes
router.post('/tags', tagController.createTag);
router.get('/tags/public/:tagId', tagController.getPublicTag);

// Masked Communication Core Endpoint
router.post('/communications/sms', communicationController.sendMaskedSMS);

module.exports = router;

