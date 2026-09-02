import { Controller, Get, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { ReportService } from './report.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  dailyShiftSchema,
  rangeSchema,
  salesReportSchema,
  topProductsSchema,
  type DailyShiftInput,
  type RangeInput,
  type SalesReportInput,
  type TopProductsInput,
} from './dto/report.dto.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportService) {}

  @Get('dashboard')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  dashboard(
    @Query(new ZodValidationPipe(rangeSchema)) query: RangeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.dashboard(query, user);
  }

  @Get('sales')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  sales(@Query(new ZodValidationPipe(salesReportSchema)) query: SalesReportInput) {
    return this.reports.sales(query);
  }

  @Get('profit')
  @Permissions(PERMISSIONS.REPORT_PROFIT_VIEW)
  profit(
    @Query(new ZodValidationPipe(salesReportSchema)) query: SalesReportInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.profit(query, user);
  }

  @Get('top-products')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  topProducts(
    @Query(new ZodValidationPipe(topProductsSchema)) query: TopProductsInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.topProducts(query, user);
  }

  @Get('cashier-performance')
  @Permissions(PERMISSIONS.REPORT_STAFF_VIEW)
  cashierPerformance(@Query(new ZodValidationPipe(rangeSchema)) query: RangeInput) {
    return this.reports.cashierPerformance(query);
  }

  @Get('hourly-density')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  hourlyDensity(@Query(new ZodValidationPipe(rangeSchema)) query: RangeInput) {
    return this.reports.hourlyDensity(query);
  }

  @Get('stock-value')
  @Permissions(PERMISSIONS.REPORT_STOCK_VIEW)
  stockValue(@CurrentUser() user: AuthenticatedUser) {
    return this.reports.stockValue(user);
  }

  @Get('contact-aging')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  contactAging() {
    return this.reports.contactAging();
  }

  @Get('payment-distribution')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  paymentDistribution(@Query(new ZodValidationPipe(rangeSchema)) query: RangeInput) {
    return this.reports.paymentDistribution(query);
  }

  @Get('daily-shift')
  @Permissions(PERMISSIONS.REPORT_SALES_VIEW)
  dailyShift(@Query(new ZodValidationPipe(dailyShiftSchema)) query: DailyShiftInput) {
    return this.reports.dailyShift(query);
  }
}
