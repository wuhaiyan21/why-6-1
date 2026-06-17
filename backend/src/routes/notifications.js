const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

async function createNotification(userId, type, title, content, courseId = null) {
  const result = await db.query(
    `INSERT INTO notifications (user_id, type, title, content, course_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, type, title, content, courseId]
  );
  return result.rows[0];
}

async function createCourseTimeChangeNotification(courseId, oldStartDate, newStartDate) {
  const courseResult = await db.query(
    'SELECT title FROM courses WHERE id = $1',
    [courseId]
  );

  if (courseResult.rows.length === 0) {
    return;
  }

  const courseTitle = courseResult.rows[0].title;

  const enrollmentsResult = await db.query(
    `SELECT DISTINCT user_id FROM enrollments 
     WHERE course_id = $1 AND status IN ('paid', 'pending')`,
    [courseId]
  );

  function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const title = `课程时间变更通知：${courseTitle}`;
  const content = `课程「${courseTitle}」的开课时间已变更。\n原时间：${formatDate(oldStartDate)}\n新时间：${formatDate(newStartDate)}`;

  for (const enrollment of enrollmentsResult.rows) {
    await createNotification(
      enrollment.user_id,
      'course_time_change',
      title,
      content,
      courseId
    );
  }

  return enrollmentsResult.rows.length;
}

router.get('/notifications', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { unreadOnly } = req.query;

  try {
    let query = `
      SELECT 
        id,
        type,
        title,
        content,
        course_id,
        is_read,
        created_at
      FROM notifications 
      WHERE user_id = $1
    `;
    const params = [userId];

    if (unreadOnly === 'true') {
      query += ' AND is_read = false';
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const result = await db.query(query, params);

    const notifications = result.rows.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      content: n.content,
      courseId: n.course_id,
      isRead: n.is_read,
      createdAt: n.created_at
    }));

    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/notifications/unread-count', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({ unreadCount: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const notificationId = parseInt(req.params.id, 10);

  try {
    const result = await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
module.exports.createCourseTimeChangeNotification = createCourseTimeChangeNotification;
