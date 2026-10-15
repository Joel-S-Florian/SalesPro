import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { rateLimiter } from './shared/middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './shared/middleware/errorHandler.js';
import { sanitizeInput } from './shared/middleware/validate.js';

// Import routes
import authRoutes from './modules/auth/auth.routes.js';
import categoriesRoutes from './modules/categories/categories.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import customersRoutes from './modules/customers/customers.routes.js';
import salesRoutes from './modules/sales/sales.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import suppliersRoutes from './modules/suppliers/suppliers.routes.js';
import configRoutes from './modules/config/config.routes.js';
import terminalsRoutes from './modules/terminals/terminals.routes.js';
import cashierRoutes from './modules/cashier/cashier.routes.js';
import inventoryImportRoutes from './modules/inventory-import/inventory-import.routes.js';
import publicRoutes from './modules/public/public.routes.js';
import platformRoutes from './modules/platform/platform.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import ecfRoutes from './modules/ecf/ecf.routes.js';
import exportsRoutes from './modules/exports/exports.routes.js';
import ecfReceiverRoutes from './modules/ecf/ecf.receiver.routes.js';
import financeRoutes from './modules/finance/finance.routes.js';

const app = express();

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: env.isDev ? false : undefined,
}));

// CORS
app.use(cors({
  // CORS_ORIGIN admite varios orígenes separados por coma (sistema y página de promoción)
  origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sanitize input
app.use(sanitizeInput);

// Logging
if (env.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/categories', categoriesRoutes);
app.use('/products', productsRoutes);
app.use('/customers', customersRoutes);
app.use('/sales', salesRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/reports', reportsRoutes);
app.use('/finance', financeRoutes);
app.use('/suppliers', suppliersRoutes);
app.use('/config', configRoutes);
app.use('/terminals', terminalsRoutes);
app.use('/cashier', cashierRoutes);
app.use('/inventory-import', inventoryImportRoutes);
app.use('/platform', platformRoutes);
app.use('/payments', paymentsRoutes);
app.use('/ecf', ecfRoutes);
app.use('/exports', exportsRoutes);
app.use('/ecf-receptor', ecfReceiverRoutes); // servicios públicos de recepción (sin sesión)
app.use('/public', publicRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

export default app;