const fs = require('fs');
const content = fs.readFileSync('routes/api/AdminRoutes.js', 'utf8');

const newEndpoints = `
// ==================== UNASSIGNED CHILDREN MANAGEMENT ====================

/**
 * @swagger
 * /api/admin/children/unassigned:
 *   get:
 *     summary: Get all unassigned children (without therapist)
 *     tags: [Admin - Children]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of unassigned children with total count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: number
 *                   description: Total number of unassigned children
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 */
router.get('/children/unassigned', protect, async (req, res) => {
  try {
    const unassignedChildren = await User.find({ 
      role: 'child', 
      isActive: true, 
      assignedTherapist: null 
    })
      .select('-password -passwordResetToken -emailVerificationToken')
      .sort({ createdAt: -1 });
    
    const total = await User.countDocuments({ 
      role: 'child', 
      isActive: true, 
      assignedTherapist: null 
    });

    res.status(200).json({
      success: true,
      total,
      count: unassignedChildren.length,
      data: unassignedChildren
    });
  } catch (error) {
    console.error('Error fetching unassigned children:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unassigned children',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/children/{id}/assign-therapist:
 *   put:
 *     summary: Assign a therapist to a child
 *     tags: [Admin - Children]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Child ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - therapistId
 *             properties:
 *               therapistId:
 *                 type: string
 *                 description: ID of the therapist to assign
 *           example:
 *             therapistId: 60d5ec49c1234567890abcde
 *     responses:
 *       200:
 *         description: Therapist assigned successfully
 *       404:
 *         description: Child or therapist not found
 */
router.put('/children/:id/assign-therapist', protect, [
  body('therapistId').notEmpty().withMessage('Therapist ID is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { therapistId } = req.body;

    // Find child
    const child = await User.findById(id);
    if (!child || child.role !== 'child') {
      return res.status(404).json({
        success: false,
        message: 'Child not found'
      });
    }

    // Find therapist
    const therapist = await User.findById(therapistId);
    if (!therapist || therapist.role !== 'therapist') {
      return res.status(404).json({
        success: false,
        message: 'Therapist not found'
      });
    }

    // Update child's assigned therapist
    child.assignedTherapist = therapistId;
    await child.save();

    // Populate therapist details for response
    await child.populate('assignedTherapist', 'Name email specialization qualification');

    res.status(200).json({
      success: true,
      message: 'Therapist assigned successfully',
      data: {
        id: child._id,
        name: child.Name,
        email: child.email,
        role: child.role,
        assignedTherapist: child.assignedTherapist
      }
    });
  } catch (error) {
    console.error('Error assigning therapist:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning therapist',
      error: error.message
    });
  }
});
`;

const insertPoint = '// ==================== USER MANAGEMENT ====================';
const modified = content.replace(insertPoint, newEndpoints + insertPoint);

fs.writeFileSync('routes/api/AdminRoutes.js', modified);
console.log('✅ New endpoints added successfully');
