import * as authService from './auth.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

/**
 * POST /api/auth/login
 * Login with username and password
 */
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await authService.login(username, password);

  // Set refresh token as httpOnly cookie (optional, also return in body)
  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken || req.headers['x-refresh-token'];
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token requerido' });
  }

  const result = await authService.refreshTokens(refreshToken);

  res.cookie('refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});

/**
 * POST /api/auth/logout
 * Logout - revoke refresh token
 */
export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken || req.headers['x-refresh-token'];
  
  await authService.logout(refreshToken);
  
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Sesión cerrada correctamente' });
});

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 */
export const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.userId);
  res.clearCookie('refreshToken');
  res.json({ success: true, message: 'Sesiones cerradas en todos los dispositivos' });
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.userId);
  res.json({ user });
});

/**
 * PUT /api/auth/password
 * Change password
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await authService.changePassword(req.user.userId, oldPassword, newPassword);
  res.json({ success: true, message: 'Contraseña cambiada exitosamente' });
});

/**
 * GET /api/auth/users
 * Get all users (admin only)
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder } = req.query;
  const result = await authService.getUsers({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
  });
  res.json(result);
});

/**
 * POST /api/auth/users
 * Create new user (admin only)
 */
export const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createUser(req.body);
  res.status(201).json(user);
});

/**
 * PUT /api/auth/users/:id
 * Update user (admin only)
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = await authService.updateUser(id, req.body);
  res.json(user);
});

/**
 * DELETE /api/auth/users/:id
 * Deactivate user (admin only)
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await authService.deleteUser(id);
  res.json({ success: true, message: 'Usuario desactivado correctamente' });
});