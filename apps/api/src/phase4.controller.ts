import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import {
  createCustomerSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  createPurchaseSchema,
  createSupplierSchema,
  customerHistoryListSchema,
  customerListSchema,
  customerPaymentSchema,
  expenseCategoryListSchema,
  expenseListSchema,
  idempotencyKeySchema,
  purchaseListSchema,
  receivePurchaseSchema,
  supplierListSchema,
  supplierPaymentListSchema,
  supplierPaymentSchema,
  updateCustomerSchema,
  updateExpenseCategorySchema,
  updatePurchaseSchema,
  updateSupplierSchema,
} from "@allshops/contracts";

import { Phase4Service } from "./phase4.service.js";
import { RequirePermission } from "./permissions.decorator.js";
import type { RequestContext } from "./security.types.js";
import { assertUuid, parseInput } from "./validation.js";

const idempotencyKey = (value?: string) =>
  parseInput(idempotencyKeySchema, value);
const idempotentHeader = {
  name: "Idempotency-Key",
  required: true,
  description: "UUID used to safely retry this financial mutation",
};

@ApiTags("Suppliers, purchases, customers and expenses")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class Phase4Controller {
  constructor(private readonly phase4: Phase4Service) {}

  @RequirePermission("supplier.create")
  @Post("suppliers")
  createSupplier(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase4.createSupplier(
      request.tenant!,
      request.user!.id,
      parseInput(createSupplierSchema, body),
    );
  }

  @RequirePermission("supplier.read")
  @Get("suppliers")
  suppliers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase4.suppliers(
      request.tenant!,
      parseInput(supplierListSchema, query),
    );
  }

  @RequirePermission("supplier.read")
  @Get("suppliers/:supplierId")
  supplier(
    @Param("supplierId") supplierId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase4.supplier(
      request.tenant!,
      assertUuid(supplierId, "supplierId"),
    );
  }

  @RequirePermission("supplier.update")
  @Patch("suppliers/:supplierId")
  updateSupplier(
    @Param("supplierId") supplierId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.updateSupplier(
      request.tenant!,
      request.user!.id,
      assertUuid(supplierId, "supplierId"),
      parseInput(updateSupplierSchema, body),
    );
  }

  @RequirePermission("purchase.create")
  @Post("purchases")
  createPurchase(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase4.createPurchase(
      request.tenant!,
      request.user!.id,
      parseInput(createPurchaseSchema, body),
    );
  }

  @RequirePermission("purchase.read")
  @Get("purchases")
  purchases(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase4.purchases(
      request.tenant!,
      parseInput(purchaseListSchema, query),
    );
  }

  @RequirePermission("purchase.read")
  @Get("purchases/:purchaseId")
  purchase(
    @Param("purchaseId") purchaseId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase4.purchase(
      request.tenant!,
      assertUuid(purchaseId, "purchaseId"),
    );
  }

  @RequirePermission("purchase.update_draft")
  @Patch("purchases/:purchaseId")
  updatePurchase(
    @Param("purchaseId") purchaseId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.updatePurchase(
      request.tenant!,
      request.user!.id,
      assertUuid(purchaseId, "purchaseId"),
      parseInput(updatePurchaseSchema, body),
    );
  }

  @ApiHeader(idempotentHeader)
  @RequirePermission("purchase.receive")
  @Post("purchases/:purchaseId/receive")
  receivePurchase(
    @Param("purchaseId") purchaseId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.phase4.receivePurchase(
      request.tenant!,
      request.user!.id,
      assertUuid(purchaseId, "purchaseId"),
      parseInput(receivePurchaseSchema, body),
      idempotencyKey(key),
    );
  }

  @RequirePermission("purchase.cancel_draft")
  @Post("purchases/:purchaseId/cancel")
  cancelPurchase(
    @Param("purchaseId") purchaseId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase4.cancelPurchase(
      request.tenant!,
      request.user!.id,
      assertUuid(purchaseId, "purchaseId"),
    );
  }

  @ApiHeader(idempotentHeader)
  @RequirePermission("supplier_payment.create")
  @Post("suppliers/:supplierId/payments")
  supplierPayment(
    @Param("supplierId") supplierId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.phase4.supplierPayment(
      request.tenant!,
      request.user!.id,
      assertUuid(supplierId, "supplierId"),
      parseInput(supplierPaymentSchema, body),
      idempotencyKey(key),
    );
  }

  @RequirePermission("supplier_payment.read")
  @Get("suppliers/:supplierId/payments")
  supplierPayments(
    @Param("supplierId") supplierId: string,
    @Query() query: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.supplierPayments(
      request.tenant!,
      assertUuid(supplierId, "supplierId"),
      parseInput(supplierPaymentListSchema, query),
    );
  }

  @RequirePermission("customer.create")
  @Post("customers")
  createCustomer(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase4.createCustomer(
      request.tenant!,
      request.user!.id,
      parseInput(createCustomerSchema, body),
    );
  }

  @RequirePermission("customer.read")
  @Get("customers")
  customers(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase4.customers(
      request.tenant!,
      parseInput(customerListSchema, query),
    );
  }

  @RequirePermission("customer.read")
  @Get("customers/:customerId")
  customer(
    @Param("customerId") customerId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase4.customer(
      request.tenant!,
      assertUuid(customerId, "customerId"),
    );
  }

  @RequirePermission("customer.update")
  @Patch("customers/:customerId")
  updateCustomer(
    @Param("customerId") customerId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.updateCustomer(
      request.tenant!,
      request.user!.id,
      assertUuid(customerId, "customerId"),
      parseInput(updateCustomerSchema, body),
    );
  }

  @ApiHeader(idempotentHeader)
  @RequirePermission("customer_payment.create")
  @Post("customers/:customerId/payments")
  customerPayment(
    @Param("customerId") customerId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.phase4.customerPayment(
      request.tenant!,
      request.user!.id,
      assertUuid(customerId, "customerId"),
      parseInput(customerPaymentSchema, body),
      idempotencyKey(key),
    );
  }

  @RequirePermission("customer_payment.read")
  @Get("customers/:customerId/payments")
  customerPayments(
    @Param("customerId") customerId: string,
    @Query() query: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.customerPayments(
      request.tenant!,
      assertUuid(customerId, "customerId"),
      parseInput(customerHistoryListSchema, query),
    );
  }

  @RequirePermission("customer_balance.read")
  @Get("customers/:customerId/ledger")
  customerLedger(
    @Param("customerId") customerId: string,
    @Query() query: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.customerLedger(
      request.tenant!,
      assertUuid(customerId, "customerId"),
      parseInput(customerHistoryListSchema, query),
    );
  }

  @RequirePermission("expense_category.create")
  @Post("expense-categories")
  createExpenseCategory(@Body() body: unknown, @Req() request: RequestContext) {
    return this.phase4.createExpenseCategory(
      request.tenant!,
      request.user!.id,
      parseInput(createExpenseCategorySchema, body),
    );
  }

  @RequirePermission("expense_category.read")
  @Get("expense-categories")
  expenseCategories(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase4.expenseCategories(
      request.tenant!,
      parseInput(expenseCategoryListSchema, query),
    );
  }

  @RequirePermission("expense_category.update")
  @Patch("expense-categories/:categoryId")
  updateExpenseCategory(
    @Param("categoryId") categoryId: string,
    @Body() body: unknown,
    @Req() request: RequestContext,
  ) {
    return this.phase4.updateExpenseCategory(
      request.tenant!,
      request.user!.id,
      assertUuid(categoryId, "categoryId"),
      parseInput(updateExpenseCategorySchema, body),
    );
  }

  @ApiHeader(idempotentHeader)
  @RequirePermission("expense.create")
  @Post("expenses")
  createExpense(
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: RequestContext,
  ) {
    return this.phase4.createExpense(
      request.tenant!,
      request.user!.id,
      parseInput(createExpenseSchema, body),
      idempotencyKey(key),
    );
  }

  @RequirePermission("expense.read")
  @Get("expenses")
  expenses(@Query() query: unknown, @Req() request: RequestContext) {
    return this.phase4.expenses(
      request.tenant!,
      parseInput(expenseListSchema, query),
    );
  }

  @RequirePermission("expense.read")
  @Get("expenses/:expenseId")
  expense(
    @Param("expenseId") expenseId: string,
    @Req() request: RequestContext,
  ) {
    return this.phase4.expense(
      request.tenant!,
      assertUuid(expenseId, "expenseId"),
    );
  }
}
