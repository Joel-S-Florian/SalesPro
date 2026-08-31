import * as reportsService from './reports.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const stats = await reportsService.getDashboardStats();
  res.json(stats);
});

export const getSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, customerId, userId, paymentMethod, groupBy } = req.query;
  const report = await reportsService.getSalesReport({ startDate, endDate, customerId, userId, paymentMethod, groupBy });
  res.json(report);
});

export const getProductSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, categoryId, limit } = req.query;
  const report = await reportsService.getProductSalesReport({ startDate, endDate, categoryId, limit: parseInt(limit) || 20 });
  res.json(report);
});

export const getCustomerSalesReport = asyncHandler(async (req, res) => {
  const { startDate, endDate, limit } = req.query;
  const report = await reportsService.getCustomerSalesReport({ startDate, endDate, limit: parseInt(limit) || 20 });
  res.json(report);
});

export const getTaxReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const report = await reportsService.getTaxReport({ startDate, endDate });
  res.json(report);
});