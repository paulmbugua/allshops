import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { EntitlementService } from "./entitlement.service.js";
import type { RequestContext } from "./security.types.js";

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const organizationId = request.params?.organizationId;
    if (!organizationId || !request.tenant) return true;
    const url = request.originalUrl ?? "";
    if (/\/organizations\/[^/]+\/(subscription|billing)(?:\/|\?|$)/.test(url))
      return true;
    if (/\/sync\/sales(?:\?|$)/.test(url)) return true;
    const feature = this.feature(url);
    if (feature) await this.entitlements.assertFeature(organizationId, feature);
    if (request.method !== "GET" && request.method !== "HEAD") {
      await this.entitlements.assertOperational(organizationId);
    }
    return true;
  }

  private feature(url: string) {
    if (/\/appointments(?:\/|\?|$)/.test(url)) return "appointments";
    if (/\/(commissions|commission-rules)(?:\/|\?|$)/.test(url))
      return "commissions";
    if (/\/(sync|devices)(?:\/|\?|$)/.test(url)) return "offline_pos";
    if (/\/reports\/[^/?]+\/export(?:\?|$)/.test(url)) return "exports";
    if (/\/purchases(?:\/|\?|$)/.test(url)) return "purchases";
    if (/\/suppliers(?:\/|\?|$)/.test(url)) return "suppliers";
    if (/\/expenses(?:\/|\?|$)/.test(url)) return "expenses";
    return null;
  }
}
