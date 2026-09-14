import 'package:allshops_mobile/core/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('cart totals use integer minor units', () {
    const product = PosProduct(
      productId: 'p',
      name: 'Tea',
      type: 'STOCK_ITEM',
      priceMinor: 725,
      trackInventory: true,
      allowNegativeStock: false,
    );
    expect(const CartLine(product, 2.5).totalMinor, 1813);
  });
  test('product cache key separates variants', () {
    const base = PosProduct(
      productId: 'p',
      name: 'Tea',
      type: 'STOCK_ITEM',
      priceMinor: 1,
      trackInventory: false,
      allowNegativeStock: false,
    );
    const variant = PosProduct(
      productId: 'p',
      variantId: 'v',
      name: 'Tea',
      type: 'STOCK_ITEM',
      priceMinor: 1,
      trackInventory: false,
      allowNegativeStock: false,
    );
    expect(base.key, isNot(variant.key));
  });
  test('membership permissions are parsed and enforced', () {
    final membership = Membership.fromJson({
      'id': 'membership',
      'organizationId': 'organization',
      'organizationName': 'Shop',
      'roleId': 'role',
      'role': 'CASHIER',
      'roleName': 'Cashier',
      'branchId': 'branch',
      'branchName': 'Lusail',
      'status': 'ACTIVE',
      'permissions': ['sale.create', 'payment.record'],
    });

    expect(membership.hasPermission('sale.create'), isTrue);
    expect(membership.hasPermission('sync.conflict.resolve'), isFalse);
    expect(
      membership.hasAllPermissions(['sale.create', 'payment.record']),
      isTrue,
    );
  });
}
