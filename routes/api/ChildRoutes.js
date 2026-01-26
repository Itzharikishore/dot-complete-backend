const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const User = require('../../models/User');
const Activity = require('../../models/Activity');
const ActivityAssignment = require('../../models/ActivityAssignment');

// ==================== MIDDLEWARE ====================
const { protect } = require('../../middleware/auth');
const { handleValidationErrors } = require('../../middleware/validation');

// ==================== CHILD ACTIVITIES ====================

/**
 * @swagger
 * /api/child/activities:
 *   get:
 *     tags:
 *       - Child - Activities
 *     summary: Get all assigned activities for a child
 *     description: Retrieves all active activities assigned to the authenticated child with full details
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved activities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 data:
 *                   type: array
 *       403:
 *         description: Forbidden - User is not a child
 *       500:
 *         description: Server error
 */
router.get('/activities', protect, async (req, res) => {
  try {
    const childId = req.user.id;

    if (req.user.role !== 'child') {
      return res.status(403).json({
        success: false,
        message: 'Only children can access this endpoint'
      });
    }

    const assignments = await ActivityAssignment.find({
      childId,
      isActive: true
    })
      .populate({
        path: 'activityId',
        select: 'name description steps assistance mediaUrls dueDate createdAt'
      })
      .sort({ createdAt: -1 });

    const activities = assignments.map(assignment => ({
      assignmentId: assignment._id,
      activityId: assignment.activityId._id,
      name: assignment.activityId.name,
      description: assignment.activityId.description,
      steps: assignment.activityId.steps,
      assistance: assignment.activityId.assistance,
      mediaUrls: assignment.activityId.mediaUrls,
      dueDate: assignment.activityId.dueDate,
      completionStatus: assignment.getEffectiveStatus(),
      score: assignment.score,
      completionVideoUrl: assignment.completionVideoUrl,
      startedDate: assignment.startedDate,
      completedDate: assignment.completedDate,
      isOverdue: assignment.isOverdue()
    }));

    res.status(200).json({
      success: true,
      total: activities.length,
      data: activities
    });
  } catch (error) {
    console.error('Error fetching child activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activities',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/child/activities/{assignmentId}/submit:
 *   put:
 *     tags:
 *       - Child - Activities
 *     summary: Submit completed activity with video proof
 *     description: Marks an activity as completed with video URL and optional score
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The activity assignment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - completionVideoUrl
 *             properties:
 *               completionVideoUrl:
 *                 type: string
 *                 format: url
 *               score:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Activity submitted successfully
 *       400:
 *         description: Invalid URL or activity already completed
 *       403:
 *         description: Forbidden - User is not a child
 *       404:
 *         description: Activity assignment not found
 *       500:
 *         description: Server error
 */
router.put('/activities/:assignmentId/submit', protect, [
  body('completionVideoUrl').isURL().withMessage('Valid video URL is required'),
  body('score').optional().isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
  handleValidationErrors
], async (req, res) => {
  try {
    const childId = req.user.id;
    const { assignmentId } = req.params;
    const { completionVideoUrl, score } = req.body;

    if (req.user.role !== 'child') {
      return res.status(403).json({
        success: false,
        message: 'Only children can submit activities'
      });
    }

    const assignment = await ActivityAssignment.findOne({
      _id: assignmentId,
      childId,
      isActive: true
    }).populate('activityId', 'name');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Activity assignment not found'
      });
    }

    if (assignment.completionStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Activity already completed'
      });
    }

    const updatedAssignment = await ActivityAssignment.findByIdAndUpdate(
      assignmentId,
      {
        completionStatus: 'completed',
        completionVideoUrl,
        score: score || null,
        completedDate: new Date(),
        startedDate: assignment.startedDate || new Date()
      },
      { new: true, runValidators: false }
    ).populate('activityId', 'name');

    res.status(200).json({
      success: true,
      message: 'Activity submitted successfully',
      data: {
        assignmentId: updatedAssignment._id,
        activityName: updatedAssignment.activityId.name,
        completionStatus: updatedAssignment.completionStatus,
        completionVideoUrl: updatedAssignment.completionVideoUrl,
        score: updatedAssignment.score,
        completedDate: updatedAssignment.completedDate
      }
    });
  } catch (error) {
    console.error('Error submitting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting activity',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/child/activities/{assignmentId}/start:
 *   put:
 *     tags:
 *       - Child - Activities
 *     summary: Start an activity
 *     description: Marks an activity as in-progress and records the start date
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: The activity assignment ID
 *     responses:
 *       200:
 *         description: Activity started successfully
 *       400:
 *         description: Activity is already in progress or completed
 *       403:
 *         description: Forbidden - User is not a child
 *       404:
 *         description: Activity assignment not found
 *       500:
 *         description: Server error
 */
router.put('/activities/:assignmentId/start', protect, async (req, res) => {
  try {
    const childId = req.user.id;
    const { assignmentId } = req.params;

    if (req.user.role !== 'child') {
      return res.status(403).json({
        success: false,
        message: 'Only children can start activities'
      });
    }

    const assignment = await ActivityAssignment.findOne({
      _id: assignmentId,
      childId,
      isActive: true
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Activity assignment not found'
      });
    }

    if (assignment.completionStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Activity is already in progress or completed'
      });
    }

    const updatedAssignment = await ActivityAssignment.findByIdAndUpdate(
      assignmentId,
      {
        completionStatus: 'in-progress',
        startedDate: new Date()
      },
      { new: true, runValidators: false }
    ).populate('activityId', 'name');

    res.status(200).json({
      success: true,
      message: 'Activity started',
      data: {
        assignmentId: updatedAssignment._id,
        activityName: updatedAssignment.activityId.name,
        completionStatus: updatedAssignment.completionStatus,
        startedDate: updatedAssignment.startedDate
      }
    });
  } catch (error) {
    console.error('Error starting activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting activity',
      error: error.message
    });
  }
});

// ==================== CHILD REPORTS ====================

/**
 * @swagger
 * /api/child/report:
 *   get:
 *     tags:
 *       - Child - Report
 *     summary: Get child's personal progress report
 *     description: Retrieves authenticated child's progress report showing activity completion status, scores, and performance metrics
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved child progress report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     childId:
 *                       type: string
 *                     childName:
 *                       type: string
 *                     childEmail:
 *                       type: string
 *                     totalActivities:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     inProgress:
 *                       type: integer
 *                     notCompleted:
 *                       type: integer
 *                     completionPercentage:
 *                       type: integer
 *                       example: 60
 *                     averageScore:
 *                       type: number
 *                       example: 85
 *                     activities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           assignmentId:
 *                             type: string
 *                           activityName:
 *                             type: string
 *                           completionStatus:
 *                             type: string
 *                           score:
 *                             type: number
 *                           completedDate:
 *                             type: string
 *                             format: date-time
 *       403:
 *         description: Forbidden - User is not a child
 *       500:
 *         description: Server error
 */
router.get('/report', protect, async (req, res) => {
  try {
    const childId = req.user.id;

    if (req.user.role !== 'child') {
      return res.status(403).json({
        success: false,
        message: 'Only children can access this endpoint'
      });
    }

    // Auto-mark overdue pending/in-progress assignments as not-completed
    await ActivityAssignment.markOverduePending();

    // Get child's basic info
    const child = await User.findById(childId).select('Name email');

    if (!child) {
      return res.status(404).json({
        success: false,
        message: 'Child profile not found'
      });
    }

    // Get all active assignments for the child
    const assignments = await ActivityAssignment.find({
      childId,
      isActive: true
    })
      .populate('activityId', 'name dueDate')
      .sort({ createdAt: -1 });

    // Calculate statistics using effective status (accounts for overdue)
    const completed = assignments.filter(a => a.getEffectiveStatus() === 'completed').length;
    const pending = assignments.filter(a => a.getEffectiveStatus() === 'pending').length;
    const inProgress = assignments.filter(a => a.getEffectiveStatus() === 'in-progress').length;
    const notCompleted = assignments.filter(a => a.getEffectiveStatus() === 'not-completed').length;
    const totalActivities = assignments.length;
    const completionPercentage = totalActivities > 0 ? Math.round((completed / totalActivities) * 100) : 0;
    const averageScore = assignments.length > 0 
      ? Math.round(assignments.reduce((sum, a) => sum + (a.score || 0), 0) / assignments.length)
      : 0;

    // Map activity details
    const activities = assignments.map(assignment => ({
      assignmentId: assignment._id,
      activityName: assignment.activityId?.name || 'Unknown Activity',
      completionStatus: assignment.getEffectiveStatus(),
      score: assignment.score || null,
      dueDate: assignment.activityId?.dueDate || null,
      completedDate: assignment.completedDate,
      startedDate: assignment.startedDate,
      isOverdue: assignment.isOverdue()
    }));

    res.status(200).json({
      success: true,
      data: {
        childId,
        childName: child.Name,
        childEmail: child.email,
        totalActivities,
        completed,
        pending,
        inProgress,
        notCompleted,
        completionPercentage,
        averageScore,
        activities
      }
    });
  } catch (error) {
    console.error('Error fetching child report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report',
      error: error.message
    });
  }
});

module.exports = router;
