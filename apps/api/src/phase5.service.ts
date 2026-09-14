import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@allshops/database";
import type {
  AppointmentCancelInput,
  AppointmentListInput,
  AvailabilityLookupInput,
  CommissionListInput,
  CommissionRuleListInput,
  CreateAppointmentInput,
  CreateCommissionRuleInput,
  CreateStaffInput,
  ServiceProfileInput,
  StaffAvailabilityInput,
  StaffBranchInput,
  StaffListInput,
  StaffServiceInput,
  StaffTimeOffInput,
  StaffTimeOffListInput,
  UpdateAppointmentInput,
  UpdateCommissionRuleInput,
  UpdateStaffInput,
  UpdateStaffServiceInput,
} from "@allshops/contracts";
import type { TenantContext } from "./security.types.js";

type Transaction = Prisma.TransactionClient;
type AppointmentDraft = {
  branchId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  primaryStaffProfileId: string;
  startAt: Date;
  notes?: string | null;
  services: Array<{ serviceProductId: string; staffProfileId: string }>;
};
type ResolvedService = {
  organizationId: string;
  serviceProductId: string;
  staffProfileId: string;
  serviceNameSnapshot: string;
  durationMinutesSnapshot: number;
  priceMinorSnapshot: number;
  sequence: number;
  startAt: Date;
  endAt: Date;
  blockedStartAt: Date;
  blockedEndAt: Date;
};

const page = (value: number, size: number) => ({
  skip: (value - 1) * size,
  take: size,
});
const addMinutes = (value: Date, minutes: number) =>
  new Date(value.getTime() + minutes * 60_000);
const overlaps = (
  aStart?: Date | null,
  aEnd?: Date | null,
  bStart?: Date | null,
  bEnd?: Date | null,
) => (!aEnd || !bStart || aEnd > bStart) && (!bEnd || !aStart || bEnd > aStart);

@Injectable()
export class Phase5Service {
  async serviceProfile(tenant: TenantContext, productId: string) {
    const profile = await prisma.serviceProfile.findFirst({
      where: { productId, organizationId: tenant.organizationId },
      include: {
        product: {
          select: { id: true, name: true, priceMinor: true, type: true },
        },
      },
    });
    if (!profile)
      throw this.notFound(
        "SERVICE_PROFILE_NOT_FOUND",
        "Service profile not found.",
      );
    return profile;
  }

  upsertServiceProfile(
    tenant: TenantContext,
    userId: string,
    productId: string,
    input: ServiceProfileInput,
  ) {
    return this.serializable(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: productId,
          organizationId: tenant.organizationId,
          isActive: true,
        },
      });
      if (!product || product.type !== "SERVICE")
        throw this.notFound(
          "SERVICE_PRODUCT_NOT_FOUND",
          "Active service product not found.",
        );
      const profile = await tx.serviceProfile.upsert({
        where: { productId },
        update: input,
        create: { ...input, productId, organizationId: tenant.organizationId },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "SERVICE_PROFILE_UPDATED",
        "ServiceProfile",
        profile.id,
        input,
      );
      return profile;
    });
  }

  createStaff(tenant: TenantContext, userId: string, input: CreateStaffInput) {
    return this.serializable(async (tx) => {
      if (input.userId)
        await this.requireMember(tx, tenant.organizationId, input.userId);
      if (
        input.employeeNumber &&
        (await tx.staffProfile.findFirst({
          where: {
            organizationId: tenant.organizationId,
            employeeNumber: input.employeeNumber,
          },
          select: { id: true },
        }))
      )
        throw this.conflict(
          "STAFF_NUMBER_EXISTS",
          "This staff number is already assigned.",
        );
      const staff = await tx.staffProfile.create({
        data: {
          ...input,
          organizationId: tenant.organizationId,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_CREATED",
        "StaffProfile",
        staff.id,
        { userId: staff.userId },
      );
      return staff;
    });
  }

  async staff(tenant: TenantContext, input: StaffListInput) {
    const where: Prisma.StaffProfileWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? {
            OR: [
              "displayName",
              "employeeNumber",
              "phone",
              "email",
              "jobTitle",
            ].map((field) => ({
              [field]: { contains: input.search, mode: "insensitive" },
            })) as Prisma.StaffProfileWhereInput[],
          }
        : {}),
      ...(input.branchId
        ? { branches: { some: { branchId: input.branchId, isActive: true } } }
        : {}),
      ...(input.serviceProductId
        ? {
            services: {
              some: {
                serviceProductId: input.serviceProductId,
                isActive: true,
              },
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.staffProfile.findMany({
        where,
        ...page(input.page, input.pageSize),
        orderBy: { displayName: "asc" },
        include: {
          branches: {
            where: { isActive: true },
            include: { branch: { select: { id: true, name: true } } },
          },
          services: {
            where: { isActive: true },
            include: { serviceProduct: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.staffProfile.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async staffDetail(tenant: TenantContext, staffId: string) {
    const staff = await prisma.staffProfile.findFirst({
      where: { id: staffId, organizationId: tenant.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        services: {
          include: {
            serviceProduct: {
              select: { id: true, name: true, priceMinor: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        branches: {
          include: { branch: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        availability: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
        timeOff: { orderBy: { startAt: "desc" }, take: 25 },
        commissionRules: {
          where: { isActive: true },
          include: { serviceProduct: { select: { id: true, name: true } } },
        },
      },
    });
    if (!staff)
      throw this.notFound("STAFF_NOT_FOUND", "Staff profile not found.");
    return staff;
  }

  updateStaff(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    input: UpdateStaffInput,
  ) {
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, staffId);
      if (input.userId)
        await this.requireMember(tx, tenant.organizationId, input.userId);
      const staff = await tx.staffProfile.update({
        where: { id: staffId },
        data: input,
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_UPDATED",
        "StaffProfile",
        staff.id,
        input,
      );
      return staff;
    });
  }

  assignService(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    input: StaffServiceInput,
  ) {
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, staffId);
      await this.requireService(
        tx,
        tenant.organizationId,
        input.serviceProductId,
      );
      const result = await tx.staffService.upsert({
        where: {
          staffProfileId_serviceProductId: {
            staffProfileId: staffId,
            serviceProductId: input.serviceProductId,
          },
        },
        update: input,
        create: {
          ...input,
          organizationId: tenant.organizationId,
          staffProfileId: staffId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_SERVICE_ASSIGNED",
        "StaffService",
        result.id,
        input,
      );
      return result;
    });
  }

  async staffServices(tenant: TenantContext, staffId: string) {
    await this.requireStaff(prisma, tenant.organizationId, staffId);
    return prisma.staffService.findMany({
      where: { organizationId: tenant.organizationId, staffProfileId: staffId },
      include: { serviceProduct: { include: { serviceProfile: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  updateStaffService(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    staffServiceId: string,
    input: UpdateStaffServiceInput,
  ) {
    return this.serializable(async (tx) => {
      const current = await tx.staffService.findFirst({
        where: {
          id: staffServiceId,
          staffProfileId: staffId,
          organizationId: tenant.organizationId,
        },
      });
      if (!current)
        throw this.notFound(
          "STAFF_SERVICE_NOT_FOUND",
          "Staff service assignment not found.",
        );
      const result = await tx.staffService.update({
        where: { id: current.id },
        data: input,
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_SERVICE_UPDATED",
        "StaffService",
        result.id,
        input,
      );
      return result;
    });
  }

  assignBranch(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    input: StaffBranchInput,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, staffId);
      await this.requireBranch(tx, tenant.organizationId, input.branchId);
      if (input.isPrimary)
        await tx.staffBranch.updateMany({
          where: { staffProfileId: staffId },
          data: { isPrimary: false },
        });
      const result = await tx.staffBranch.upsert({
        where: {
          staffProfileId_branchId: {
            staffProfileId: staffId,
            branchId: input.branchId,
          },
        },
        update: input,
        create: {
          ...input,
          organizationId: tenant.organizationId,
          staffProfileId: staffId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_BRANCH_ASSIGNED",
        "StaffBranch",
        result.id,
        input,
      );
      return result;
    });
  }

  async staffBranches(tenant: TenantContext, staffId: string) {
    await this.requireStaff(prisma, tenant.organizationId, staffId);
    return prisma.staffBranch.findMany({
      where: { organizationId: tenant.organizationId, staffProfileId: staffId },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  availability(tenant: TenantContext, staffId: string) {
    return this.staffAvailability(tenant, staffId);
  }

  async replaceAvailability(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    input: StaffAvailabilityInput,
  ) {
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, staffId);
      for (const range of input.ranges) {
        this.assertBranchScope(tenant, range.branchId);
        await this.requireBranch(tx, tenant.organizationId, range.branchId);
        const branchAssignment = await tx.staffBranch.findFirst({
          where: {
            staffProfileId: staffId,
            branchId: range.branchId,
            organizationId: tenant.organizationId,
            isActive: true,
          },
        });
        if (!branchAssignment)
          throw this.notFound(
            "STAFF_BRANCH_NOT_FOUND",
            "Staff is not assigned to this branch.",
          );
      }
      for (let index = 0; index < input.ranges.length; index += 1) {
        const range = input.ranges[index]!;
        if (
          input.ranges.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              other.branchId === range.branchId &&
              other.dayOfWeek === range.dayOfWeek &&
              other.startTime < range.endTime &&
              other.endTime > range.startTime,
          )
        )
          throw this.bad(
            "AVAILABILITY_OVERLAP",
            "Availability ranges cannot overlap.",
          );
      }
      await tx.staffAvailability.deleteMany({
        where: {
          organizationId: tenant.organizationId,
          staffProfileId: staffId,
        },
      });
      if (input.ranges.length)
        await tx.staffAvailability.createMany({
          data: input.ranges.map((range) => ({
            ...range,
            organizationId: tenant.organizationId,
            staffProfileId: staffId,
          })),
        });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_AVAILABILITY_UPDATED",
        "StaffProfile",
        staffId,
        { rangeCount: input.ranges.length },
      );
      return tx.staffAvailability.findMany({
        where: { staffProfileId: staffId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
    });
  }

  createTimeOff(
    tenant: TenantContext,
    userId: string,
    staffId: string,
    input: StaffTimeOffInput,
  ) {
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, staffId);
      const result = await tx.staffTimeOff.create({
        data: {
          ...input,
          organizationId: tenant.organizationId,
          staffProfileId: staffId,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "STAFF_TIME_OFF_CREATED",
        "StaffTimeOff",
        result.id,
        { staffId, startAt: input.startAt, endAt: input.endAt },
      );
      return result;
    });
  }

  async timeOff(
    tenant: TenantContext,
    staffId: string,
    input: StaffTimeOffListInput,
  ) {
    await this.requireStaff(prisma, tenant.organizationId, staffId);
    const where: Prisma.StaffTimeOffWhereInput = {
      organizationId: tenant.organizationId,
      staffProfileId: staffId,
      ...(input.dateFrom || input.dateTo
        ? {
            startAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.staffTimeOff.findMany({
        where,
        ...page(input.page, input.pageSize),
        orderBy: { startAt: "desc" },
      }),
      prisma.staffTimeOff.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  createAppointment(
    tenant: TenantContext,
    userId: string,
    input: CreateAppointmentInput,
  ) {
    return this.serializable(async (tx) => {
      await this.lockStaff(
        tx,
        input.services.map((row) => row.staffProfileId),
      );
      const resolved = await this.resolveAppointment(tx, tenant, input);
      await this.assertBookable(tx, tenant, input.branchId, resolved.services);
      const appointment = await tx.appointment.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: input.branchId,
          customerId: resolved.customer?.id,
          customerNameSnapshot: resolved.customer?.name ?? input.customerName,
          customerPhoneSnapshot:
            resolved.customer?.phone ?? input.customerPhone,
          primaryStaffProfileId: input.primaryStaffProfileId,
          status: "BOOKED",
          startAt: resolved.startAt,
          endAt: resolved.endAt,
          blockedStartAt: resolved.blockedStartAt,
          blockedEndAt: resolved.blockedEndAt,
          notes: input.notes,
          createdBy: userId,
          services: { create: resolved.services },
        },
        include: this.appointmentInclude(),
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "APPOINTMENT_CREATED",
        "Appointment",
        appointment.id,
        {
          branchId: appointment.branchId,
          startAt: appointment.startAt,
          staffProfileId: appointment.primaryStaffProfileId,
        },
      );
      return appointment;
    });
  }

  async appointments(
    tenant: TenantContext,
    userId: string,
    input: AppointmentListInput,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    const ownStaffId = await this.ownStaffId(tenant, userId);
    const where: Prisma.AppointmentWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(input.staffProfileId
        ? { services: { some: { staffProfileId: input.staffProfileId } } }
        : {}),
      ...(ownStaffId
        ? { services: { some: { staffProfileId: ownStaffId } } }
        : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            startAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        ...page(input.page, input.pageSize),
        orderBy: { startAt: "asc" },
        include: this.appointmentInclude(),
      }),
      prisma.appointment.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async appointment(
    tenant: TenantContext,
    userId: string,
    appointmentId: string,
  ) {
    const result = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        organizationId: tenant.organizationId,
        ...(tenant.branchId ? { branchId: tenant.branchId } : {}),
      },
      include: this.appointmentInclude(),
    });
    if (!result)
      throw this.notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");
    await this.assertOwnAppointment(
      tenant,
      userId,
      result.services.map((row) => row.staffProfileId),
    );
    return result;
  }

  updateAppointment(
    tenant: TenantContext,
    userId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
  ) {
    return this.serializable(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, organizationId: tenant.organizationId },
        include: { services: true },
      });
      if (!current)
        throw this.notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");
      this.assertBranchScope(tenant, current.branchId);
      if (!["BOOKED", "CONFIRMED"].includes(current.status))
        throw this.conflict(
          "APPOINTMENT_IMMUTABLE",
          "Only booked or confirmed appointments can be rescheduled.",
        );
      const draft: AppointmentDraft = {
        branchId: input.branchId ?? current.branchId,
        customerId:
          input.customerId === undefined
            ? current.customerId
            : input.customerId,
        customerName:
          input.customerName === undefined
            ? current.customerNameSnapshot
            : input.customerName,
        customerPhone:
          input.customerPhone === undefined
            ? current.customerPhoneSnapshot
            : input.customerPhone,
        primaryStaffProfileId:
          input.primaryStaffProfileId ?? current.primaryStaffProfileId,
        startAt: input.startAt ?? current.startAt,
        notes: input.notes === undefined ? current.notes : input.notes,
        services:
          input.services ??
          current.services.map((row) => ({
            serviceProductId: row.serviceProductId,
            staffProfileId: row.staffProfileId,
          })),
      };
      await this.lockStaff(
        tx,
        draft.services.map((row) => row.staffProfileId),
      );
      const resolved = await this.resolveAppointment(tx, tenant, draft);
      await this.assertBookable(
        tx,
        tenant,
        draft.branchId,
        resolved.services,
        current.id,
      );
      await tx.appointmentService.deleteMany({
        where: { appointmentId: current.id },
      });
      const updated = await tx.appointment.update({
        where: { id: current.id },
        data: {
          branchId: draft.branchId,
          customerId: resolved.customer?.id ?? null,
          customerNameSnapshot: resolved.customer?.name ?? draft.customerName,
          customerPhoneSnapshot:
            resolved.customer?.phone ?? draft.customerPhone,
          primaryStaffProfileId: draft.primaryStaffProfileId,
          startAt: resolved.startAt,
          endAt: resolved.endAt,
          blockedStartAt: resolved.blockedStartAt,
          blockedEndAt: resolved.blockedEndAt,
          notes: draft.notes,
          services: { create: resolved.services },
        },
        include: this.appointmentInclude(),
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "APPOINTMENT_UPDATED",
        "Appointment",
        updated.id,
        input,
      );
      return updated;
    });
  }

  transition(
    tenant: TenantContext,
    userId: string,
    appointmentId: string,
    action: "confirm" | "start" | "complete" | "cancel" | "no-show",
    input?: AppointmentCancelInput,
  ) {
    const transitions = {
      confirm: {
        from: ["BOOKED"],
        to: "CONFIRMED",
        timestamp: "confirmedAt",
        audit: "APPOINTMENT_CONFIRMED",
      },
      start: {
        from: ["CONFIRMED"],
        to: "IN_PROGRESS",
        timestamp: "startedAt",
        audit: "APPOINTMENT_STARTED",
      },
      complete: {
        from: ["IN_PROGRESS"],
        to: "COMPLETED",
        timestamp: "completedAt",
        audit: "APPOINTMENT_COMPLETED",
      },
      cancel: {
        from: ["BOOKED", "CONFIRMED"],
        to: "CANCELLED",
        timestamp: "cancelledAt",
        audit: "APPOINTMENT_CANCELLED",
      },
      "no-show": {
        from: ["BOOKED", "CONFIRMED"],
        to: "NO_SHOW",
        timestamp: "noShowAt",
        audit: "APPOINTMENT_NO_SHOW",
      },
    } as const;
    return this.serializable(async (tx) => {
      const current = await tx.appointment.findFirst({
        where: { id: appointmentId, organizationId: tenant.organizationId },
        include: { services: true },
      });
      if (!current)
        throw this.notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");
      this.assertBranchScope(tenant, current.branchId);
      await this.assertOwnAppointment(
        tenant,
        userId,
        current.services.map((row) => row.staffProfileId),
      );
      const rule = transitions[action];
      if (!(rule.from as readonly string[]).includes(current.status))
        throw this.conflict(
          "INVALID_APPOINTMENT_TRANSITION",
          `Cannot ${action} an appointment in ${current.status} status.`,
        );
      const result = await tx.appointment.update({
        where: { id: current.id },
        data: {
          status: rule.to,
          [rule.timestamp]: new Date(),
          ...(action === "cancel"
            ? { cancellationReason: input?.cancellationReason }
            : {}),
        },
        include: this.appointmentInclude(),
      });
      await this.audit(
        tx,
        tenant,
        userId,
        rule.audit,
        "Appointment",
        result.id,
        { from: current.status, to: result.status },
      );
      return result;
    });
  }

  async lookupAvailability(
    tenant: TenantContext,
    input: AvailabilityLookupInput,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    await this.requireBranch(prisma, tenant.organizationId, input.branchId);
    const service = await this.requireService(
      prisma,
      tenant.organizationId,
      input.serviceProductId,
    );
    const staffRows = await prisma.staffService.findMany({
      where: {
        organizationId: tenant.organizationId,
        serviceProductId: input.serviceProductId,
        isActive: true,
        ...(input.staffProfileId
          ? { staffProfileId: input.staffProfileId }
          : {}),
        staffProfile: {
          isActive: true,
          isBookable: true,
          branches: { some: { branchId: input.branchId, isActive: true } },
        },
      },
      include: { staffProfile: true },
    });
    const slots: Array<{
      staffProfileId: string;
      staffName: string;
      startAt: Date;
      endAt: Date;
      priceMinor: number;
    }> = [];
    for (const assignment of staffRows) {
      const duration =
        assignment.customDurationMinutes ??
        service.serviceProfile!.durationMinutes;
      const ranges = await prisma.staffAvailability.findMany({
        where: {
          organizationId: tenant.organizationId,
          staffProfileId: assignment.staffProfileId,
          branchId: input.branchId,
          isActive: true,
        },
      });
      for (const range of ranges) {
        const localDate = new Date(`${input.date}T12:00:00+03:00`);
        if (localDate.getUTCDay() !== range.dayOfWeek) continue;
        let cursor = addMinutes(
          new Date(`${input.date}T${range.startTime}:00+03:00`),
          service.serviceProfile!.bufferBeforeMinutes,
        );
        const rangeEnd = new Date(`${input.date}T${range.endTime}:00+03:00`);
        while (
          addMinutes(
            cursor,
            duration + service.serviceProfile!.bufferAfterMinutes,
          ) <= rangeEnd
        ) {
          const blockedStart = addMinutes(
            cursor,
            -service.serviceProfile!.bufferBeforeMinutes,
          );
          const endAt = addMinutes(cursor, duration);
          const blockedEnd = addMinutes(
            endAt,
            service.serviceProfile!.bufferAfterMinutes,
          );
          const unavailable = await this.hasConflict(
            prisma,
            tenant.organizationId,
            assignment.staffProfileId,
            blockedStart,
            blockedEnd,
          );
          if (!unavailable)
            slots.push({
              staffProfileId: assignment.staffProfileId,
              staffName: assignment.staffProfile.displayName,
              startAt: cursor,
              endAt,
              priceMinor: assignment.customPriceMinor ?? service.priceMinor,
            });
          cursor = addMinutes(cursor, 15);
        }
      }
    }
    return {
      date: input.date,
      serviceProductId: input.serviceProductId,
      slots,
    };
  }

  createCommissionRule(
    tenant: TenantContext,
    userId: string,
    input: CreateCommissionRuleInput,
  ) {
    return this.serializable(async (tx) => {
      await this.requireStaff(tx, tenant.organizationId, input.staffProfileId);
      if (input.serviceProductId)
        await this.requireService(
          tx,
          tenant.organizationId,
          input.serviceProductId,
        );
      await this.assertRuleUnique(tx, tenant.organizationId, input);
      const rule = await tx.commissionRule.create({
        data: {
          ...this.ruleData(input),
          organizationId: tenant.organizationId,
          createdBy: userId,
        },
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "COMMISSION_RULE_CREATED",
        "CommissionRule",
        rule.id,
        input,
      );
      return rule;
    });
  }

  async commissionRules(tenant: TenantContext, input: CommissionRuleListInput) {
    const where: Prisma.CommissionRuleWhereInput = {
      organizationId: tenant.organizationId,
      ...(input.staffProfileId ? { staffProfileId: input.staffProfileId } : {}),
      ...(input.serviceProductId
        ? { serviceProductId: input.serviceProductId }
        : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    };
    const [items, total] = await prisma.$transaction([
      prisma.commissionRule.findMany({
        where,
        ...page(input.page, input.pageSize),
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        include: {
          staffProfile: { select: { id: true, displayName: true } },
          serviceProduct: { select: { id: true, name: true } },
        },
      }),
      prisma.commissionRule.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async commissionRule(tenant: TenantContext, ruleId: string) {
    const rule = await prisma.commissionRule.findFirst({
      where: { id: ruleId, organizationId: tenant.organizationId },
      include: { staffProfile: true, serviceProduct: true },
    });
    if (!rule)
      throw this.notFound(
        "COMMISSION_RULE_NOT_FOUND",
        "Commission rule not found.",
      );
    return rule;
  }

  updateCommissionRule(
    tenant: TenantContext,
    userId: string,
    ruleId: string,
    input: UpdateCommissionRuleInput,
  ) {
    return this.serializable(async (tx) => {
      const current = await tx.commissionRule.findFirst({
        where: { id: ruleId, organizationId: tenant.organizationId },
      });
      if (!current)
        throw this.notFound(
          "COMMISSION_RULE_NOT_FOUND",
          "Commission rule not found.",
        );
      const merged: CreateCommissionRuleInput = {
        staffProfileId: input.staffProfileId ?? current.staffProfileId,
        serviceProductId:
          input.serviceProductId === undefined
            ? current.serviceProductId
            : input.serviceProductId,
        type: input.type ?? current.type,
        basisPoints:
          input.basisPoints === undefined
            ? current.basisPoints
            : input.basisPoints,
        valueMinor:
          input.valueMinor === undefined
            ? current.valueMinor
            : input.valueMinor,
        priority: input.priority ?? current.priority,
        effectiveFrom:
          input.effectiveFrom === undefined
            ? current.effectiveFrom
            : input.effectiveFrom,
        effectiveTo:
          input.effectiveTo === undefined
            ? current.effectiveTo
            : input.effectiveTo,
        isActive: input.isActive ?? current.isActive,
      };
      if (merged.type === "PERCENTAGE" && merged.basisPoints == null)
        throw this.bad(
          "INVALID_COMMISSION_RULE",
          "basisPoints is required for percentage rules.",
        );
      if (merged.type === "FIXED" && merged.valueMinor == null)
        throw this.bad(
          "INVALID_COMMISSION_RULE",
          "valueMinor is required for fixed rules.",
        );
      if (
        merged.effectiveFrom &&
        merged.effectiveTo &&
        merged.effectiveTo <= merged.effectiveFrom
      )
        throw this.bad(
          "INVALID_COMMISSION_PERIOD",
          "effectiveTo must be after effectiveFrom.",
        );
      await this.requireStaff(tx, tenant.organizationId, merged.staffProfileId);
      if (merged.serviceProductId)
        await this.requireService(
          tx,
          tenant.organizationId,
          merged.serviceProductId,
        );
      if (merged.isActive)
        await this.assertRuleUnique(
          tx,
          tenant.organizationId,
          merged,
          current.id,
        );
      const rule = await tx.commissionRule.update({
        where: { id: current.id },
        data: this.ruleData(merged),
      });
      await this.audit(
        tx,
        tenant,
        userId,
        "COMMISSION_RULE_UPDATED",
        "CommissionRule",
        rule.id,
        input,
      );
      return rule;
    });
  }

  async commissions(
    tenant: TenantContext,
    userId: string,
    input: CommissionListInput,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    const ownStaffId = await this.ownCommissionStaffId(tenant, userId);
    const where: Prisma.CommissionWhereInput = {
      organizationId: tenant.organizationId,
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(ownStaffId
        ? { staffProfileId: ownStaffId }
        : input.staffProfileId
          ? { staffProfileId: input.staffProfileId }
          : {}),
      ...(input.saleId ? { saleId: input.saleId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            earnedAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.commission.findMany({
        where,
        ...page(input.page, input.pageSize),
        orderBy: { earnedAt: "desc" },
        include: {
          staffProfile: { select: { id: true, displayName: true } },
          sale: { select: { id: true, invoiceNumber: true } },
          saleItem: { select: { productNameSnapshot: true } },
        },
      }),
      prisma.commission.count({ where }),
    ]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }

  async commissionSummary(
    tenant: TenantContext,
    userId: string,
    input: CommissionListInput,
  ) {
    const result = await this.commissions(tenant, userId, {
      ...input,
      page: 1,
      pageSize: 100,
    });
    const ownStaffId = await this.ownCommissionStaffId(tenant, userId);
    const where: Prisma.CommissionWhereInput = {
      organizationId: tenant.organizationId,
      status: "EARNED",
      ...(tenant.branchId
        ? { branchId: tenant.branchId }
        : input.branchId
          ? { branchId: input.branchId }
          : {}),
      ...(ownStaffId
        ? { staffProfileId: ownStaffId }
        : input.staffProfileId
          ? { staffProfileId: input.staffProfileId }
          : {}),
      ...(input.dateFrom || input.dateTo
        ? {
            earnedAt: {
              ...(input.dateFrom ? { gte: input.dateFrom } : {}),
              ...(input.dateTo ? { lte: input.dateTo } : {}),
            },
          }
        : {}),
    };
    const aggregate = await prisma.commission.aggregate({
      where,
      _sum: { commissionAmountMinor: true },
      _count: true,
    });
    return {
      earnedMinor: aggregate._sum.commissionAmountMinor ?? 0,
      commissionCount: aggregate._count,
      filteredCount: result.total,
    };
  }

  private async resolveAppointment(
    tx: Transaction,
    tenant: TenantContext,
    input: AppointmentDraft,
  ) {
    this.assertBranchScope(tenant, input.branchId);
    await this.requireBranch(tx, tenant.organizationId, input.branchId);
    const customer = input.customerId
      ? await tx.customer.findFirst({
          where: {
            id: input.customerId,
            organizationId: tenant.organizationId,
            isActive: true,
          },
        })
      : null;
    if (input.customerId && !customer)
      throw this.notFound("CUSTOMER_NOT_FOUND", "Active customer not found.");
    if (!customer && !input.customerName && !input.customerPhone)
      throw this.bad(
        "BOOKING_IDENTITY_REQUIRED",
        "A customer or quick-booking name/phone is required.",
      );
    let cursor = input.startAt;
    const services: ResolvedService[] = [];
    for (let sequence = 0; sequence < input.services.length; sequence += 1) {
      const requested = input.services[sequence]!;
      const service = await this.requireService(
        tx,
        tenant.organizationId,
        requested.serviceProductId,
      );
      const staffService = await tx.staffService.findFirst({
        where: {
          organizationId: tenant.organizationId,
          staffProfileId: requested.staffProfileId,
          serviceProductId: requested.serviceProductId,
          isActive: true,
          staffProfile: {
            isActive: true,
            isBookable: true,
            branches: { some: { branchId: input.branchId, isActive: true } },
          },
        },
      });
      if (!staffService)
        throw this.notFound(
          "STAFF_SERVICE_NOT_FOUND",
          "Bookable staff capability was not found for this branch and service.",
        );
      const profile = service.serviceProfile!;
      const duration =
        staffService.customDurationMinutes ?? profile.durationMinutes;
      const startAt =
        sequence === 0
          ? cursor
          : addMinutes(cursor, profile.bufferBeforeMinutes);
      const blockedStartAt = addMinutes(startAt, -profile.bufferBeforeMinutes);
      const endAt = addMinutes(startAt, duration);
      const blockedEndAt = addMinutes(endAt, profile.bufferAfterMinutes);
      services.push({
        organizationId: tenant.organizationId,
        serviceProductId: service.id,
        staffProfileId: requested.staffProfileId,
        serviceNameSnapshot: service.name,
        durationMinutesSnapshot: duration,
        priceMinorSnapshot: staffService.customPriceMinor ?? service.priceMinor,
        sequence,
        startAt,
        endAt,
        blockedStartAt,
        blockedEndAt,
      });
      cursor = blockedEndAt;
    }
    if (
      !services.some(
        (row) => row.staffProfileId === input.primaryStaffProfileId,
      )
    )
      throw this.bad(
        "PRIMARY_STAFF_INVALID",
        "Primary staff must perform at least one appointment service.",
      );
    return {
      customer,
      services,
      startAt: services[0]!.startAt,
      endAt: services.at(-1)!.endAt,
      blockedStartAt: services[0]!.blockedStartAt,
      blockedEndAt: services.at(-1)!.blockedEndAt,
    };
  }

  private async assertBookable(
    tx: Transaction,
    tenant: TenantContext,
    branchId: string,
    services: ResolvedService[],
    excludeAppointmentId?: string,
  ) {
    for (const row of services) {
      const local = this.localParts(row.blockedStartAt);
      const localEnd = this.localParts(row.blockedEndAt);
      const schedule = await tx.staffAvailability.findFirst({
        where: {
          organizationId: tenant.organizationId,
          staffProfileId: row.staffProfileId,
          branchId,
          dayOfWeek: local.day,
          isActive: true,
          startTime: { lte: local.time },
          endTime: { gte: localEnd.time },
        },
      });
      if (!schedule || local.date !== localEnd.date)
        throw this.conflict(
          "STAFF_UNAVAILABLE",
          "Appointment is outside staff working hours.",
        );
      if (
        await this.hasConflict(
          tx,
          tenant.organizationId,
          row.staffProfileId,
          row.blockedStartAt,
          row.blockedEndAt,
          excludeAppointmentId,
        )
      )
        throw this.conflict(
          "APPOINTMENT_OVERLAP",
          "Staff already has an appointment or time off in this period.",
        );
    }
  }

  private async hasConflict(
    tx: Transaction | typeof prisma,
    organizationId: string,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ) {
    const [appointment, timeOff] = await Promise.all([
      tx.appointmentService.findFirst({
        where: {
          organizationId,
          staffProfileId: staffId,
          blockedStartAt: { lt: endAt },
          blockedEndAt: { gt: startAt },
          appointment: {
            status: { notIn: ["CANCELLED", "NO_SHOW"] },
            ...(excludeAppointmentId
              ? { id: { not: excludeAppointmentId } }
              : {}),
          },
        },
        select: { id: true },
      }),
      tx.staffTimeOff.findFirst({
        where: {
          organizationId,
          staffProfileId: staffId,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { id: true },
      }),
    ]);
    return Boolean(appointment || timeOff);
  }

  private localParts(value: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Qatar",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const days: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return {
      day: days[get("weekday")]!,
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${get("hour")}:${get("minute")}`,
    };
  }

  private appointmentInclude() {
    return {
      branch: { select: { id: true, name: true, code: true } },
      customer: { select: { id: true, name: true, phone: true } },
      primaryStaff: { select: { id: true, displayName: true, jobTitle: true } },
      creator: { select: { id: true, name: true } },
      sale: {
        select: {
          id: true,
          invoiceNumber: true,
          totalMinor: true,
          paymentStatus: true,
        },
      },
      services: {
        orderBy: { sequence: "asc" as const },
        include: { staffProfile: { select: { id: true, displayName: true } } },
      },
    };
  }

  private ruleData(input: CreateCommissionRuleInput) {
    return {
      ...input,
      basisPoints: input.type === "PERCENTAGE" ? input.basisPoints : null,
      valueMinor: input.type === "FIXED" ? input.valueMinor : null,
    };
  }

  private async assertRuleUnique(
    tx: Transaction,
    organizationId: string,
    input: CreateCommissionRuleInput,
    excludeId?: string,
  ) {
    const rules = await tx.commissionRule.findMany({
      where: {
        organizationId,
        staffProfileId: input.staffProfileId,
        serviceProductId: input.serviceProductId ?? null,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (
      rules.some((rule) =>
        overlaps(
          rule.effectiveFrom,
          rule.effectiveTo,
          input.effectiveFrom,
          input.effectiveTo,
        ),
      )
    )
      throw this.conflict(
        "AMBIGUOUS_COMMISSION_RULE",
        "An active commission rule already covers this staff/service period.",
      );
  }

  private async ownStaffId(tenant: TenantContext, userId: string) {
    if (
      tenant.roleCode !== "SERVICE_STAFF" ||
      tenant.permissions.includes("appointment.read_all")
    )
      return null;
    const staff = await prisma.staffProfile.findFirst({
      where: { organizationId: tenant.organizationId, userId, isActive: true },
      select: { id: true },
    });
    if (!staff)
      throw new ForbiddenException({
        code: "STAFF_PROFILE_REQUIRED",
        message: "A linked staff profile is required.",
      });
    return staff.id;
  }

  private async ownCommissionStaffId(tenant: TenantContext, userId: string) {
    if (tenant.permissions.includes("commission.read_all")) return null;
    if (!tenant.permissions.includes("commission.read_own"))
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "Commission access is not allowed.",
      });
    const staff = await prisma.staffProfile.findFirst({
      where: { organizationId: tenant.organizationId, userId, isActive: true },
      select: { id: true },
    });
    if (!staff)
      throw new ForbiddenException({
        code: "STAFF_PROFILE_REQUIRED",
        message: "A linked staff profile is required.",
      });
    return staff.id;
  }

  private async assertOwnAppointment(
    tenant: TenantContext,
    userId: string,
    staffIds: string[],
  ) {
    const own = await this.ownStaffId(tenant, userId);
    if (own && !staffIds.includes(own))
      throw this.notFound("APPOINTMENT_NOT_FOUND", "Appointment not found.");
  }

  private async lockStaff(tx: Transaction, staffIds: string[]) {
    for (const id of [...new Set(staffIds)].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-staff:${id}`}))`;
  }

  private async staffAvailability(tenant: TenantContext, staffId: string) {
    await this.requireStaff(prisma, tenant.organizationId, staffId);
    return prisma.staffAvailability.findMany({
      where: { organizationId: tenant.organizationId, staffProfileId: staffId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }

  private async requireMember(
    tx: Transaction,
    organizationId: string,
    userId: string,
  ) {
    const member = await tx.organizationUser.findFirst({
      where: { organizationId, userId, status: "ACTIVE" },
    });
    if (!member)
      throw this.notFound(
        "ORGANIZATION_USER_NOT_FOUND",
        "Active organization user not found.",
      );
    return member;
  }

  private async requireStaff(
    tx: Transaction | typeof prisma,
    organizationId: string,
    staffId: string,
  ) {
    const staff = await tx.staffProfile.findFirst({
      where: { id: staffId, organizationId },
    });
    if (!staff)
      throw this.notFound("STAFF_NOT_FOUND", "Staff profile not found.");
    return staff;
  }

  private async requireBranch(
    tx: Transaction | typeof prisma,
    organizationId: string,
    branchId: string,
  ) {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, organizationId, isActive: true },
    });
    if (!branch)
      throw this.notFound("BRANCH_NOT_FOUND", "Active branch not found.");
    return branch;
  }

  private async requireService(
    tx: Transaction | typeof prisma,
    organizationId: string,
    productId: string,
  ) {
    const service = await tx.product.findFirst({
      where: { id: productId, organizationId, type: "SERVICE", isActive: true },
      include: { serviceProfile: true },
    });
    if (
      !service?.serviceProfile?.isActive ||
      !service.serviceProfile.appointmentEnabled
    )
      throw this.notFound(
        "SERVICE_NOT_BOOKABLE",
        "Appointment-enabled service not found.",
      );
    return service;
  }

  private assertBranchScope(tenant: TenantContext, branchId?: string) {
    if (tenant.branchId && branchId && tenant.branchId !== branchId)
      throw this.notFound("BRANCH_NOT_FOUND", "Branch not found.");
  }

  private audit(
    tx: Transaction,
    tenant: TenantContext,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action,
        entityType,
        entityId,
        afterJson: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue,
      },
    });
  }

  private serializable<T>(
    work: (tx: Transaction) => Promise<T>,
    attempt = 0,
  ): Promise<T> {
    return prisma
      .$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 3
        )
          return this.serializable(work, attempt + 1);
        throw error;
      });
  }

  private bad(code: string, message: string) {
    return new BadRequestException({ code, message });
  }
  private conflict(code: string, message: string) {
    return new ConflictException({ code, message });
  }
  private notFound(code: string, message: string) {
    return new NotFoundException({ code, message });
  }
}
