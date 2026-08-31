import * as inventoryService from './inventory.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getInventoryLogs = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, productId, type, userId, startDate, endDate } = req.query;
  const result = await inventoryService.getInventoryLogs({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    sortBy,
    sortOrder,
    productId,
    type,
    userId,
    startDate,
    endDate,
  });
  res.json(result);
});

export const getProductKardex = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page, limit } = req.query;
  const result = await inventoryService.getProductKardex(id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 100,
  });
  res.json(result);
});

export const adjustStock = asyncHandler(async (req, res) => {
  const result = await inventoryService.adjustStock(req.body, req.user.userId, req.user.fullName);
  res.json(result);
});

export const getInventorySummary = asyncHandler(async (req, res) => {
  const summary = await inventoryService.getInventorySummary();
  res.json(summary);
});