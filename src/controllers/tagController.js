const TestTag = require('../models/Tag');
const imagekit = require('../config/imagekit');
const qr = require('qr-image');

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

// 1. CREATE TAG (Generates QR automatically and uploads to ImageKit)
exports.createTag = async (req, res) => {
    try {
        const { tagId, title, category, subCategory, description, messageForFinder, maskedCalling, maskedMessaging, itemImageBase64 } = req.body;

        // Check if tagId already exists
        const existingTag = await TestTag.findOne({ tagId });
        if (existingTag) return res.status(400).json({ error: "Tag ID already taken" });

        const targetScanUrl = `${process.env.PUBLIC_SCAN_BASE_URL}/${tagId}`;

        // Generate QR code PNG into a buffer stream
        const qrBuffer = qr.imageSync(targetScanUrl, { type: 'png', margin: 2 });

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
                file: itemImageBase64, // Base64 string format data
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
        const tag = await TestTag.findOne({ tagId: req.params.tagId });
        if (!tag) return res.status(404).json({ message: "Tag configuration not found" });

        res.status(200).json(toPublicTagDTO(tag));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};