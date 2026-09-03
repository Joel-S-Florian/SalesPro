import express from 'express';
import * as financeController from './finance.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';

const router = express.Router();

/**
 * @route GET /api/finance/cashflow
 * @description Get cashflow (income vs expenses) with optional date range
 * @access Private (Admin)
 */
router.get('/cashflow', authenticate, authorize('ADMINISTRADOR'), financeController.getCashflow);

export default router;
