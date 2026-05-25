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


// 1. INITIATE THE MASKED CALL (Triggered by Flutter Web)
exports.makeMaskedCall = async (req, res) => {
    try {
        const { tagId, finderPhoneNumber } = req.body;

        if (!tagId || !finderPhoneNumber) {
            return res.status(400).json({ error: "Tag ID and finder phone number are required" });
        }

        // Find the tag to get the hidden owner number
        const tag = await TestTag.findOne({ tagId: tagId.toLowerCase().trim() });
        if (!tag) return res.status(404).json({ error: "Tag not found" });

        if (!tag.recoveryFeatures?.maskedCalling) {
            return res.status(400).json({ error: "Voice calling is disabled for this tag" });
        }

        // Encode the owner's phone number safely into the URL so our webhook can read it later
        const encodedOwnerNum = encodeURIComponent(tag.ownerPhoneNumber);

        // This is the public URL Render gives you. Twilio will hit this endpoint to get instructions.
        const backendDomain = process.env.PUBLIC_BACKEND_URL || "https://scantest-7m40.onrender.com";
        const twimlCallbackUrl = `${backendDomain}/api/communications/voice-bridge?ownerPhone=${encodedOwnerNum}`;

        // Step A: Twilio dials the Finder first
        const call = await client.calls.create({
            url: twimlCallbackUrl, // The instructions Twilio executes when the finder answers
            to: finderPhoneNumber,  // The Finder's number typed into the web form
            from: process.env.TWILIO_PHONE_NUMBER // Your Twilio Virtual Number
        });

        res.status(200).json({
            success: true,
            message: "Voice bridge initiated. Calling the finder first.",
            callSid: call.sid
        });

    } catch (error) {
        console.error("Twilio Voice Initialization Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// 2. TWIML INSTRUCTION WEBHOOK (Triggered automatically by Twilio's servers)
exports.handleTwimlVoiceBridge = (req, res) => {
    try {
        const ownerPhone = req.query.ownerPhone;

        // Construct the TwiML XML response mapping instructions back to Twilio
        const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="alice">Connecting you to the item owner securely. Please hold.</Say>
            <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}">
                <Number>${ownerPhone}</Number>
            </Dial>
        </Response>`;

        // Set the header to XML so Twilio parses it correctly
        res.type('text/xml');
        res.send(twimlResponse);

    } catch (error) {
        res.status(500).send(`<Response><Say>An internal server routing error occurred.</Say></Response>`);
    }
};