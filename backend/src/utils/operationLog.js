const db = require('../db');

async function createOperationLog(adminId, actionType, courseId, targetId, summary) {
  await db.query(
    `INSERT INTO operation_logs (admin_id, action_type, course_id, target_id, summary)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, actionType, courseId, targetId, summary]
  );
}

module.exports = { createOperationLog };
