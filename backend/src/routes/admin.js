const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { createOperationLog } = require('../utils/operationLog');
const enrollmentRoutes = require('./enrollments');
const processWaitlist = enrollmentRoutes.processWaitlist;

const router = express.Router();

router.get('/enrollments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { courseId, status, page = 1, limit = 50 } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (courseId) {
      whereConditions.push(`e.course_id = $${paramIndex}`);
      params.push(parseInt(courseId, 10));
      paramIndex++;
    }

    if (status) {
      if (status === 'refund_pending') {
        whereConditions.push(`e.refund_status = $${paramIndex}`);
        params.push('pending');
      } else {
        whereConditions.push(`e.status = $${paramIndex}`);
        params.push(status);
      }
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM enrollments e ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    params.push(parseInt(limit, 10));
    params.push(offset);

    const result = await db.query(
      `SELECT 
        e.id,
        e.status,
        e.reserved_until,
        e.paid_at,
        e.created_at,
        e.refund_status,
        e.refund_requested_at,
        e.refund_reason,
        u.id as user_id,
        u.username,
        u.email,
        c.id as course_id,
        c.title as course_title
      FROM enrollments e
      JOIN users u ON e.user_id = u.id
      JOIN courses c ON e.course_id = c.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const enrollments = result.rows.map(row => ({
      id: row.id,
      status: row.status,
      reservedUntil: row.reserved_until,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      refundStatus: row.refund_status,
      refundRequestedAt: row.refund_requested_at,
      refundReason: row.refund_reason,
      user: {
        id: row.user_id,
        username: row.username,
        email: row.email
      },
      course: {
        id: row.course_id,
        title: row.course_title
      }
    }));

    res.json({
      enrollments,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (error) {
    console.error('Get admin enrollments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/enrollments/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { courseId, status } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (courseId) {
      whereConditions.push(`e.course_id = $${paramIndex}`);
      params.push(parseInt(courseId, 10));
      paramIndex++;
    }

    if (status) {
      if (status === 'refund_pending') {
        whereConditions.push(`e.refund_status = $${paramIndex}`);
        params.push('pending');
      } else {
        whereConditions.push(`e.status = $${paramIndex}`);
        params.push(status);
      }
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await db.query(
      `SELECT 
        u.username as "用户名",
        u.email as "邮箱",
        c.title as "课程名称",
        e.status as "状态",
        e.refund_status as "退课状态",
        e.refund_requested_at as "退课申请时间",
        e.created_at as "报名时间",
        e.paid_at as "支付时间"
      FROM enrollments e
      JOIN users u ON e.user_id = u.id
      JOIN courses c ON e.course_id = c.id
      ${whereClause}
      ORDER BY e.created_at DESC`,
      params
    );

    function getDisplayStatus(status, refundStatus) {
      if (refundStatus === 'pending') return '退课审核中';
      if (refundStatus === 'approved') return '已退课';
      if (refundStatus === 'rejected') return '已支付(退课被驳回)';
      const statusMap = {
        'pending': '待支付',
        'paid': '已支付',
        'cancelled': '已取消'
      };
      return statusMap[status] || status;
    }

    function formatDate(date) {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(/\//g, '-');
    }

    const headers = ['用户名', '邮箱', '课程名称', '状态', '报名时间', '支付时间', '退课状态', '退课申请时间'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const displayStatus = getDisplayStatus(row['状态'], row['退课状态']);
      const refundStatusText = row['退课状态'] === 'pending' ? '审核中' : 
                              row['退课状态'] === 'approved' ? '已通过' :
                              row['退课状态'] === 'rejected' ? '已驳回' : '-';
      
      const values = [
        `"${row['用户名']}"`,
        `"${row['邮箱']}"`,
        `"${row['课程名称']}"`,
        `"${displayStatus}"`,
        `"${formatDate(row['报名时间'])}"`,
        `"${formatDate(row['支付时间'])}"`,
        `"${refundStatusText}"`,
        `"${formatDate(row['退课申请时间'])}"`
      ];
      csvRows.push(values.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="enrollments.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export enrollments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/waitlists', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { courseId, page = 1, limit = 50 } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (courseId) {
      whereConditions.push(`w.course_id = $${paramIndex}`);
      params.push(parseInt(courseId, 10));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM waitlists w ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    params.push(parseInt(limit, 10));
    params.push(offset);

    const result = await db.query(
      `SELECT 
        w.id,
        w.status,
        w.created_at,
        u.id as user_id,
        u.username,
        u.email,
        c.id as course_id,
        c.title as course_title,
        c.is_active as course_is_active
      FROM waitlists w
      JOIN users u ON w.user_id = u.id
      JOIN courses c ON w.course_id = c.id
      ${whereClause}
      ORDER BY w.created_at ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const getWaitlistPosition = async (courseId, userId) => {
      const positionResult = await db.query(
        `SELECT COUNT(*) as position FROM waitlists 
         WHERE course_id = $1 AND status = 'waiting' AND created_at <= (
           SELECT created_at FROM waitlists WHERE course_id = $1 AND user_id = $2 AND status = 'waiting'
         )`,
        [courseId, userId]
      );
      return parseInt(positionResult.rows[0].position, 10);
    };

    const waitlists = [];
    for (const row of result.rows) {
      const position = row.status === 'waiting' 
        ? await getWaitlistPosition(row.course_id, row.user_id)
        : null;
      
      waitlists.push({
        id: row.id,
        status: row.status,
        position: position,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email
        },
        course: {
          id: row.course_id,
          title: row.course_title,
          isActive: row.course_is_active
        }
      });
    }

    res.json({
      waitlists,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (error) {
    console.error('Get admin waitlists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/waitlists/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { courseId } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (courseId) {
      whereConditions.push(`w.course_id = $${paramIndex}`);
      params.push(parseInt(courseId, 10));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    const result = await db.query(
      `SELECT 
        w.id,
        w.status,
        w.created_at,
        u.id as user_id,
        u.username,
        u.email,
        c.id as course_id,
        c.title as course_title,
        c.is_active as course_is_active
      FROM waitlists w
      JOIN users u ON w.user_id = u.id
      JOIN courses c ON w.course_id = c.id
      ${whereClause}
      ORDER BY w.created_at ASC`,
      params
    );

    const getWaitlistPosition = async (courseId, userId) => {
      const positionResult = await db.query(
        `SELECT COUNT(*) as position FROM waitlists 
         WHERE course_id = $1 AND status = 'waiting' AND created_at <= (
           SELECT created_at FROM waitlists WHERE course_id = $1 AND user_id = $2 AND status = 'waiting'
         )`,
        [courseId, userId]
      );
      return parseInt(positionResult.rows[0].position, 10);
    };

    function formatDate(date) {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).replace(/\//g, '-');
    }

    const headers = ['用户名', '邮箱', '课程名称', '排队顺位', '加入时间', '课程状态'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const position = row.status === 'waiting' 
        ? await getWaitlistPosition(row.course_id, row.user_id)
        : '-';
      
      const values = [
        `"${row.username}"`,
        `"${row.email}"`,
        `"${row.course_title}"`,
        `"${position}"`,
        `"${formatDate(row.created_at)}"`,
        `"${row.course_is_active ? '招生中' : '已关闭'}"`
      ];
      csvRows.push(values.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="waitlists.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export waitlists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/refund/approve', authenticateToken, requireAdmin, async (req, res) => {
  const enrollmentId = parseInt(req.params.enrollmentId, 10);
  const adminId = req.user.id;

  try {
    const enrollmentResult = await db.query(
      `SELECT e.*, c.title, c.start_date 
       FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE e.id = $1`,
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.refund_status !== 'pending') {
      return res.status(400).json({ error: 'No pending refund request for this enrollment' });
    }

    const { getRedisClient } = require('../db/redis');

    await db.query('BEGIN');

    await db.query(
      `UPDATE enrollments 
       SET status = 'cancelled', 
           refund_status = 'approved',
           reserved_until = NULL
       WHERE id = $1`,
      [enrollmentId]
    );

    await db.query(
      'UPDATE courses SET enrolled_count = enrolled_count - 1 WHERE id = $1',
      [enrollment.course_id]
    );

    await db.query('COMMIT');

    await createOperationLog(
      adminId,
      'refund_approved',
      enrollment.course_id,
      enrollmentId,
      `通过退课申请：${enrollment.title}`
    );

    const promotedUsers = await processWaitlist(enrollment.course_id);

    await createNotification(
      enrollment.user_id,
      'refund_approved',
      `退课申请已通过：${enrollment.title}`,
      `您的「${enrollment.title}」退课申请已通过，名额已释放。`,
      enrollment.course_id
    );

    res.json({ 
      message: 'Refund approved successfully',
      promotedUsers: promotedUsers || []
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Approve refund error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/operation-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { courseId, page = 1, limit = 50 } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (courseId) {
      whereConditions.push(`ol.course_id = $${paramIndex}`);
      params.push(parseInt(courseId, 10));
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM operation_logs ol ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    params.push(parseInt(limit, 10));
    params.push(offset);

    const result = await db.query(
      `SELECT 
        ol.id,
        ol.action_type,
        ol.target_id,
        ol.summary,
        ol.created_at,
        u.id as admin_id,
        u.username as admin_username,
        c.id as course_id,
        c.title as course_title,
        c.is_active as course_is_active
      FROM operation_logs ol
      JOIN users u ON ol.admin_id = u.id
      LEFT JOIN courses c ON ol.course_id = c.id
      ${whereClause}
      ORDER BY ol.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    const logs = result.rows.map(row => ({
      id: row.id,
      actionType: row.action_type,
      targetId: row.target_id,
      summary: row.summary,
      createdAt: row.created_at,
      admin: {
        id: row.admin_id,
        username: row.admin_username
      },
      course: row.course_id ? {
        id: row.course_id,
        title: row.course_title,
        isActive: row.course_is_active
      } : null
    }));

    res.json({
      logs,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10))
    });
  } catch (error) {
    console.error('Get operation logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/refund/reject', authenticateToken, requireAdmin, async (req, res) => {
  const enrollmentId = parseInt(req.params.enrollmentId, 10);
  const adminId = req.user.id;
  const { reason } = req.body;

  try {
    const enrollmentResult = await db.query(
      `SELECT e.*, c.title 
       FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE e.id = $1`,
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.refund_status !== 'pending') {
      return res.status(400).json({ error: 'No pending refund request for this enrollment' });
    }

    await db.query(
      `UPDATE enrollments 
       SET refund_status = 'rejected',
           refund_reason = COALESCE($1, refund_reason)
       WHERE id = $2`,
      [reason, enrollmentId]
    );

    await createOperationLog(
      adminId,
      'refund_rejected',
      enrollment.course_id,
      enrollmentId,
      `驳回退课申请：${enrollment.title}${reason ? `，原因：${reason}` : ''}`
    );

    await createNotification(
      enrollment.user_id,
      'refund_rejected',
      `退课申请被驳回：${enrollment.title}`,
      `您的「${enrollment.title}」退课申请已被驳回${reason ? `，原因：${reason}` : ''}。`,
      enrollment.course_id
    );

    res.json({ message: 'Refund rejected successfully' });
  } catch (error) {
    console.error('Reject refund error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
