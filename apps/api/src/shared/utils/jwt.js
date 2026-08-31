import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { generateRandomString } from './crypto.js';

/**
 * Generate access token
 * @param {Object} payload - Token payload
 * @returns {string} JWT access token
 */
export function generateAccessToken(payload) {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
}

/**
 * Generate refresh token
 * @param {Object} payload - Token payload
 * @returns {string} JWT refresh token
 */
export function generateRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY,
  });
}

/**
 * Verify access token
 * @param {string} token - JWT access token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User object
 * @returns {Object} Access and refresh tokens
 */
export function generateTokenPair(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken({ ...payload, jti: generateRandomString(16) }),
  };
}

/**
 * Decode token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload
 */
export function decodeToken(token) {
  return jwt.decode(token);
}