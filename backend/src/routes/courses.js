const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { createCourseTimeChangeNotification } = require('./notifications');
const { createOperationLog } = require('../utils/operationLog');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

function getOptionalUser(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;

  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  try {
    const user = getOptionalUser(req);
    const isAdmin = user && user.isAdmin;
    const includeInactive = isAdmin && req.query.includeInactive === 'true';
    const { search, sort = 'asc' } = req.query;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (!includeInactive) {
      whereConditions.push(`c.is_active = true`);
    }

    if (search) {
      whereConditions.push(`c.title ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const sortOrder = sort === 'desc' ? 'DESC' : 'ASC';

    const result = await db.query(`
      SELECT 
        c.*,
        (c.capacity - c.enrolled_count) as remaining_slots
      FROM courses c
      ${whereClause}
      ORDER BY c.start_date ${sortOrder}
    `, params);

    const courses = result.rows.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      capacity: course.capacity,
      enrolledCount: course.enrolled_count,
      remainingSlots: course.remaining_slots,
      startDate: course.start_date,
      isActive: course.is_active,
      createdAt: course.created_at,
    }));

    res.json(courses);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const courseResult = await db.query(`
      SELECT 
        c.*,
        (c.capacity - c.enrolled_count) as remaining_slots
      FROM courses c
      WHERE c.id = $1
    `, [id]);

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courseResult.rows[0];

    const prereqResult = await db.query(`
      SELECT p.id, p.title, p.description
      FROM prerequisites pr
      JOIN courses p ON pr.prerequisite_id = p.id
      WHERE pr.course_id = $1
    `, [id]);

    res.json({
      id: course.id,
      title: course.title,
      description: course.description,
      capacity: course.capacity,
      enrolledCount: course.enrolled_count,
      remainingSlots: course.remaining_slots,
      startDate: course.start_date,
      isActive: course.is_active,
      prerequisites: prereqResult.rows,
      createdAt: course.created_at,
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, capacity, startDate, prerequisites = [] } = req.body;

    if (!title || !capacity || !startDate) {
      return res.status(400).json({ error: 'Title, capacity, and start date are required' });
    }

    const result = await db.query(
      `INSERT INTO courses (title, description, capacity, start_date) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title, description, capacity, startDate]
    );

    const course = result.rows[0];

    for (const prereqId of prerequisites) {
      await db.query(
        'INSERT INTO prerequisites (course_id, prerequisite_id) VALUES ($1, $2)',
        [course.id, prereqId]
      );
    }

    res.status(201).json({
      id: course.id,
      title: course.title,
      description: course.description,
      capacity: course.capacity,
      enrolledCount: course.enrolled_count,
      remainingSlots: course.capacity,
      startDate: course.start_date,
      isActive: course.is_active,
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { title, description, capacity, startDate, isActive, prerequisites } = req.body;

    const existingCourse = await db.query('SELECT * FROM courses WHERE id = $1', [id]);
    if (existingCourse.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = existingCourse.rows[0];
    const oldStartDate = course.start_date;
    const oldCapacity = course.capacity;
    const oldIsActive = course.is_active;

    if (capacity !== undefined && capacity !== null) {
      const newCapacity = parseInt(capacity, 10);
      if (isNaN(newCapacity) || newCapacity < course.enrolled_count) {
        return res.status(400).json({ 
          error: `Capacity cannot be less than current enrolled count (${course.enrolled_count})` 
        });
      }
    }

    const result = await db.query(
      `UPDATE courses 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           capacity = COALESCE($3, capacity),
           start_date = COALESCE($4, start_date),
           is_active = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [title, description, capacity, startDate, isActive, id]
    );

    if (prerequisites) {
      await db.query('DELETE FROM prerequisites WHERE course_id = $1', [id]);
      for (const prereqId of prerequisites) {
        if (prereqId != id) {
          await db.query(
            'INSERT INTO prerequisites (course_id, prerequisite_id) VALUES ($1, $2)',
            [id, prereqId]
          );
        }
      }
    }

    const updatedCourse = result.rows[0];

    if (capacity !== undefined && capacity !== null) {
      const newCapacity = parseInt(capacity, 10);
      if (oldCapacity !== newCapacity) {
        await createOperationLog(
          adminId,
          'capacity_changed',
          parseInt(id, 10),
          null,
          `调整名额：${course.title}，名额从 ${oldCapacity} 调整为 ${newCapacity}`
        );
      }
    }

    if (isActive !== undefined && isActive !== null) {
      if (oldIsActive !== isActive) {
        await createOperationLog(
          adminId,
          isActive ? 'enrollment_reopened' : 'enrollment_closed',
          parseInt(id, 10),
          null,
          isActive ? `重新开放招生：${course.title}` : `关闭招生：${course.title}`
        );
      }
    }

    if (startDate !== undefined && startDate !== null) {
      const newStartDate = new Date(startDate);
      if (new Date(oldStartDate).getTime() !== newStartDate.getTime()) {
        await createCourseTimeChangeNotification(id, oldStartDate, newStartDate);
      }
    }

    res.json({
      id: updatedCourse.id,
      title: updatedCourse.title,
      description: updatedCourse.description,
      capacity: updatedCourse.capacity,
      enrolledCount: updatedCourse.enrolled_count,
      remainingSlots: updatedCourse.capacity - updatedCourse.enrolled_count,
      startDate: updatedCourse.start_date,
      isActive: updatedCourse.is_active,
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM courses WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/close', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const result = await db.query(
      'UPDATE courses SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = result.rows[0];

    await createOperationLog(
      adminId,
      'enrollment_closed',
      parseInt(id, 10),
      null,
      `关闭招生：${course.title}`
    );

    res.json({ message: 'Course enrollment closed successfully' });
  } catch (error) {
    console.error('Close course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/reopen', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    const result = await db.query(
      'UPDATE courses SET is_active = true WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = result.rows[0];

    await createOperationLog(
      adminId,
      'enrollment_reopened',
      parseInt(id, 10),
      null,
      `重新开放招生：${course.title}`
    );

    res.json({ message: 'Course enrollment reopened successfully' });
  } catch (error) {
    console.error('Reopen course error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
