const express = require('express');
const router = express.Router();
const FeedbackController = require('../controllers/FeedbackController');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
});

// Public route to get approved feedback
router.get('/approved', FeedbackController.getApprovedFeedback);
router.get('/product/:productId', FeedbackController.getProductFeedback);

// Protected route to submit feedback
router.post('/submit', authMiddleware, upload.array('images', 5), FeedbackController.submitFeedback);

// Admin routes
router.get('/pending', authMiddleware, adminMiddleware, FeedbackController.getPendingFeedback);
router.put('/approve/:id', authMiddleware, adminMiddleware, FeedbackController.approveFeedback);
router.delete('/:id', authMiddleware, adminMiddleware, FeedbackController.deleteFeedback);

module.exports = router;
