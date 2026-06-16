require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./index');

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const adminPassword = await bcrypt.hash('admin123', 10);
    const userPassword = await bcrypt.hash('user123', 10);

    const adminResult = await client.query(
      `INSERT INTO users (username, email, password_hash, is_admin) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (username) DO NOTHING 
       RETURNING id`,
      ['admin', 'admin@example.com', adminPassword, true]
    );

    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, is_admin) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (username) DO NOTHING 
       RETURNING id`,
      ['testuser', 'user@example.com', userPassword, false]
    );

    const courses = [
      {
        title: 'JavaScript 基础入门',
        description: '从零开始学习 JavaScript 编程语言，掌握变量、函数、对象等核心概念。适合编程初学者。',
        capacity: 50,
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'HTML/CSS 网页设计',
        description: '学习 HTML 标签和 CSS 样式，掌握网页布局和美化技巧，打造精美的网页界面。',
        capacity: 40,
        startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'React 前端开发',
        description: '深入学习 React 框架，掌握组件化开发、状态管理、路由等高级技术。',
        capacity: 30,
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: 'Node.js 后端开发',
        description: '使用 Node.js 和 Express 构建高性能后端服务，学习 RESTful API 设计。',
        capacity: 25,
        startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: '高级全栈开发实战',
        description: '综合运用前后端技术，完成完整的全栈项目。需要先掌握 React 和 Node.js 基础知识。',
        capacity: 20,
        startDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];

    const courseIds = [];
    for (const course of courses) {
      const insertResult = await client.query(
        `INSERT INTO courses (title, description, capacity, start_date) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (title) DO UPDATE SET
           description = EXCLUDED.description,
           capacity = EXCLUDED.capacity,
           start_date = EXCLUDED.start_date
         RETURNING id`,
        [course.title, course.description, course.capacity, course.startDate]
      );
      courseIds.push(insertResult.rows[0].id);
    }

    const jsCourseId = courseIds[0];
    const reactCourseId = courseIds[2];
    const nodeCourseId = courseIds[3];
    const fullstackCourseId = courseIds[4];

    await client.query(
      `INSERT INTO prerequisites (course_id, prerequisite_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [reactCourseId, jsCourseId]
    );

    await client.query(
      `INSERT INTO prerequisites (course_id, prerequisite_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [nodeCourseId, jsCourseId]
    );

    await client.query(
      `INSERT INTO prerequisites (course_id, prerequisite_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [fullstackCourseId, reactCourseId]
    );

    await client.query(
      `INSERT INTO prerequisites (course_id, prerequisite_id) 
       VALUES ($1, $2) 
       ON CONFLICT DO NOTHING`,
      [fullstackCourseId, nodeCourseId]
    );

    await client.query('COMMIT');
    console.log('Seed data inserted successfully');
    console.log('Admin account: admin / admin123');
    console.log('Test user: testuser / user123');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seed;
