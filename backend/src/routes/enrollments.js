const express = require('express');
const db = require('../db');
const { getRedisClient } = require('../db/redis');
const { authenticateToken } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

const RESERVATION_DURATION = parseInt(process.env.RESERVATION_DURATION || '900', 10);

function getReservationKey(courseId, userId) {
  return `reservation:course:${courseId}:user:${userId}`;
}

function getCourseLockKey(courseId) {
  return `lock:course:${courseId}`;
}

async function checkPrerequisites(userId, courseId) {
  const prereqResult = await db.query(
    `SELECT prerequisite_id FROM prerequisites WHERE course_id = $1`,
    [courseId]
  );

  if (prereqResult.rows.length === 0) {
    return { met: true, missing: [] };
  }

  const prereqIds = prereqResult.rows.map(r => r.prerequisite_id);

  const completedResult = await db.query(
    `SELECT course_id FROM enrollments 
     WHERE user_id = $1 AND course_id = ANY($2::int[]) 
     AND status = 'paid' AND attended = true`,
    [userId, prereqIds]
  );

  const completedIds = completedResult.rows.map(r => r.course_id);
  const missingIds = prereqIds.filter(id => !completedIds.includes(id));

  if (missingIds.length === 0) {
    return { met: true, missing: [] };
  }

  const missingCoursesResult = await db.query(
    `SELECT id, title FROM courses WHERE id = ANY($1::int[])`,
    [missingIds]
  );

  const missingWithStatus = missingCoursesResult.rows.map(course => {
    return { ...course, reason: 'not_attended' };
  });

  return { met: false, missing: missingWithStatus };
}

async function getWaitlistPosition(courseId, userId) {
  const result = await db.query(
    `SELECT COUNT(*) as position FROM waitlists 
     WHERE course_id = $1 AND status = 'waiting' AND created_at <= (
       SELECT created_at FROM waitlists WHERE course_id = $1 AND user_id = $2 AND status = 'waiting'
     )`,
    [courseId, userId]
  );
  return parseInt(result.rows[0].position, 10);
}

async function getWaitlistCount(courseId) {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM waitlists WHERE course_id = $1 AND status = 'waiting'`,
    [courseId]
  );
  return parseInt(result.rows[0].count, 10);
}

async function processWaitlist(courseId) {
  const client = getRedisClient();
  const lockKey = getCourseLockKey(courseId);

  const lockAcquired = await client.set(lockKey, 'locked', {
    NX: true,
    EX: 10
  });

  if (!lockAcquired) {
    return null;
  }

  try {
    const courseResult = await db.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return null;
    }

    const course = courseResult.rows[0];
    const availableSlots = course.capacity - course.enrolled_count;

    if (availableSlots <= 0) {
      return null;
    }

    const waitlistResult = await db.query(
      `SELECT * FROM waitlists 
       WHERE course_id = $1 AND status = 'waiting' 
       ORDER BY created_at ASC LIMIT $2`,
      [courseId, availableSlots]
    );

    const promotedUsers = [];

    for (const waitlistEntry of waitlistResult.rows) {
      try {
        const reservedUntil = new Date(Date.now() + RESERVATION_DURATION * 1000);

        await db.query('BEGIN');

        const enrollmentResult = await db.query(
          `INSERT INTO enrollments (user_id, course_id, status, reserved_until)
           VALUES ($1, $2, 'pending', $3)
           RETURNING id, status, reserved_until`,
          [waitlistEntry.user_id, courseId, reservedUntil]
        );

        await db.query(
          'UPDATE courses SET enrolled_count = enrolled_count + 1 WHERE id = $1',
          [courseId]
        );

        await db.query(
          `DELETE FROM waitlists WHERE id = $1`,
          [waitlistEntry.id]
        );

        const reservationKey = getReservationKey(courseId, waitlistEntry.user_id);
        await client.set(reservationKey, enrollmentResult.rows[0].id, {
          EX: RESERVATION_DURATION
        });

        await db.query('COMMIT');

        const courseTitle = course.title;
        await createNotification(
          waitlistEntry.user_id,
          'waitlist_promoted',
          `候补成功：${courseTitle}`,
          `您已从候补队列中递补，获得了「${courseTitle}」的报名资格。请在15分钟内完成支付，逾期名额将释放给其他候补用户。`,
          courseId
        );

        promotedUsers.push({
          userId: waitlistEntry.user_id,
          enrollmentId: enrollmentResult.rows[0].id,
          reservedUntil: enrollmentResult.rows[0].reserved_until
        });
      } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error promoting waitlist entry:', error);
      }
    }

    return promotedUsers;
  } finally {
    await client.del(lockKey);
  }
}

async function cleanupExpiredReservations() {
  const client = getRedisClient();
  const now = new Date();

  const result = await db.query(
    `SELECT id, user_id, course_id, reserved_until 
     FROM enrollments 
     WHERE status = 'pending' AND reserved_until < $1`,
    [now]
  );

  const cancelledCourses = new Set();

  for (const enrollment of result.rows) {
    await cancelEnrollment(enrollment.id, enrollment.user_id, enrollment.course_id, 'timeout');
    cancelledCourses.add(enrollment.course_id);
  }

  for (const courseId of cancelledCourses) {
    await processWaitlist(courseId);
  }

  return result.rows.length;
}

async function cancelEnrollment(enrollmentId, userId, courseId, reason = 'cancelled') {
  const client = getRedisClient();

  await db.query('BEGIN');

  try {
    const courseResult = await db.query(
      'SELECT title FROM courses WHERE id = $1',
      [courseId]
    );
    const courseTitle = courseResult.rows[0]?.title || '课程';

    await db.query(
      `DELETE FROM enrollments WHERE id = $1 AND status = 'pending'`,
      [enrollmentId]
    );

    await db.query(
      `UPDATE courses SET enrolled_count = enrolled_count - 1 WHERE id = $1`,
      [courseId]
    );

    const key = getReservationKey(courseId, userId);
    await client.del(key);

    await db.query('COMMIT');

    if (reason === 'timeout') {
      await createNotification(
        userId,
        'enrollment_expired',
        `报名已超时：${courseTitle}`,
        `您在「${courseTitle}」的待支付订单已超时取消，名额已释放。`,
        courseId
      );
    }

    await processWaitlist(courseId);

    return true;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

router.post('/courses/:courseId/enroll', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const courseId = parseInt(req.params.courseId, 10);

  try {
    await cleanupExpiredReservations();

    const courseResult = await db.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courseResult.rows[0];

    if (!course.is_active) {
      return res.status(400).json({ error: 'Course enrollment is closed' });
    }

    if (new Date(course.start_date) < new Date()) {
      return res.status(400).json({ error: 'Course has already started' });
    }

    const existingEnrollment = await db.query(
      'SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    if (existingEnrollment.rows.length > 0) {
      const enrollment = existingEnrollment.rows[0];
      if (enrollment.status === 'paid') {
        return res.status(400).json({ error: 'You are already enrolled in this course' });
      }
      if (enrollment.status === 'pending') {
        return res.status(400).json({ 
          error: 'You have a pending reservation for this course',
          enrollmentId: enrollment.id,
          reservedUntil: enrollment.reserved_until
        });
      }
    }

    const existingWaitlist = await db.query(
      "SELECT * FROM waitlists WHERE user_id = $1 AND course_id = $2 AND status = 'waiting'",
      [userId, courseId]
    );

    if (existingWaitlist.rows.length > 0) {
      const position = await getWaitlistPosition(courseId, userId);
      return res.status(400).json({ 
        error: 'You are already on the waitlist for this course',
        waitlistPosition: position
      });
    }

    const prereqCheck = await checkPrerequisites(userId, courseId);
    if (!prereqCheck.met) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        missingPrerequisites: prereqCheck.missing
      });
    }

    const client = getRedisClient();
    const lockKey = getCourseLockKey(courseId);
    
    const lockAcquired = await client.set(lockKey, 'locked', {
      NX: true,
      EX: 10
    });

    if (!lockAcquired) {
      return res.status(429).json({ error: 'Too many enrollment requests, please try again' });
    }

    try {
      const currentCourse = await db.query(
        'SELECT * FROM courses WHERE id = $1',
        [courseId]
      );

      if (currentCourse.rows[0].enrolled_count >= currentCourse.rows[0].capacity) {
        const waitlistResult = await db.query(
          `INSERT INTO waitlists (user_id, course_id, status)
           VALUES ($1, $2, 'waiting')
           RETURNING id, status, created_at`,
          [userId, courseId]
        );

        const position = await getWaitlistPosition(courseId, userId);

        return res.status(201).json({
          message: 'Added to waitlist successfully',
          waitlist: {
            id: waitlistResult.rows[0].id,
            courseId: courseId,
            status: 'waiting',
            position: position,
            createdAt: waitlistResult.rows[0].created_at
          }
        });
      }

      const pendingCountResult = await db.query(
        `SELECT COUNT(*) as count FROM enrollments 
         WHERE user_id = $1 AND status = 'pending'`,
        [userId]
      );
      const pendingCount = parseInt(pendingCountResult.rows[0].count, 10);

      if (pendingCount >= 3) {
        return res.status(400).json({
          error: '您已有3门待支付课程，请先处理现有待支付订单后再报名新课程。'
        });
      }

      const reservedUntil = new Date(Date.now() + RESERVATION_DURATION * 1000);

      const enrollmentResult = await db.query(
        `INSERT INTO enrollments (user_id, course_id, status, reserved_until)
         VALUES ($1, $2, 'pending', $3)
         RETURNING id, status, reserved_until`,
        [userId, courseId, reservedUntil]
      );

      await db.query(
        'UPDATE courses SET enrolled_count = enrolled_count + 1 WHERE id = $1',
        [courseId]
      );

      const reservationKey = getReservationKey(courseId, userId);
      await client.set(reservationKey, enrollmentResult.rows[0].id, {
        EX: RESERVATION_DURATION
      });

      res.status(201).json({
        message: 'Enrollment reserved successfully',
        enrollment: {
          id: enrollmentResult.rows[0].id,
          courseId: courseId,
          status: enrollmentResult.rows[0].status,
          reservedUntil: enrollmentResult.rows[0].reserved_until,
          expiresInSeconds: RESERVATION_DURATION
        }
      });
    } finally {
      await client.del(lockKey);
    }
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/courses/:courseId/waitlist', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const courseId = parseInt(req.params.courseId, 10);

  try {
    const courseResult = await db.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courseResult.rows[0];

    if (!course.is_active) {
      return res.status(400).json({ error: 'Course enrollment is closed' });
    }

    if (new Date(course.start_date) < new Date()) {
      return res.status(400).json({ error: 'Course has already started' });
    }

    const existingEnrollment = await db.query(
      "SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status IN ('paid', 'pending')",
      [userId, courseId]
    );

    if (existingEnrollment.rows.length > 0) {
      return res.status(400).json({ error: 'You are already enrolled in this course' });
    }

    const existingWaitlist = await db.query(
      "SELECT * FROM waitlists WHERE user_id = $1 AND course_id = $2 AND status = 'waiting'",
      [userId, courseId]
    );

    if (existingWaitlist.rows.length > 0) {
      const position = await getWaitlistPosition(courseId, userId);
      return res.status(400).json({ 
        error: 'You are already on the waitlist for this course',
        waitlistPosition: position
      });
    }

    const prereqCheck = await checkPrerequisites(userId, courseId);
    if (!prereqCheck.met) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        missingPrerequisites: prereqCheck.missing
      });
    }

    const waitlistResult = await db.query(
      `INSERT INTO waitlists (user_id, course_id, status)
       VALUES ($1, $2, 'waiting')
       RETURNING id, status, created_at`,
      [userId, courseId]
    );

    const position = await getWaitlistPosition(courseId, userId);

    res.status(201).json({
      message: 'Added to waitlist successfully',
      waitlist: {
        id: waitlistResult.rows[0].id,
        courseId: courseId,
        status: 'waiting',
        position: position,
        createdAt: waitlistResult.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Waitlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/courses/:courseId/waitlist/cancel', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const courseId = parseInt(req.params.courseId, 10);

  try {
    const result = await db.query(
      "DELETE FROM waitlists WHERE user_id = $1 AND course_id = $2 AND status = 'waiting' RETURNING *",
      [userId, courseId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }

    res.json({ message: 'Removed from waitlist successfully' });
  } catch (error) {
    console.error('Cancel waitlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/courses/:courseId/waitlist/status', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const courseId = parseInt(req.params.courseId, 10);

  try {
    const result = await db.query(
      "SELECT * FROM waitlists WHERE user_id = $1 AND course_id = $2 AND status = 'waiting'",
      [userId, courseId]
    );

    if (result.rows.length === 0) {
      return res.json({ onWaitlist: false });
    }

    const position = await getWaitlistPosition(courseId, userId);

    res.json({
      onWaitlist: true,
      position: position,
      status: result.rows[0].status,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Waitlist status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/pay', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const enrollmentId = parseInt(req.params.enrollmentId, 10);

  try {
    const enrollmentResult = await db.query(
      'SELECT * FROM enrollments WHERE id = $1 AND user_id = $2',
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status === 'paid') {
      return res.status(400).json({ error: 'Enrollment is already paid' });
    }

    if (enrollment.status === 'cancelled') {
      return res.status(400).json({ error: 'Enrollment has been cancelled' });
    }

    if (enrollment.status === 'pending' && new Date(enrollment.reserved_until) < new Date()) {
      await cancelEnrollment(enrollment.id, enrollment.user_id, enrollment.course_id);
      return res.status(400).json({ error: 'Reservation has expired' });
    }

    await db.query(
      `UPDATE enrollments 
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, reserved_until = NULL, completed = true
       WHERE id = $1`,
      [enrollmentId]
    );

    const client = getRedisClient();
    const key = getReservationKey(enrollment.course_id, userId);
    await client.del(key);

    res.json({
      message: 'Payment successful',
      enrollment: {
        id: enrollmentId,
        courseId: enrollment.course_id,
        status: 'paid',
        paidAt: new Date()
      }
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/cancel', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const enrollmentId = parseInt(req.params.enrollmentId, 10);

  try {
    const enrollmentResult = await db.query(
      'SELECT * FROM enrollments WHERE id = $1 AND user_id = $2',
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status === 'paid') {
      return res.status(400).json({ error: 'Cannot cancel paid enrollment' });
    }

    if (enrollment.status === 'cancelled') {
      return res.status(400).json({ error: 'Enrollment already cancelled' });
    }

    await cancelEnrollment(enrollmentId, userId, enrollment.course_id);

    res.json({ message: 'Enrollment cancelled successfully' });
  } catch (error) {
    console.error('Cancel enrollment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my-enrollments', authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    await cleanupExpiredReservations();

    const enrollmentsResult = await db.query(
      `SELECT 
        e.id,
        e.status,
        e.reserved_until,
        e.paid_at,
        e.completed,
        e.attended,
        e.attended_at,
        e.created_at,
        e.refund_status,
        e.refund_requested_at,
        e.refund_reason,
        e.has_extended,
        e.extended_at,
        c.id as course_id,
        c.title as course_title,
        c.description as course_description,
        c.start_date,
        c.capacity,
        c.is_active as course_is_active
      FROM enrollments e
      JOIN courses c ON e.course_id = c.id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC`,
      [userId]
    );

    const waitlistsResult = await db.query(
      `SELECT 
        w.id,
        w.status,
        w.created_at,
        c.id as course_id,
        c.title as course_title,
        c.description as course_description,
        c.start_date,
        c.capacity,
        c.is_active as course_is_active
      FROM waitlists w
      JOIN courses c ON w.course_id = c.id
      WHERE w.user_id = $1 AND w.status = 'waiting'
      ORDER BY w.created_at DESC`,
      [userId]
    );

    const enrollments = enrollmentsResult.rows.map(row => ({
      id: row.id,
      type: 'enrollment',
      status: row.status,
      reservedUntil: row.reserved_until,
      paidAt: row.paid_at,
      completed: row.completed,
      attended: row.attended,
      attendedAt: row.attended_at,
      createdAt: row.created_at,
      refundStatus: row.refund_status,
      refundRequestedAt: row.refund_requested_at,
      refundReason: row.refund_reason,
      hasExtended: row.has_extended,
      extendedAt: row.extended_at,
      course: {
        id: row.course_id,
        title: row.course_title,
        description: row.course_description,
        startDate: row.start_date,
        capacity: row.capacity,
        isActive: row.course_is_active
      }
    }));

    const waitlists = [];
    for (const row of waitlistsResult.rows) {
      const position = await getWaitlistPosition(row.course_id, userId);
      waitlists.push({
        id: row.id,
        type: 'waitlist',
        status: 'waiting',
        position: position,
        createdAt: row.created_at,
        course: {
          id: row.course_id,
          title: row.course_title,
          description: row.course_description,
          startDate: row.start_date,
          capacity: row.capacity,
          isActive: row.course_is_active
        }
      });
    }

    const all = [...enrollments, ...waitlists].sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json(all);
  } catch (error) {
    console.error('Get enrollments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/courses/:courseId/prerequisites/check', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const courseId = parseInt(req.params.courseId, 10);

  try {
    const check = await checkPrerequisites(userId, courseId);
    res.json(check);
  } catch (error) {
    console.error('Check prerequisites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/courses/:courseId/waitlist/count', async (req, res) => {
  const courseId = parseInt(req.params.courseId, 10);
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.split(' ')[1] 
    : null;
  
  let userId = null;
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch {
      userId = null;
    }
  }

  try {
    const totalCount = await getWaitlistCount(courseId);
    
    let displayCount = totalCount;
    let userPosition = null;
    let isUserOnWaitlist = false;

    if (userId) {
      const userWaitlist = await db.query(
        "SELECT * FROM waitlists WHERE user_id = $1 AND course_id = $2 AND status = 'waiting'",
        [userId, courseId]
      );
      
      if (userWaitlist.rows.length > 0) {
        isUserOnWaitlist = true;
        userPosition = await getWaitlistPosition(courseId, userId);
      }
    }

    res.json({
      totalCount,
      displayCount,
      userPosition,
      isUserOnWaitlist,
    });
  } catch (error) {
    console.error('Get waitlist count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/attend', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const enrollmentId = parseInt(req.params.enrollmentId, 10);

  try {
    const enrollmentResult = await db.query(
      `SELECT e.*, c.start_date, c.title 
       FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE e.id = $1 AND e.user_id = $2`,
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid enrollments can be marked as attended' });
    }

    if (enrollment.attended) {
      return res.status(400).json({ error: 'Already marked as attended' });
    }

    if (new Date(enrollment.start_date) > new Date()) {
      return res.status(400).json({ error: 'Cannot mark attendance before course starts' });
    }

    await db.query(
      `UPDATE enrollments 
       SET attended = true, attended_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [enrollmentId]
    );

    res.json({ message: 'Attendance confirmed successfully' });
  } catch (error) {
    console.error('Confirm attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/refund', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const enrollmentId = parseInt(req.params.enrollmentId, 10);
  const { reason } = req.body;

  try {
    const enrollmentResult = await db.query(
      `SELECT e.*, c.start_date, c.title 
       FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE e.id = $1 AND e.user_id = $2`,
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid enrollments can request refund' });
    }

    if (enrollment.refund_status === 'pending') {
      return res.status(400).json({ error: 'Refund request already submitted and under review' });
    }

    if (new Date(enrollment.start_date) <= new Date()) {
      return res.status(400).json({ error: 'Cannot request refund after course has started' });
    }

    await db.query(
      `UPDATE enrollments 
       SET refund_status = 'pending', 
           refund_requested_at = CURRENT_TIMESTAMP,
           refund_reason = $1
       WHERE id = $2`,
      [reason, enrollmentId]
    );

    await createNotification(
      userId,
      'refund_requested',
      `退课申请已提交：${enrollment.title}`,
      `您的「${enrollment.title}」退课申请已提交，正在等待管理员审核。`,
      enrollment.course_id
    );

    res.json({ message: 'Refund request submitted successfully' });
  } catch (error) {
    console.error('Refund request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/enrollments/:enrollmentId/extend', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const enrollmentId = parseInt(req.params.enrollmentId, 10);

  try {
    const enrollmentResult = await db.query(
      `SELECT e.*, c.title 
       FROM enrollments e 
       JOIN courses c ON e.course_id = c.id 
       WHERE e.id = $1 AND e.user_id = $2`,
      [enrollmentId, userId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending enrollments can be extended' });
    }

    if (enrollment.has_extended) {
      return res.status(400).json({ error: 'Extension already used for this enrollment' });
    }

    const now = new Date();
    const reservedUntil = new Date(enrollment.reserved_until);
    
    if (reservedUntil <= now) {
      return res.status(400).json({ error: 'Cannot extend expired reservation' });
    }

    const remainingSeconds = (reservedUntil - now) / 1000;
    if (remainingSeconds > 300) {
      return res.status(400).json({ error: 'Extension not available when remaining time exceeds 5 minutes' });
    }

    const newReservedUntil = new Date(reservedUntil.getTime() + 5 * 60 * 1000);

    const client = getRedisClient();
    const reservationKey = getReservationKey(enrollment.course_id, userId);
    
    const ttl = await client.ttl(reservationKey);
    if (ttl > 0) {
      await client.expire(reservationKey, ttl + 300);
    }

    await db.query(
      `UPDATE enrollments 
       SET reserved_until = $1, 
           has_extended = true,
           extended_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newReservedUntil, enrollmentId]
    );

    await createNotification(
      userId,
      'payment_extended',
      `支付时间已延长：${enrollment.title}`,
      `您的「${enrollment.title}」待支付订单已延长5分钟支付时间，请尽快完成支付。`,
      enrollment.course_id
    );

    res.json({
      message: 'Payment time extended successfully',
      reservedUntil: newReservedUntil,
    });
  } catch (error) {
    console.error('Extend payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.processWaitlist = processWaitlist;

module.exports = router;
