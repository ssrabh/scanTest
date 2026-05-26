const multer = require('multer');
const TestTag = require('../models/Tag');
const imagekit = require('../config/imagekit');
const qr = require('qr-image');
const crypto = require('crypto');

// Helper Utility: Generates a secure, short, random 6-character alphanumeric slug
const generateSecureSlug = (length = 6) => {
    return crypto.randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length)
        .toLowerCase();
};

// DTO Response transformation utility for public views
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

// Multer Memory Storage Config for Multi-part form data uploads (smartphone gallery)
const storage = multer.memoryStorage();
exports.uploadMiddleware = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB File size limit guard rail
}).single('itemImage');



// ==========================================
// 1. CREATE TAG (Automatic QR Gen & Save with Binary File Support)
// ==========================================
exports.createTag = async (req, res) => {
    try {
        const {
            title,
            category,
            subCategory,
            description,
            messageForFinder,
            maskedCalling,
            maskedMessaging,
            ownerPhoneNumber
        } = req.body;

        // Auto-generate clean 6-character secure tag slug
        let tagId = req.body.tagId ? req.body.tagId.toLowerCase().trim() : generateSecureSlug(6);

        // Deduplication loop to protect index integrity
        let existingTag = await TestTag.findOne({ tagId });
        while (existingTag) {
            tagId = generateSecureSlug(6);
            existingTag = await TestTag.findOne({ tagId });
        }

        const baseDomain = process.env.PUBLIC_SCAN_BASE_URL.replace(/\/$/, "");
        const targetScanUrl = `${baseDomain}/scan/${tagId}`;

        // Build QR Buffer natively using binary safe configurations
        const qrBuffer = qr.imageSync(targetScanUrl, {
            type: 'png',
            margin: 4,
            size: 10,
            ec_level: 'M',
            mode: 'byte'
        });

        // Ship QR graphic to ImageKit Cloud
        const qrUploadResponse = await imagekit.upload({
            file: qrBuffer,
            fileName: `qr_${tagId}.png`,
            folder: '/smart_tags/qrs'
        });

        // 🌟 FIX: Check for the binary file stream via req.file instead of a base64 string
        let finalItemImageUrl = null;
        if (req.file) {
            const itemUploadResponse = await imagekit.upload({
                file: req.file.buffer, // Read directly from multer's memory buffer
                fileName: `item_${tagId}.png`,
                folder: '/smart_tags/items'
            });
            finalItemImageUrl = {
                url: itemUploadResponse.url,
                fileId: itemUploadResponse.fileId
            };
        }

        const newTag = new TestTag({
            tagId,
            title,
            category,
            subCategory,
            description,
            ownerPhoneNumber,
            itemImageUrl: finalItemImageUrl, // Will attach the upload object details cleanly
            recoveryFeatures: {
                maskedCalling: maskedCalling === 'true' || maskedCalling === true,
                maskedMessaging: maskedMessaging === 'true' || maskedMessaging === true,
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
        res.status(500).json({ success: false, error: error.message });
    }
};


// ==========================================
// 2. PUBLIC FETCH ENDPOINT (Used by Scanner View)
// ==========================================
exports.getPublicTag = async (req, res) => {
    try {
        const searchTagId = req.params.tagId.toLowerCase().trim();

        const tag = await TestTag.findOne({ tagId: searchTagId });
        if (!tag) return res.status(404).json({ success: false, message: "Tag configuration not found" });

        res.status(200).json(toPublicTagDTO(tag));
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ==========================================
// 3. UPDATE TAG DETAILS (Fast Textual Field Changes)
// ==========================================
exports.updateTag = async (req, res) => {
    try {
        const updateTagId = req.params.tagId.toLowerCase().trim();
        const {
            title,
            description,
            itemStatus,
            messageForFinder,
            maskedCalling,
            maskedMessaging,
            ownerPhoneNumber
        } = req.body;

        const tag = await TestTag.findOne({ tagId: updateTagId });
        if (!tag) {
            return res.status(404).json({ success: false, message: "Tag configuration not found" });
        }

        // Apply string field changes smoothly
        if (title !== undefined) tag.title = title;
        if (description !== undefined) tag.description = description;
        if (itemStatus !== undefined) tag.itemStatus = itemStatus;
        if (ownerPhoneNumber !== undefined) tag.ownerPhoneNumber = ownerPhoneNumber;

        // Update nested structures without loss of sibling variables
        if (!tag.recoveryFeatures) tag.recoveryFeatures = {};
        if (messageForFinder !== undefined) tag.recoveryFeatures.messageForFinder = messageForFinder;
        if (maskedCalling !== undefined) tag.recoveryFeatures.maskedCalling = maskedCalling;
        if (maskedMessaging !== undefined) tag.recoveryFeatures.maskedMessaging = maskedMessaging;

        await tag.save();
        res.status(200).json({ success: true, message: "Metadata modifications stored successfully", data: tag });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};


// ==========================================
// 4. DEDICATED IMAGE UPLOAD (Gallery File Stream)
// ==========================================
exports.uploadItemImage = async (req, res) => {
    try {
        const { tagId } = req.params;
        const cleanTagId = tagId.toLowerCase().trim();

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image binary file payload attached" });
        }

        const tag = await TestTag.findOne({ tagId: cleanTagId });
        if (!tag) {
            return res.status(404).json({ success: false, message: "Tag configuration not found" });
        }

        // Clean up step: Remove obsolete file entry from cloud space to mitigate bloat
        if (tag.itemImageUrl && tag.itemImageUrl.fileId) {
            try {
                await imagekit.deleteFile(tag.itemImageUrl.fileId);
            } catch (deleteError) {
                console.warn("Storage engine cleanup skipped:", deleteError.message);
            }
        }

        // Upload the direct incoming binary data stream
        const uploadResponse = await imagekit.upload({
            file: req.file.buffer,
            fileName: `gallery_item_${cleanTagId}.png`,
            folder: '/smart_tags/items'
        });

        // Map fresh structural paths directly onto database records
        tag.itemImageUrl = {
            url: uploadResponse.url,
            fileId: uploadResponse.fileId
        };

        await tag.save();

        res.status(200).json({
            success: true,
            message: "Gallery media file linked successfully",
            data: {
                itemImageUrl: tag.itemImageUrl.url,
                fileId: tag.itemImageUrl.fileId
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};