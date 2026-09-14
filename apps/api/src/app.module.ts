import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard.js";
import { AuthService } from "./auth.service.js";
import { BranchesController } from "./branches.controller.js";
import { BranchesService } from "./branches.service.js";
import { CatalogueController } from "./catalogue.controller.js";
import { CatalogueService } from "./catalogue.service.js";
import { ContextController } from "./context.controller.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { InventoryController } from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";
import { OrganizationsController } from "./organizations.controller.js";
import { OrganizationsService } from "./organizations.service.js";
import { PermissionGuard } from "./permission.guard.js";
import { EntitlementService } from "./entitlement.service.js";
import { SubscriptionGuard } from "./subscription.guard.js";
import {
  PlatformSubscriptionsController,
  SubscriptionsController,
} from "./subscriptions.controller.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";
import { Phase4Controller } from "./phase4.controller.js";
import { Phase4Service } from "./phase4.service.js";
import { Phase5Controller } from "./phase5.controller.js";
import { Phase5Service } from "./phase5.service.js";
import { SalesController } from "./sales.controller.js";
import { SalesService } from "./sales.service.js";
import { PaystackController } from "./paystack.controller.js";
import { PaystackService } from "./paystack.service.js";
import { SyncController } from "./sync.controller.js";
import { SyncService } from "./sync.service.js";
import { TokenService } from "./token.service.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";
import { OperationalRateLimitGuard } from "./operational-rate-limit.guard.js";
import { SystemController } from "./system.controller.js";
import { PilotController, SupportController } from "./pilot.controller.js";
import { PilotService } from "./pilot.service.js";
import {
  ProductImagesController,
  ProductImageUploadsController,
} from "./product-images.controller.js";
import { ProductImagesService } from "./product-images.service.js";
import { MailService } from "./mail.service.js";

@Module({
  controllers: [
    HealthController,
    SystemController,
    AuthController,
    OrganizationsController,
    BranchesController,
    UsersController,
    ContextController,
    CatalogueController,
    InventoryController,
    SalesController,
    Phase4Controller,
    Phase5Controller,
    ReportsController,
    SyncController,
    SubscriptionsController,
    PlatformSubscriptionsController,
    PaystackController,
    PilotController,
    SupportController,
    ProductImageUploadsController,
    ProductImagesController,
  ],
  providers: [
    HealthService,
    TokenService,
    AuthService,
    AuthRateLimitGuard,
    OrganizationsService,
    BranchesService,
    UsersService,
    CatalogueService,
    InventoryService,
    SalesService,
    Phase4Service,
    Phase5Service,
    ReportsService,
    SyncService,
    EntitlementService,
    SubscriptionsService,
    PaystackService,
    OperationalRateLimitGuard,
    PilotService,
    ProductImagesService,
    MailService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: OperationalRateLimitGuard },
  ],
})
export class AppModule {}
