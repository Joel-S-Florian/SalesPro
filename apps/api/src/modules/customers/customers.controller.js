import * as customersService from './customers.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getCustomers = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, q } = req.query;
  const result = await customersService.getCustomers({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy,
    sortOrder,
    q,
  });
  res.json(result);
});

export const getCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await customersService.getCustomerById(id);
  res.json(customer);
});

export const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customersService.createCustomer(req.body);
  res.status(201).json(customer);
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const customer = await customersService.updateCustomer(id, req.body);
  res.json(customer);
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await customersService.deleteCustomer(id);
  res.json({ success: true, message: 'Cliente eliminado correctamente' });
});

export const getCustomersForPOS = asyncHandler(async (req, res) => {
  const customers = await customersService.getCustomersForPOS();
  res.json(customers);
});