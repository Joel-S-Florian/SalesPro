import * as financeService from './finance.service.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

export const getCashflow = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const result = await financeService.getCashflow({ from, to });
  res.json(result);
});
