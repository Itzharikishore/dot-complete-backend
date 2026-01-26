const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const connectDB = require('./config/database'); // make sure you have this
require('dotenv').config();
const User = require('./models/User');
const swaggerSpecs = require('./config/swagger');

const app = express();

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: true,  // Dynamically allow all origins (including random localhost ports)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ==================== DATABASE ====================
connectDB();

// ==================== STARTUP SEEDING ====================
(async () => {
  try {
    const existingSuperuser = await User.findOne({ role: 'superuser' });
    if (!existingSuperuser) {
      console.log('🛠️  No superuser found. Creating default superuser...');
      const email = process.env.SUPERUSER_EMAIL || 'admin@admin.com';
      const password = process.env.SUPERUSER_PASSWORD || 'admin123';
      await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email,
        password,
        role: 'superuser',
        isEmailVerified: true,
      });
      console.log(`✅ Default superuser created. Email: ${email} Password: ${password}`);
    } else {
      console.log('🛡️  Superuser already exists. Skipping seeding.');
    }
  } catch (err) {
    console.error('❌ Failed to seed superuser:', err.message);
  }
})();

// ==================== SWAGGER DOCUMENTATION ====================
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DOT Therapy API Documentation'
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'DOT Therapy API is running!', 
    timestamp: new Date().toISOString(),
    documentation: '/api/docs'
  });
});

// ==================== API ROUTES ====================

// Authentication routes (public + protected)
const AuthRoutes = require('./routes/api/AuthRoutes');
app.use('/api/auth', AuthRoutes);
console.log('✅ Auth routes loaded at /api/auth');

// Admin routes (therapist and child management, admin activities and reports)
const AdminRoutes = require('./routes/api/AdminRoutes');
app.use('/api/admin', AdminRoutes);
console.log('✅ Admin routes loaded at /api/admin');

// Therapist routes (therapist activities and reports)
const TherapistRoutes = require('./routes/api/TherapistRoutes');
app.use('/api/therapist', TherapistRoutes);
console.log('✅ Therapist routes loaded at /api/therapist');

// Child routes (child activities and submissions)
const ChildRoutes = require('./routes/api/ChildRoutes');
app.use('/api/child', ChildRoutes);
console.log('✅ Child routes loaded at /api/child');

// ==================== ERROR HANDLERS ====================

// Error handling middleware (must be before 404)
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(400).json({ success: false, message: 'Validation Error', errors });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ success: false, message: `${field} already exists` });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

// 404 handler (MUST be last)
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `🔍 Route '${req.originalUrl}' not found`,
    availableRoutes: {
      public: ['/api/health', '/api/docs'],
      auth: ['/api/auth/register', '/api/auth/login', '/api/auth/profile'],
      protected: ['All other routes require authentication']
    },
    documentation: 'Visit /api/docs for complete API documentation'
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '..', 'frontend', 'build');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  const baseURL = `http://localhost:${PORT}`;
  console.log(`🚀 Server running on ${baseURL}`);
  console.log(`📚 API Docs: ${baseURL}/api/docs`);
  console.log(`💚 Health Check: ${baseURL}/api/health`);
});


