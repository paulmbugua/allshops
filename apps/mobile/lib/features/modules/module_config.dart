import 'package:flutter/material.dart';

enum FieldKind { text, email, phone, money, choice, toggle }

class FormFieldSpec {
  const FormFieldSpec(
    this.key,
    this.label, {
    this.kind = FieldKind.text,
    this.required = false,
    this.options = const [],
    this.initial,
  });
  final String key;
  final String label;
  final FieldKind kind;
  final bool required;
  final List<String> options;
  final Object? initial;
}

class RecordAction {
  const RecordAction(
    this.label,
    this.suffix,
    this.icon, {
    this.allowedStatuses = const [],
    this.destructive = false,
    this.body = const {},
    this.permission,
    this.visibleWhen = const {},
  });
  final String label;
  final String suffix;
  final IconData icon;
  final List<String> allowedStatuses;
  final bool destructive;
  final Map<String, dynamic> body;
  final String? permission;
  final Map<String, Object?> visibleWhen;
}

class ModuleConfig {
  const ModuleConfig({
    required this.title,
    required this.path,
    required this.icon,
    required this.color,
    this.idKeys = const ['id'],
    this.detail = true,
    this.createFields = const [],
    this.actions = const [],
    this.subtitleKeys = const ['status', 'email', 'phone', 'code'],
    this.searchable = true,
  });
  final String title;
  final String path;
  final IconData icon;
  final Color color;
  final List<String> idKeys;
  final bool detail;
  final List<FormFieldSpec> createFields;
  final List<RecordAction> actions;
  final List<String> subtitleKeys;
  final bool searchable;
}

final moduleConfigs = <String, ModuleConfig>{
  'products': const ModuleConfig(
    title: 'Products',
    path: 'products',
    icon: Icons.sell_outlined,
    color: Color(0xFFF35F45),
    idKeys: ['id', 'productId'],
    subtitleKeys: ['sku', 'barcode', 'type'],
  ),
  'categories': const ModuleConfig(
    title: 'Categories',
    path: 'categories',
    icon: Icons.category_outlined,
    color: Color(0xFFE5814E),
    createFields: [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('arabicName', 'Arabic name'),
      FormFieldSpec('description', 'Description'),
    ],
  ),
  'brands': const ModuleConfig(
    title: 'Brands',
    path: 'brands',
    icon: Icons.loyalty_outlined,
    color: Color(0xFF9C67C7),
    createFields: [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('description', 'Description'),
    ],
  ),
  'units': const ModuleConfig(
    title: 'Units',
    path: 'units',
    icon: Icons.straighten_outlined,
    color: Color(0xFF4F8EC9),
    createFields: [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('symbol', 'Symbol', required: true),
    ],
  ),
  'sales': const ModuleConfig(
    title: 'Sales',
    path: 'sales',
    icon: Icons.receipt_long_outlined,
    color: Color(0xFF35B77D),
    idKeys: ['id', 'saleId'],
    subtitleKeys: ['saleNumber', 'status', 'paymentStatus'],
    actions: [
      RecordAction(
        'Cancel draft',
        'cancel',
        Icons.cancel_outlined,
        allowedStatuses: ['DRAFT'],
        destructive: true,
        permission: 'sale.cancel_draft',
      ),
    ],
  ),
  'sales/held': const ModuleConfig(
    title: 'Held sales',
    path: 'sales/held',
    icon: Icons.pause_circle_outline,
    color: Color(0xFFE0A72F),
    idKeys: ['id', 'saleId'],
    actions: [
      RecordAction(
        'Cancel',
        'cancel',
        Icons.cancel_outlined,
        allowedStatuses: ['DRAFT'],
        destructive: true,
        permission: 'sale.cancel_draft',
      ),
    ],
  ),
  'customers': const ModuleConfig(
    title: 'Customers',
    path: 'customers',
    icon: Icons.people_alt_outlined,
    color: Color(0xFF6F8FE8),
    idKeys: ['id', 'customerId'],
    createFields: [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('phone', 'Phone', kind: FieldKind.phone),
      FormFieldSpec('email', 'Email', kind: FieldKind.email),
      FormFieldSpec(
        'language',
        'Language',
        kind: FieldKind.choice,
        options: ['en', 'ar'],
      ),
      FormFieldSpec(
        'creditLimitMinor',
        'Credit limit (QAR)',
        kind: FieldKind.money,
      ),
      FormFieldSpec('notes', 'Notes'),
    ],
  ),
  'purchases': const ModuleConfig(
    title: 'Purchases',
    path: 'purchases',
    icon: Icons.local_shipping_outlined,
    color: Color(0xFFE1A523),
    idKeys: ['id', 'purchaseId'],
    subtitleKeys: ['purchaseNumber', 'status', 'paymentStatus'],
    actions: [
      RecordAction(
        'Cancel draft',
        'cancel',
        Icons.cancel_outlined,
        allowedStatuses: ['DRAFT'],
        permission: 'purchase.cancel_draft',
        destructive: true,
      ),
    ],
  ),
  'suppliers': const ModuleConfig(
    title: 'Suppliers',
    path: 'suppliers',
    icon: Icons.warehouse_outlined,
    color: Color(0xFF536FC2),
    idKeys: ['id', 'supplierId'],
    createFields: [
      FormFieldSpec('name', 'Business name', required: true),
      FormFieldSpec('contactName', 'Contact person'),
      FormFieldSpec('phone', 'Phone', kind: FieldKind.phone),
      FormFieldSpec('email', 'Email', kind: FieldKind.email),
      FormFieldSpec('address', 'Address'),
      FormFieldSpec('taxNumber', 'Tax number'),
      FormFieldSpec('notes', 'Notes'),
    ],
  ),
  'expenses': const ModuleConfig(
    title: 'Expenses',
    path: 'expenses',
    icon: Icons.account_balance_wallet_outlined,
    color: Color(0xFFB36AD4),
    idKeys: ['id', 'expenseId'],
    subtitleKeys: ['description', 'paymentMethod', 'expenseDate'],
  ),
  'expense-categories': const ModuleConfig(
    title: 'Expense categories',
    path: 'expense-categories',
    icon: Icons.folder_outlined,
    color: Color(0xFFA764C3),
    createFields: [
      FormFieldSpec('name', 'Name', required: true),
      FormFieldSpec('description', 'Description'),
    ],
  ),
  'appointments': const ModuleConfig(
    title: 'Appointments',
    path: 'appointments',
    icon: Icons.calendar_month_outlined,
    color: Color(0xFFEF779F),
    idKeys: ['id', 'appointmentId'],
    subtitleKeys: ['customerName', 'startAt', 'status'],
    actions: [
      RecordAction(
        'Confirm',
        'confirm',
        Icons.check_circle_outline,
        allowedStatuses: ['BOOKED'],
        permission: 'appointment.confirm',
      ),
      RecordAction(
        'Start',
        'start',
        Icons.play_circle_outline,
        allowedStatuses: ['CONFIRMED'],
        permission: 'appointment.start',
      ),
      RecordAction(
        'Complete',
        'complete',
        Icons.task_alt,
        allowedStatuses: ['IN_PROGRESS'],
        permission: 'appointment.complete',
      ),
      RecordAction(
        'No show',
        'no-show',
        Icons.person_off_outlined,
        allowedStatuses: ['BOOKED', 'CONFIRMED'],
        destructive: true,
        permission: 'appointment.no_show',
      ),
      RecordAction(
        'Cancel',
        'cancel',
        Icons.cancel_outlined,
        allowedStatuses: ['BOOKED', 'CONFIRMED'],
        destructive: true,
        permission: 'appointment.cancel',
      ),
    ],
  ),
  'staff': const ModuleConfig(
    title: 'Staff',
    path: 'staff',
    icon: Icons.badge_outlined,
    color: Color(0xFF269AA6),
    idKeys: ['id', 'staffProfileId'],
    createFields: [
      FormFieldSpec('displayName', 'Display name', required: true),
      FormFieldSpec('phone', 'Phone', kind: FieldKind.phone),
      FormFieldSpec('email', 'Email', kind: FieldKind.email),
      FormFieldSpec('jobTitle', 'Job title'),
      FormFieldSpec(
        'isBookable',
        'Bookable',
        kind: FieldKind.toggle,
        initial: true,
      ),
    ],
  ),
  'commissions': const ModuleConfig(
    title: 'Commissions',
    path: 'commissions',
    icon: Icons.percent_rounded,
    color: Color(0xFFDA7F32),
    detail: false,
  ),
  'commission-rules': const ModuleConfig(
    title: 'Commission rules',
    path: 'commission-rules',
    icon: Icons.rule_outlined,
    color: Color(0xFFD26D45),
    idKeys: ['id', 'ruleId'],
  ),
  'branches': const ModuleConfig(
    title: 'Branches',
    path: 'branches',
    icon: Icons.store_mall_directory_outlined,
    color: Color(0xFF318C6B),
    idKeys: ['id', 'branchId'],
    createFields: [
      FormFieldSpec('name', 'Branch name', required: true),
      FormFieldSpec('code', 'Code', required: true),
      FormFieldSpec('phone', 'Phone', kind: FieldKind.phone),
      FormFieldSpec('email', 'Email', kind: FieldKind.email),
      FormFieldSpec('address', 'Address'),
    ],
  ),
  'users': const ModuleConfig(
    title: 'Users',
    path: 'users',
    icon: Icons.manage_accounts_outlined,
    color: Color(0xFF7E69B5),
    idKeys: ['id', 'membershipId'],
    detail: false,
  ),
  'devices': const ModuleConfig(
    title: 'Devices',
    path: 'devices',
    icon: Icons.devices_other_rounded,
    color: Color(0xFF378BA5),
    idKeys: ['id', 'deviceId'],
    actions: [
      RecordAction(
        'Revoke device',
        'revoke',
        Icons.block_outlined,
        destructive: true,
        permission: 'device.manage',
      ),
    ],
  ),
  'inventory': const ModuleConfig(
    title: 'Inventory',
    path: 'inventory',
    icon: Icons.inventory_2_outlined,
    color: Color(0xFF268D75),
    detail: false,
    subtitleKeys: ['productName', 'variantName', 'quantity'],
  ),
  'inventory/movements': const ModuleConfig(
    title: 'Stock movements',
    path: 'inventory/movements',
    icon: Icons.swap_vert_circle_outlined,
    color: Color(0xFF417BC3),
    detail: false,
  ),
  'inventory/reconciliation': const ModuleConfig(
    title: 'Reconciliation',
    path: 'inventory/reconciliation',
    icon: Icons.fact_check_outlined,
    color: Color(0xFF4E9D75),
    detail: false,
  ),
  'inventory/transfers': const ModuleConfig(
    title: 'Transfers',
    path: 'inventory/transfers',
    icon: Icons.compare_arrows_rounded,
    color: Color(0xFF705CC4),
    idKeys: ['id', 'transferId'],
    actions: [
      RecordAction(
        'Send',
        'send',
        Icons.outbound_outlined,
        allowedStatuses: ['DRAFT'],
        permission: 'inventory.transfer',
      ),
      RecordAction(
        'Receive',
        'receive',
        Icons.move_to_inbox_outlined,
        allowedStatuses: ['SENT'],
        permission: 'inventory.transfer.receive',
      ),
      RecordAction(
        'Cancel',
        'cancel',
        Icons.cancel_outlined,
        allowedStatuses: ['DRAFT', 'SENT'],
        destructive: true,
        permission: 'inventory.transfer',
      ),
    ],
  ),
  'subscription': const ModuleConfig(
    title: 'Subscription',
    path: 'subscription',
    icon: Icons.workspace_premium_outlined,
    color: Color(0xFF172C2B),
    detail: false,
    searchable: false,
  ),
  'billing': const ModuleConfig(
    title: 'Billing',
    path: 'billing',
    icon: Icons.credit_card_outlined,
    color: Color(0xFFEF6C45),
    detail: false,
  ),
  'sync/conflicts': const ModuleConfig(
    title: 'Sync conflicts',
    path: 'sync/conflicts',
    icon: Icons.sync_problem_outlined,
    color: Color(0xFFE85353),
    detail: false,
    idKeys: ['transactionUuid'],
    actions: [
      RecordAction(
        'Accept stock override',
        'resolve',
        Icons.warning_amber_rounded,
        allowedStatuses: ['CONFLICT'],
        body: {'action': 'ACCEPT_OVERRIDE'},
        permission: 'sync.conflict.resolve',
        visibleWhen: {'conflictCode': 'INSUFFICIENT_STOCK'},
      ),
      RecordAction(
        'Reject transaction',
        'resolve',
        Icons.block_outlined,
        allowedStatuses: ['CONFLICT'],
        destructive: true,
        body: {'action': 'REJECT'},
        permission: 'sync.conflict.resolve',
      ),
    ],
  ),
  'pilot-readiness': const ModuleConfig(
    title: 'Readiness',
    path: 'pilot-readiness',
    icon: Icons.rocket_launch_outlined,
    color: Color(0xFF36A46F),
    detail: false,
    searchable: false,
  ),
  'support/diagnostics': const ModuleConfig(
    title: 'Support diagnostics',
    path: 'support/diagnostics',
    icon: Icons.support_agent_outlined,
    color: Color(0xFFED764F),
    detail: false,
    searchable: false,
  ),
};

ModuleConfig configFor(String path, String fallbackTitle) =>
    moduleConfigs[path] ??
    ModuleConfig(
      title: fallbackTitle,
      path: path,
      icon: Icons.grid_view_rounded,
      color: const Color(0xFF617B78),
      detail: false,
    );

String? moduleReadPermission(String path) {
  if (path.startsWith('reports/')) {
    return <String, String>{
          'reports/dashboard': 'report.dashboard',
          'reports/sales': 'report.sales',
          'reports/profit': 'report.profit',
          'reports/payments': 'report.payments',
          'reports/inventory': 'report.inventory',
          'reports/purchases': 'report.purchases',
          'reports/expenses': 'report.expenses',
          'reports/customers': 'report.customers',
          'reports/appointments': 'report.appointments',
          'reports/commissions': 'report.commissions',
          'reports/staff-performance': 'report.commissions',
        }[path] ??
        'report.dashboard';
  }
  if (path.startsWith('inventory')) return 'inventory.read';
  return <String, String>{
    'products': 'catalogue.read',
    'categories': 'catalogue.read',
    'brands': 'catalogue.read',
    'units': 'catalogue.read',
    'sales': 'sale.read',
    'sales/held': 'sale.read',
    'customers': 'customer.read',
    'purchases': 'purchase.read',
    'suppliers': 'supplier.read',
    'expenses': 'expense.read',
    'expense-categories': 'expense_category.read',
    'appointments': 'appointment.read',
    'staff': 'staff.read',
    'commissions': 'commission.read',
    'commission-rules': 'commission_rule.read',
    'branches': 'branch.read',
    'users': 'user.read',
    'devices': 'device.read',
    'subscription': 'billing.read',
    'billing': 'billing.read',
    'sync/conflicts': 'sync.conflict.read',
    'pilot-readiness': 'organization.read',
    'support/diagnostics': 'organization.read',
  }[path];
}

String? moduleCreatePermission(String path) => <String, String>{
  'categories': 'category.create',
  'brands': 'brand.create',
  'units': 'unit.create',
  'customers': 'customer.create',
  'suppliers': 'supplier.create',
  'staff': 'staff.create',
  'branches': 'branch.create',
}[path];
