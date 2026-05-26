const TestTag = require('../models/Tag');
const ScannedSession = require('../models/Session');
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

exports.prewarmSession = async (req, res) => {
    try {
        const { tagId } = req.body;

        if (!tagId) {
            return res.status(400).json({ error: "Tag ID is required to pre-warm communication links." });
        }

        // Extract the finder's public IP address safely from the request headers
        // Handles proxies (like Render's routing layers) or local development setups fallbacks
        const finderIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

        // Clean up the input string mapping
        const cleanTagId = tagId.toLowerCase().trim();

        // Check if the asset exists first
        const tag = await TestTag.findOne({ tagId: cleanTagId });
        if (!tag) {
            return res.status(404).json({ error: "Invalid Tag configuration." });
        }

        // Create the temporary mapping in MongoDB
        const newSession = new ScannedSession({
            tagId: cleanTagId,
            finderIp: finderIp,
            sessionStatus: 'pending'
        });

        await newSession.save();

        res.status(201).json({
            success: true,
            message: "Secure communication window pre-warmed successfully. Ready for frictionless dialer connection.",
            expiresInSeconds: 1200 // 20 minutes expiration
        });

    } catch (error) {
        console.error("Pre-Warm Routing Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// 3. NEW: INBOUND TWILIO ROUTING HOOK (Twilio will hit this route when your number rings)
exports.handleIncomingZeroFrictionCall = async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();

    // Twilio automatically passes the caller's real phone carrier number in req.body.From
    const finderPhoneNumber = req.body.From;

    // Extract incoming network parameters to back-trace the proxy context if available
    const incomingIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

    try {
        if (!finderPhoneNumber) {
            twiml.say("Security protocol alert. Caller Identity could not be verified.");
            return res.type('text/xml').send(twiml.toString());
        }

        // Search your temporary sessions database to find a pending tag scan originating from this context 
        // We look for the most recent scan record to match it instantly
        const activeSession = await ScannedSession.findOne({
            sessionStatus: 'pending'
        }).sort({ createdAt: -1 });

        if (!activeSession) {
            twiml.say("Welcome to Smart Tag Recovery. We could not locate an active asset scan session. Please keep your browser window open and try again.");
            return res.type('text/xml').send(twiml.toString());
        }

        // Grab the corresponding asset tag config
        const tag = await TestTag.findOne({ tagId: activeSession.tagId });
        if (!tag || !tag.recoveryFeatures?.maskedCalling) {
            twiml.say("Secure routing configurations for this item are unavailable. Goodbye.");
            return res.type('text/xml').send(twiml.toString());
        }

        // 🚫 CRISIS PREVENTION SHIELD: Check if the owner blacklisted this carrier CallerID string
        if (tag.blockedNumbers && tag.blockedNumbers.includes(finderPhoneNumber)) {
            // Drop call silently with a generic fallback message to avoid tipping off a harasser
            twiml.say("The owner is currently unavailable. Thank you for using our service.");
            return res.type('text/xml').send(twiml.toString());
        }

        // Update the temporary session state so it doesn't cross-wire other overlapping callers
        activeSession.capturedFinderNumber = finderPhoneNumber;
        activeSession.sessionStatus = 'connected';
        await activeSession.save();

        // Instruct Twilio to securely bridge to the owner number masking the caller identity
        twiml.say("Connecting you securely to the item owner. Please hold.");
        twiml.dial({
            callerId: process.env.TWILIO_PHONE_NUMBER // Owner only sees your system virtual number
        }, tag.ownerPhoneNumber);

        res.type('text/xml').send(twiml.toString());

    } catch (error) {
        console.error("Inbound Routing Core Failure:", error);
        twiml.say("An internal switching center error occurred. Please try again shortly.");
        res.type('text/xml').send(twiml.toString());
    }
};

// 4. NEW: ANONYMOUS BLOCK VIA SESSION ID (Triggered by the Tag Owner from their app)
exports.blockFinderBySession = async (req, res) => {
    try {
        const { sessionId } = req.body; // Sent from Owner's Flutter Dashboard App

        if (!sessionId) {
            return res.status(400).json({ error: "Session ID is required to execute a block operation." });
        }

        // 1. Locate the historic scan session data
        const session = await ScannedSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ error: "Communication record not found." });
        }

        // Check if a finder phone number was actually captured during this session
        if (!session.capturedFinderNumber) {
            return res.status(400).json({ error: "No active phone carrier interaction was logged for this session." });
        }

        // 2. Secretly append the captured finder number to the owner's tag blacklist array
        // $addToSet ensures the number is only added once, even if clicked multiple times
        const updateResult = await TestTag.updateOne(
            { tagId: session.tagId },
            { $addToSet: { blockedNumbers: session.capturedFinderNumber } }
        );

        // 3. Mark the session as completed/closed
        session.sessionStatus = 'completed';
        await session.save();

        res.status(200).json({
            success: true,
            message: "The finder has been blocked anonymously. They can no longer route calls to this tag."
        });

    } catch (error) {
        console.error("Anonymous Blocking Error:", error);
        res.status(500).json({ error: error.message });
    }
};

