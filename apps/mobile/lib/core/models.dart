class Membership {
  const Membership({
    required this.organizationId,
    required this.organizationName,
    required this.role,
    required this.permissions,
    required this.employeeNumber,
    this.branchId,
    this.branchName,
  });
  final String organizationId;
  final String organizationName;
  final String role;
  final List<String> permissions;
  final String employeeNumber;
  final String? branchId;
  final String? branchName;
  factory Membership.fromJson(Map<String, dynamic> json) => Membership(
    organizationId: json['organizationId'] as String,
    organizationName: json['organizationName'] as String,
    role: json['role'] as String,
    permissions: (json['permissions'] as List<dynamic>? ?? const [])
        .map((value) => value.toString())
        .toList(growable: false),
    employeeNumber:
        json['employeeNumber']?.toString() ?? json['id']?.toString() ?? '',
    branchId: json['branchId'] as String?,
    branchName: json['branchName'] as String?,
  );

  bool hasPermission(String permission) => permissions.contains(permission);
  bool hasAllPermissions(Iterable<String> required) =>
      required.every(hasPermission);
}

class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.name,
    required this.email,
    required this.memberships,
  });
  final String id;
  final String name;
  final String email;
  final List<Membership> memberships;
  factory CurrentUser.fromJson(Map<String, dynamic> json) => CurrentUser(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    memberships: (json['memberships'] as List<dynamic>? ?? [])
        .map((row) => Membership.fromJson(row as Map<String, dynamic>))
        .toList(),
  );
}

class PosBranch {
  const PosBranch({required this.id, required this.name, required this.code});

  final String id;
  final String name;
  final String code;

  factory PosBranch.fromJson(Map<String, dynamic> json) => PosBranch(
    id: json['id'] as String,
    name: json['name'] as String,
    code: json['code'] as String,
  );
}

class PosProduct {
  const PosProduct({
    required this.productId,
    this.variantId,
    required this.name,
    this.brandName,
    this.variantName,
    this.sku,
    this.barcode,
    this.imageUrl,
    required this.type,
    required this.priceMinor,
    required this.trackInventory,
    required this.allowNegativeStock,
    this.availableQuantity,
  });
  final String productId;
  final String? variantId;
  final String name;
  final String? brandName;
  final String? variantName;
  final String? sku;
  final String? barcode;
  final String? imageUrl;
  final String type;
  final int priceMinor;
  final bool trackInventory;
  final bool allowNegativeStock;
  final String? availableQuantity;
  factory PosProduct.fromJson(Map<String, dynamic> json) => PosProduct(
    productId: json['productId'] as String,
    variantId: json['variantId'] as String?,
    name: json['name'] as String,
    brandName: json['brandName'] as String?,
    variantName: json['variantName'] as String?,
    sku: json['sku'] as String?,
    barcode: json['barcode'] as String?,
    imageUrl: json['imageUrl'] as String?,
    type: json['type'] as String,
    priceMinor: json['priceMinor'] as int,
    trackInventory: json['trackInventory'] as bool? ?? false,
    allowNegativeStock: json['allowNegativeStock'] as bool? ?? false,
    availableQuantity: json['availableQuantity']?.toString(),
  );
  String get key => '$productId:${variantId ?? 'BASE'}';
  Map<String, dynamic> toJson() => {
    'productId': productId,
    'variantId': variantId,
    'name': name,
    'brandName': brandName,
    'variantName': variantName,
    'sku': sku,
    'barcode': barcode,
    'imageUrl': imageUrl,
    'type': type,
    'priceMinor': priceMinor,
    'trackInventory': trackInventory,
    'allowNegativeStock': allowNegativeStock,
    'availableQuantity': availableQuantity,
  };
}

class CartLine {
  const CartLine(this.product, this.quantity);
  final PosProduct product;
  final double quantity;
  int get totalMinor => (product.priceMinor * quantity).round();
  CartLine copyWith({double? quantity}) =>
      CartLine(product, quantity ?? this.quantity);
}
