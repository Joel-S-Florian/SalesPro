import * as categoriesService from './categories.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getCategories = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, q } = req.query;
  const result = await categoriesService.getCategories({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
    q,
  });
  res.json(result);
});

export const getCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await categoriesService.getCategoryById(id);
  res.json(category);
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoriesService.createCategory(req.body);
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const category = await categoriesService.updateCategory(id, req.body);
  res.json(category);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await categoriesService.deleteCategory(id);
  res.json({ success: true, message: 'Categoría eliminada correctamente' });
});