import * as productsService from './products.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getProducts = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, q, categoryId, active, lowStock } = req.query;
  const result = await productsService.getProducts({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
    q,
    categoryId,
    active: active !== undefined ? active === 'true' : undefined,
    lowStock: lowStock === 'true',
  });
  res.json(result);
});

export const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await productsService.getProductById(id);
  res.json(product);
});

export const createProduct = asyncHandler(async (req, res) => {
  const product = await productsService.createProduct(req.body, req.user.userId, req.user.fullName);
  res.status(201).json(product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await productsService.updateProduct(id, req.body, req.user.userId, req.user.fullName);
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await productsService.deleteProduct(id);
  res.json(result);
});

export const adjustStock = asyncHandler(async (req, res) => {
  const result = await productsService.adjustStock(req.body, req.user.userId, req.user.fullName);
  res.json(result);
});

export const getLowStock = asyncHandler(async (req, res) => {
  const products = await productsService.getLowStockProducts();
  res.json(products);
});