import express from 'express';
import * as authController from './auth.controller.js';
import { authenticate, authorize } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { loginSchema, changePasswordSchema, createUserSchema, updateUserSchema, userIdParamSchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @description Login with username and password
 * @access Public
 */
router.post('/login', validate(loginSchema), auditLog('LOGIN', 'auth'), authController.login);

/**
 * @route POST /api/auth/refresh
 * @description Refresh access token
 * @access Public (requires refresh token)
 */
router.post('/refresh', authController.refresh);

/**
 * @route POST /api/auth/logout
 * @description Logout current session
 * @access Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route POST /api/auth/logout-all
 * @description Logout from all devices
 * @access Private
 */
router.post('/logout-all', authenticate, authController.logoutAll);

/**
 * @route GET /api/auth/me
 * @description Get current user profile
 * @access Private
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route PUT /api/auth/password
 * @description Change password
 * @access Private
 */
router.put('/password', authenticate, validate(changePasswordSchema), auditLog('CHANGE_PASSWORD', 'user'), authController.changePassword);

/**
 * @route GET /api/auth/users
 * @description Get all users (admin only)
 * @access Private (Admin)
 */
router.get('/users', authenticate, authorize('ADMINISTRADOR'), authController.getUsers);

/**
 * @route POST /api/auth/users
 * @description Create new user (admin only)
 * @access Private (Admin)
 */
router.post('/users', authenticate, authorize('ADMINISTRADOR'), validate(createUserSchema), auditLog('CREATE_USER', 'user'), authController.createUser);

/**
 * @route PUT /api/auth/users/:id
 * @description Update user (admin only)
 * @access Private (Admin)
 */
router.put('/users/:id', authenticate, authorize('ADMINISTRADOR'), validate(updateUserSchema), auditLog('UPDATE_USER', 'user'), authController.updateUser);

/**
 * @route DELETE /api/auth/users/:id
 * @description Deactivate user (admin only)
 * @access Private (Admin)
 */
router.delete('/users/:id', authenticate, authorize('ADMINISTRADOR'), validate(userIdParamSchema), auditLog('DELETE_USER', 'user'), authController.deleteUser);

export default router;