import * as salesService from './sales.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getSales = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, customerId, userId, search, startDate, endDate, paymentMethod } = req.query;
  const result = await salesService.getSales({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
    customerId,
    userId,
    search,
    startDate,
    endDate,
    paymentMethod,
  });
  res.json(result);
});

export const getSale = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const sale = await salesService.getSaleById(id, req.user);
  res.json(sale);
});

export const getMySales = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, customerId, search, startDate, endDate, paymentMethod } = req.query;
  const result = await salesService.getMySales(req.user.userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
    customerId,
    search,
    startDate,
    endDate,
    paymentMethod,
  });
  res.json(result);
});

export const getVendorStats = asyncHandler(async (req, res) => {
  const stats = await salesService.getVendorStats(req.user.userId);
  res.json(stats);
});

export const createSale = asyncHandler(async (req, res) => {
  const sale = await salesService.createSale(req.body, req.user.userId, req.user.fullName);
  res.status(201).json(sale);
});

export const createCreditNote = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { details, reason } = req.body;
  const creditNote = await salesService.createCreditNote(id, { details, reason }, req.user.userId, req.user.fullName);
  res.status(201).json(creditNote);
});