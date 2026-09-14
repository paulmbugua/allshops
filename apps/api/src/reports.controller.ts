import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  commissionReportFilterSchema,
  inventoryReportFilterSchema,
  movementReportFilterSchema,
  reportDateRangeSchema,
  reportExportSchema,
  salesReportFilterSchema,
} from "@allshops/contracts";
import { RequirePermission } from "./permissions.decorator.js";
import { ReportsService } from "./reports.service.js";
import type { RequestContext } from "./security.types.js";
import { parseInput } from "./validation.js";

@ApiTags("Reports and analytics")
@ApiBearerAuth()
@Controller("organizations/:organizationId/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission("report.dashboard")
  @Get("dashboard")
  dashboard(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.dashboard(
      request.tenant!,
      request.user!.id,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales")
  sales(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.sales(
      request.tenant!,
      parseInput(salesReportFilterSchema, query),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/products")
  products(@Query() query: unknown, @Req() request: RequestContext) {
    const tenant = request.tenant!;
    return this.reports.salesGroups(
      tenant,
      parseInput(salesReportFilterSchema, query),
      "products",
      tenant.permissions.includes("report.sales.cost"),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/categories")
  categories(@Query() query: unknown, @Req() request: RequestContext) {
    const tenant = request.tenant!;
    return this.reports.salesGroups(
      tenant,
      parseInput(salesReportFilterSchema, query),
      "categories",
      tenant.permissions.includes("report.sales.cost"),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/brands")
  brands(@Query() query: unknown, @Req() request: RequestContext) {
    const tenant = request.tenant!;
    return this.reports.salesGroups(
      tenant,
      parseInput(salesReportFilterSchema, query),
      "brands",
      tenant.permissions.includes("report.sales.cost"),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/discounts")
  discounts(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.discounts(
      request.tenant!,
      parseInput(salesReportFilterSchema, query),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/trend")
  salesTrend(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.salesTrend(
      request.tenant!,
      parseInput(salesReportFilterSchema, query),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/branches")
  branches(@Query() query: unknown, @Req() request: RequestContext) {
    const tenant = request.tenant!;
    return this.reports.salesGroups(
      tenant,
      parseInput(salesReportFilterSchema, query),
      "branches",
      tenant.permissions.includes("report.sales.cost"),
    );
  }

  @RequirePermission("report.sales")
  @Get("sales/cashiers")
  cashiers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.salesGroups(
      request.tenant!,
      parseInput(salesReportFilterSchema, query),
      "cashiers",
      false,
    );
  }

  @RequirePermission("report.profit", "report.sales.cost")
  @Get("profit")
  profit(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.profit(
      request.tenant!,
      parseInput(salesReportFilterSchema, query),
    );
  }

  @RequirePermission("report.payments")
  @Get("payments")
  payments(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.payments(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.inventory")
  @Get("inventory")
  inventory(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.inventory(
      request.tenant!,
      parseInput(inventoryReportFilterSchema, query),
      false,
    );
  }

  @RequirePermission("report.inventory", "report.inventory.valuation")
  @Get("inventory/valuation")
  valuation(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.inventory(
      request.tenant!,
      parseInput(inventoryReportFilterSchema, query),
      true,
    );
  }

  @RequirePermission("report.inventory", "report.inventory.valuation")
  @Get("inventory-valuation")
  valuationAlias(@Query() query: unknown, @Req() request: RequestContext) {
    return this.valuation(query, request);
  }

  @RequirePermission("report.inventory")
  @Get("inventory/movements")
  movements(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.movements(
      request.tenant!,
      parseInput(movementReportFilterSchema, query),
    );
  }

  @RequirePermission("report.inventory", "report.inventory.valuation")
  @Get("inventory/slow-moving")
  slowMoving(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.slowMoving(
      request.tenant!,
      parseInput(inventoryReportFilterSchema, query),
    );
  }

  @RequirePermission("report.purchases")
  @Get("purchases")
  purchases(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.purchases(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.purchases")
  @Get("purchases/products")
  purchaseProducts(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.purchaseProducts(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.suppliers")
  @Get("suppliers")
  suppliers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.suppliers(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.suppliers")
  @Get("supplier-balances")
  supplierBalances(@Query() query: unknown, @Req() request: RequestContext) {
    return this.suppliers(query, request);
  }

  @RequirePermission("report.expenses")
  @Get("expenses")
  expenses(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.expenses(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.customers", "report.customer_balances")
  @Get("customers")
  customers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.customers(
      request.tenant!,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.customers", "report.customer_balances")
  @Get("customer-balances")
  customerBalances(@Query() query: unknown, @Req() request: RequestContext) {
    return this.customers(query, request);
  }

  @RequirePermission("report.appointments")
  @Get("appointments")
  appointments(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.appointments(
      request.tenant!,
      request.user!.id,
      parseInput(reportDateRangeSchema, query),
    );
  }

  @RequirePermission("report.commissions")
  @Get("commissions")
  commissions(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.commissions(
      request.tenant!,
      request.user!.id,
      parseInput(commissionReportFilterSchema, query),
    );
  }

  @RequirePermission("report.commissions")
  @Get("staff-performance")
  staffPerformance(@Query() query: unknown, @Req() request: RequestContext) {
    return this.reports.staffPerformance(
      request.tenant!,
      request.user!.id,
      parseInput(commissionReportFilterSchema, query),
    );
  }

  @RequirePermission("report.commissions")
  @Get("staff")
  staff(@Query() query: unknown, @Req() request: RequestContext) {
    return this.staffPerformance(query, request);
  }

  @RequirePermission("report.export")
  @Get(":reportType/export")
  async export(
    @Param("reportType") reportType: string,
    @Query() query: unknown,
    @Req() request: RequestContext,
  ) {
    const input = parseInput(reportExportSchema, query);
    const output = await this.reports.exportRows(
      reportType,
      request.tenant!,
      request.user!.id,
      input,
    );
    const safeType = reportType.replaceAll(/[^a-z0-9-]/gi, "-");
    return new StreamableFile(Buffer.from(output, "utf8"), {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="allshops-${safeType}-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  }
}
