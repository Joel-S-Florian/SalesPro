import * as inventoryService from './inventory.service.js';
import * as batches from './batches.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getInventoryLogs = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, productId, type, userId, startDate, endDate, q } = req.query;
  const result = await inventoryService.getInventoryLogs({
    q,
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

export const registerPurchase = asyncHandler(async (req, res) => {
  const result = await inventoryService.registerPurchase(req.body, req.user.userId, req.user.fullName);
  res.status(201).json(result);
});

export const getExpiringBatches = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  res.json(await batches.getExpiringBatches({ status: status || 'ALL', page: parseInt(page) || 1, limit: Math.min(parseInt(limit) || 50, 200) }));
});

export const getExpiringSummary = asyncHandler(async (req, res) => {
  res.json(await batches.getExpiringSummary());
});

export const getProductBatches = asyncHandler(async (req, res) => {
  res.json({ data: await batches.listBatches(req.params.id, { includeEmpty: req.query.all === 'true' }) });
});

export const getInventorySummary = asyncHandler(async (req, res) => {
  const summary = await inventoryService.getInventorySummary();
  res.json(summary);
});