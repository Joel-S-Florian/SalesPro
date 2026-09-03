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

export const getLowStockAlert = asyncHandler(async (req, res) => {
  const report = await reportsService.getLowStockAlert();
  res.json(report);
});

export const getTopSoldProducts = asyncHandler(async (req, res) => {
  const { from, to, categoryId, limit } = req.query;
  const report = await reportsService.getTopSoldProducts({ from, to, categoryId, limit: parseInt(limit) || 10 });
  res.json(report);
});

export const getMostProfitableProducts = asyncHandler(async (req, res) => {
  const { from, to, categoryId, limit } = req.query;
  const report = await reportsService.getMostProfitableProducts({ from, to, categoryId, limit: parseInt(limit) || 10 });
  res.json(report);
});

export const getLowMarginProducts = asyncHandler(async (req, res) => {
  const { from, to, minMargin } = req.query;
  const report = await reportsService.getLowMarginProducts({ from, to, minMargin: parseFloat(minMargin) || 20 });
  res.json(report);
});

export const getProductsByCategory = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const report = await reportsService.getProductsByCategory({ from, to });
  res.json(report);
});

export const getTopCustomersByAmount = asyncHandler(async (req, res) => {
  const { from, to, docType, search, limit } = req.query;
  const report = await reportsService.getTopCustomersByAmount({ from, to, docType, search, limit: parseInt(limit) || 10 });
  res.json(report);
});

export const getTopCustomersByFrequency = asyncHandler(async (req, res) => {
  const { from, to, docType, search, limit } = req.query;
  const report = await reportsService.getTopCustomersByFrequency({ from, to, docType, search, limit: parseInt(limit) || 10 });
  res.json(report);
});

export const getCustomerHistory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  const report = await reportsService.getCustomerHistory(id, { from, to });
  res.json(report);
});

export const getStaffPerformance = asyncHandler(async (req, res) => {
  const { from, to, userId, paymentMethod } = req.query;
  const report = await reportsService.getStaffPerformance({ from, to, userId, paymentMethod });
  res.json(report);
});

export const getStaffPaymentMethods = asyncHandler(async (req, res) => {
  const { from, to, userId } = req.query;
  const report = await reportsService.getStaffPaymentMethods({ from, to, userId });
  res.json(report);
});