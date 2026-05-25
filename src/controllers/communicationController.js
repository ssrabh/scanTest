const TestTag = require('../models/Tag');
const twilio = require('twilio');

// Initialize Twilio client using environment variables
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

exports.sendMaskedSMS = async (req, res) => {
    try {
        const { tagId, finderMessage, finderContactInfo } = req.body;

        if (!tagId || !finderMessage) {
            return res.status(400).json({ error: "Tag ID and message are required" });
        }

        // 1. Look up the tag configuration to find the owner's hidden number
        const tag = await TestTag.findOne({ tagId: tagId.toLowerCase().trim() });
        if (!tag) {
            return res.status(404).json({ error: "Tag not found" });
        }

        // Check if messaging is enabled for this specific tag asset
        if (!tag.recoveryFeatures?.maskedMessaging) {
            return res.status(400).json({ error: "SMS messaging is disabled for this tag" });
        }

        // 2. Format a professional alert message for the owner
        const smsPayload = `[SmartTag Alert] Someone scanned your tag "${tag.title}"! \n\nMessage: "${finderMessage}" \n\nFinder Contact: ${finderContactInfo || 'Not provided'}`;

        // 3. Trigger Twilio Outbound Dispatcher
        const messageResponse = await client.messages.create({
            body: smsPayload,
            from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio sandbox number
            to: tag.ownerPhoneNumber // Routes securely to the hidden owner number
        });

        res.status(200).json({
            success: true,
            message: "Alert notification text successfully dispatched to owner securely.",
            messageSid: messageResponse.sid
        });

    } catch (error) {
        console.error("Twilio SMS Dispatch Error:", error);
        res.status(500).json({ error: error.message });
    }
};