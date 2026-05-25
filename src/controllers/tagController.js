
const TestTag = require('../models/Tag');
const imagekit = require('../config/imagekit');
const qr = require('qr-image');
const crypto = require('crypto'); // 1. Import Node's built-in crypto module

// Helper Utility: Generates a secure, short, random 6-character alphanumeric slug
const generateSecureSlug = (length = 6) => {
    // Generates random cryptographically strong bytes and converts to hex string
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length)
        .toLowerCase();
};

// DTO Response transformation utility
const toPublicTagDTO = (tag) => {
    const t = tag.toObject ? tag.toObject() : tag;
    return {
        tagId: t.tagId,
        title: t.title,
        category: t.category,
        subCategory: t.subCategory,
        itemImageUrl: t.itemImageUrl ? t.itemImageUrl.url : null,
        itemStatus: t.itemStatus,
        messageForFinder: t.recoveryFeatures?.messageForFinder,
        maskedCallingEnabled: t.recoveryFeatures?.maskedCalling || false,
        maskedMessagingEnabled: t.recoveryFeatures?.maskedMessaging || false,
    };
};

// 1. CREATE TAG (Generates unique secure tag ID, QR automatically, and uploads to ImageKit)
exports.createTag = async (req, res) => {
    try {
        const { title, category, subCategory, description, messageForFinder, maskedCalling, maskedMessaging, itemImageBase64, ownerPhoneNumber } = req.body;

        // 2. CRITICAL CHANGE: If tagId is provided in req.body, use it (cleaned). 
        // If NOT provided, automatically generate a secure unique 6-character slug!
        let tagId = req.body.tagId ? req.body.tagId.toLowerCase().trim() : generateSecureSlug(6);

        // Double check uniqueness just in case of a highly unlikely collision
        let existingTag = await TestTag.findOne({ tagId });
        while (existingTag) {
            tagId = generateSecureSlug(6); // Regenerate if it somehow exists
            existingTag = await TestTag.findOne({ tagId });
        }

        // Explicitly inject the mandatory /scan router directory parameter path segment
        const baseDomain = process.env.PUBLIC_SCAN_BASE_URL.replace(/\/$/, "");
        const targetScanUrl = `${baseDomain}/scan/${tagId}`;

        // Generate QR code PNG into a buffer stream using exact structural encoding specifications
        const qrBuffer = qr.imageSync(targetScanUrl, {
            type: 'png',
            margin: 4,
            size: 10,
            ec_level: 'M',
            mode: 'byte' // Forces binary byte mode, preventing uppercase bugs
        });

        // Upload generated QR buffer directly to ImageKit
        const qrUploadResponse = await imagekit.upload({
            file: qrBuffer,
            fileName: `qr_${tagId}.png`,
            folder: '/smart_tags/qrs'
        });

        // Optional: Handle item image upload via base64 raw string if present
        let finalItemImageUrl = null;
        if (itemImageBase64) {
            const itemUploadResponse = await imagekit.upload({
                file: itemImageBase64,
                fileName: `item_${tagId}.png`,
                folder: '/smart_tags/items'
            });
            finalItemImageUrl = {
                url: itemUploadResponse.url,
                fileId: itemUploadResponse.fileId
            };
        }

        // Build Document
        const newTag = new TestTag({
            tagId,
            title,
            category,
            subCategory,
            description,
            ownerPhoneNumber,
            itemImageUrl: finalItemImageUrl,
            recoveryFeatures: {
                maskedCalling: maskedCalling || false,
                maskedMessaging: maskedMessaging || false,
                messageForFinder: messageForFinder || undefined
            },
            scanUrl: targetScanUrl,
            qrCodeImage: {
                url: qrUploadResponse.url,
                fileId: qrUploadResponse.fileId
            }
        });

        await newTag.save();
        res.status(201).json({ success: true, data: newTag });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. PUBLIC FETCH ENDPOINT (Used directly by your Flutter web application view)
exports.getPublicTag = async (req, res) => {
    try {
        const searchTagId = req.params.tagId.toLowerCase().trim();

        const tag = await TestTag.findOne({ tagId: searchTagId });
        if (!tag) return res.status(404).json({ message: "Tag configuration not found" });

        res.status(200).json(toPublicTagDTO(tag));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

