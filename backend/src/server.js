require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectRedis } = require('./db/redis');
const migrate = require('./db/migrate');
const seed = require('./db/seed');

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const enrollmentRoutes = require('./routes/enrollments');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api', enrollmentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Course enrollment API is running' });
});

async function startServer() {
  try {
    console.log('Running database migrations...');
    await migrate();
    console.log('Database migrations completed');

    console.log('Seeding database...');
    try {
      await seed();
    } catch (seedError) {
      console.warn('Database seeding may have partially failed (data may already exist):', seedError.message);
    }
    console.log('Database seeding completed');

    await connectRedis();
    console.log('Redis connection established');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
