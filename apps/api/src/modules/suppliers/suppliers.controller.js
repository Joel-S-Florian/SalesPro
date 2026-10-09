import * as suppliersService from './suppliers.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getSuppliers = asyncHandler(async (req, res) => {
  res.json(await suppliersService.getSuppliers(req.query));
});

export const getSupplier = asyncHandler(async (req, res) => {
  res.json(await suppliersService.getSupplierById(req.params.id));
});

export const createSupplier = asyncHandler(async (req, res) => {
  res.status(201).json(await suppliersService.createSupplier(req.body));
});

export const updateSupplier = asyncHandler(async (req, res) => {
  res.json(await suppliersService.updateSupplier(req.params.id, req.body));
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  res.json(await suppliersService.deactivateSupplier(req.params.id));
});

export const getSupplierPurchases = asyncHandler(async (req, res) => {
  res.json(await suppliersService.getSupplierPurchases(req.params.id, req.query));
});
