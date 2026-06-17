const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

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
      whereConditions.push(`e.status = $${paramIndex}`);
      params.push(status);
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
      whereConditions.push(`e.status = $${paramIndex}`);
      params.push(status);
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
        CASE e.status 
          WHEN 'pending' THEN '待支付'
          WHEN 'paid' THEN '已支付'
          WHEN 'cancelled' THEN '已取消'
          ELSE e.status
        END as "状态",
        e.created_at as "报名时间",
        e.paid_at as "支付时间"
      FROM enrollments e
      JOIN users u ON e.user_id = u.id
      JOIN courses c ON e.course_id = c.id
      ${whereClause}
      ORDER BY e.created_at DESC`,
      params
    );

    const statusMap = {
      'pending': '待支付',
      'paid': '已支付',
      'cancelled': '已取消'
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

    const headers = ['用户名', '邮箱', '课程名称', '状态', '报名时间', '支付时间'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const values = [
        `"${row['用户名']}"`,
        `"${row['邮箱']}"`,
        `"${row['课程名称']}"`,
        `"${row['状态']}"`,
        `"${formatDate(row['报名时间'])}"`,
        `"${formatDate(row['支付时间'])}"`
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

module.exports = router;
