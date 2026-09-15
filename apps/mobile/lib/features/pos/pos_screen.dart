import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:uuid/uuid.dart';
import '../../app.dart';
import '../../core/app_logger.dart';
import '../../core/models.dart';

class PosScreen extends ConsumerStatefulWidget {
  const PosScreen({super.key, required this.membership});
  final Membership membership;
  @override
  ConsumerState<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends ConsumerState<PosScreen> {
  final query = TextEditingController();
  final cash = TextEditingController();
  final terminalReference = TextEditingController();
  final productScroll = ScrollController();
  List<PosProduct> products = [];
  final Map<String, CartLine> cart = {};
  bool loading = true;
  bool busy = false;
  bool loadingMoreProducts = false;
  bool hasMoreProducts = true;
  int productPage = 1;
  int productTotal = 0;
  static const productPageSize = 40;
  String tender = 'CASH';
  String bank = 'QNB';
  String? message;
  String? deviceId;
  String? catalogueSnapshotAt;
  List<PosBranch> branches = const [];
  String? selectedBranchId;
  int sequence = 1;
  String get organizationId => widget.membership.organizationId;
  String? get branchId => widget.membership.branchId ?? selectedBranchId;
  int get totalMinor =>
      cart.values.fold(0, (sum, line) => sum + line.totalMinor);
  @override
  void initState() {
    super.initState();
    query.addListener(search);
    productScroll.addListener(_loadMoreProducts);
    Future.microtask(initialize);
  }

  @override
  void dispose() {
    query.dispose();
    cash.dispose();
    terminalReference.dispose();
    productScroll.dispose();
    super.dispose();
  }

  Future<void> initialize() async {
    await _resolveBranch();
    AppLogger.info(
      'pos',
      'initializing',
      fields: {'hasBranch': branchId != null},
    );
    if (branchId == null) {
      if (mounted) {
        setState(() {
          loading = false;
          message = branches.isEmpty
              ? 'No active branch is available. Ask an owner to create or activate a branch.'
              : 'Choose the branch where this sale will be recorded.';
        });
      }
      return;
    }
    await _initializeBranch();
  }

  Future<void> _resolveBranch() async {
    final assignedBranchId = widget.membership.branchId;
    if (assignedBranchId != null) {
      selectedBranchId = assignedBranchId;
      branches = [
        PosBranch(
          id: assignedBranchId,
          name: widget.membership.branchName ?? 'Assigned branch',
          code: '',
        ),
      ];
      return;
    }

    try {
      final rows = await ref
          .read(apiProvider)
          .get<List<dynamic>>('/organizations/$organizationId/pos/branches');
      branches = rows
          .map((row) => PosBranch.fromJson(row as Map<String, dynamic>))
          .toList(growable: false);
      const storage = FlutterSecureStorage();
      final stored = await storage.read(key: 'pos_branch_$organizationId');
      if (branches.any((branch) => branch.id == stored)) {
        selectedBranchId = stored;
      } else if (branches.length == 1) {
        selectedBranchId = branches.first.id;
        await storage.write(
          key: 'pos_branch_$organizationId',
          value: selectedBranchId,
        );
      }
    } catch (error, stackTrace) {
      AppLogger.error(
        'pos',
        'branch_list_failed',
        error,
        stackTrace: stackTrace,
      );
      message =
          'Could not load the available branches. Check your connection and retry.';
    }
  }

  Future<void> _initializeBranch() async {
    await _ensureDevice();
    await search();
    await _bootstrapOffline();
    await _syncCheckoutOutbox();
    await syncPending();
    AppLogger.info('pos', 'initialized');
  }

  Future<void> _selectBranch(String? value) async {
    if (value == null || value == branchId) return;
    if (cart.isNotEmpty) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Switch branch?'),
          content: const Text(
            'The current cart belongs to the present branch and will be cleared.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep current branch'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Switch branch'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    const storage = FlutterSecureStorage();
    await storage.write(key: 'pos_branch_$organizationId', value: value);
    if (!mounted) return;
    setState(() {
      selectedBranchId = value;
      deviceId = null;
      catalogueSnapshotAt = null;
      products = [];
      cart.clear();
      loading = true;
      message = 'Opening branch…';
    });
    await _initializeBranch();
    if (mounted) setState(() => message = null);
  }

  Future<void> _ensureDevice() async {
    const storage = FlutterSecureStorage();
    final storedKey = 'device_id_${organizationId}_$branchId';
    final identifierKey = 'device_identifier_${organizationId}_$branchId';
    deviceId = await storage.read(key: storedKey);
    var identifier = await storage.read(key: identifierKey);
    identifier ??= const Uuid().v4();
    await storage.write(key: identifierKey, value: identifier);
    if (deviceId == null) {
      try {
        final row = await ref
            .read(apiProvider)
            .post<Map<String, dynamic>>(
              '/organizations/$organizationId/devices/register',
              data: {
                'branchId': branchId,
                'name': 'AllShops Mobile POS',
                'deviceIdentifier': identifier,
              },
            );
        deviceId = row['id'] as String;
        await storage.write(key: storedKey, value: deviceId);
      } catch (_) {
        /* Online POS remains usable when the plan has no offline entitlement. */
      }
    }
  }

  Future<void> _bootstrapOffline() async {
    if (deviceId == null) return;
    try {
      final data = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '/organizations/$organizationId/sync/bootstrap',
            query: {'deviceId': deviceId},
          );
      catalogueSnapshotAt = data['cursor'] as String;
      final flattened = <Map<String, dynamic>>[];
      for (final raw in data['products'] as List<dynamic>) {
        final product = raw as Map<String, dynamic>;
        flattened.add({
          'productId': product['id'],
          'variantId': null,
          'name': product['name'],
          'brandName': product['brand'] is Map
              ? product['brand']['name']
              : null,
          'variantName': null,
          'sku': product['sku'],
          'barcode': product['barcode'],
          'imageUrl': product['imageUrl'],
          'type': product['type'],
          'priceMinor': product['priceMinor'],
          'trackInventory': product['trackInventory'],
          'allowNegativeStock': product['allowNegativeStock'],
          'availableQuantity': _stock(product, null),
        });
        for (final value in product['variants'] as List<dynamic>? ?? []) {
          final variant = value as Map<String, dynamic>;
          flattened.add({
            'productId': product['id'],
            'variantId': variant['id'],
            'name': product['name'],
            'brandName': product['brand'] is Map
                ? product['brand']['name']
                : null,
            'variantName': variant['name'],
            'sku': variant['sku'],
            'barcode': variant['barcode'],
            'imageUrl': product['imageUrl'],
            'type': product['type'],
            'priceMinor': variant['priceMinor'] ?? product['priceMinor'],
            'trackInventory': product['trackInventory'],
            'allowNegativeStock': product['allowNegativeStock'],
            'availableQuantity': _stock(product, variant['id'] as String?),
          });
        }
      }
      await ref
          .read(offlineStoreProvider)
          .replaceProducts(branchId!, flattened, catalogueSnapshotAt!);
    } catch (_) {
      /* Cache is optional until offline is entitled. */
    }
  }

  String _stock(Map<String, dynamic> product, String? variantId) {
    final rows = product['inventoryBalances'] as List<dynamic>? ?? [];
    return rows
        .where((raw) => (raw as Map<String, dynamic>)['variantId'] == variantId)
        .fold<double>(
          0,
          (sum, raw) =>
              sum +
              (double.tryParse(
                    (raw as Map<String, dynamic>)['quantity'].toString(),
                  ) ??
                  0),
        )
        .toString();
  }

  void _loadMoreProducts() {
    if (!productScroll.hasClients ||
        productScroll.position.extentAfter > 320 ||
        loading ||
        loadingMoreProducts ||
        !hasMoreProducts) {
      return;
    }
    search(append: true);
  }

  Future<void> search({bool append = false}) async {
    if (branchId == null) return;
    final requestedPage = append ? productPage + 1 : 1;
    final requestedQuery = query.text;
    if (append) {
      setState(() => loadingMoreProducts = true);
    } else {
      setState(() {
        loading = true;
        hasMoreProducts = true;
      });
    }
    try {
      final data = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '/organizations/$organizationId/pos/products',
            query: {
              'branchId': branchId,
              'page': requestedPage,
              'pageSize': productPageSize,
              'search': requestedQuery,
            },
          );
      if (!mounted || requestedQuery != query.text) return;
      final nextProducts = (data['items'] as List<dynamic>)
          .map((row) => PosProduct.fromJson(row as Map<String, dynamic>))
          .toList();
      productTotal = (data['total'] as num?)?.toInt() ?? nextProducts.length;
      productPage = requestedPage;
      hasMoreProducts = requestedPage * productPageSize < productTotal;
      products = append ? [...products, ...nextProducts] : nextProducts;
    } catch (_) {
      if (append) return;
      products =
          (await ref
                  .read(offlineStoreProvider)
                  .products(branchId!, requestedQuery))
              .map(PosProduct.fromJson)
              .toList();
      productPage = 1;
      productTotal = products.length;
      hasMoreProducts = false;
      message = products.isEmpty
          ? 'No offline catalogue is available.'
          : 'Offline catalogue · prices and stock are cached.';
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          loadingMoreProducts = false;
        });
      }
    }
  }

  void add(PosProduct product) {
    final available = double.tryParse(product.availableQuantity ?? '0') ?? 0;
    if (product.trackInventory &&
        !product.allowNegativeStock &&
        available <= 0) {
      return;
    }
    setState(() {
      final existing = cart[product.key];
      cart[product.key] = existing == null
          ? CartLine(product, 1)
          : existing.copyWith(quantity: existing.quantity + 1);
    });
  }

  Future<void> scan(String rawBarcode) async {
    final barcode = rawBarcode.trim();
    if (barcode.isEmpty || branchId == null) return;
    PosProduct? product;
    var offline = false;
    AppLogger.info('pos', 'barcode_lookup_started');
    try {
      final row = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>?>(
            '/organizations/$organizationId/pos/products/barcode',
            query: {'branchId': branchId, 'barcode': barcode},
          );
      if (row != null) product = PosProduct.fromJson(row);
    } catch (_) {
      offline = true;
      final row = await ref
          .read(offlineStoreProvider)
          .productByBarcode(branchId!, barcode);
      if (row != null) product = PosProduct.fromJson(row);
    }
    if (!mounted) return;
    if (product == null) {
      setState(() => message = 'No product found for barcode $barcode.');
      AppLogger.warning('pos', 'barcode_not_found');
      return;
    }
    final available = double.tryParse(product.availableQuantity ?? '0') ?? 0;
    if (product.trackInventory &&
        !product.allowNegativeStock &&
        available <= 0) {
      setState(() => message = '${product!.name} is out of stock.');
      AppLogger.warning('pos', 'barcode_product_out_of_stock');
      return;
    }
    add(product);
    query.clear();
    setState(() {
      message = offline
          ? '${product!.name} added from the offline catalogue.'
          : '${product!.name} added.';
    });
    AppLogger.info(
      'pos',
      'barcode_product_added',
      fields: {'offline': offline},
    );
  }

  Future<void> checkout() async {
    if (cart.isEmpty || branchId == null) return;
    if (tender == 'CASH') {
      final enteredMinor = cash.text.trim().isEmpty
          ? totalMinor
          : ((double.tryParse(cash.text.trim()) ?? -1) * 100).round();
      if (enteredMinor < totalMinor) {
        setState(() {
          message = enteredMinor < 0
              ? 'Enter a valid cash amount before completing the sale.'
              : 'Cash received is ${(totalMinor - enteredMinor) / 100} QAR short.';
        });
        return;
      }
    }
    setState(() {
      busy = true;
      message = null;
    });
    AppLogger.info(
      'pos',
      'checkout_started',
      fields: {
        'tender': tender,
        'lineCount': cart.length,
        'totalMinor': totalMinor,
      },
    );
    final payment = tender == 'CASH'
        ? {
            'method': 'CASH',
            'amountMinor': totalMinor,
            'tenderedMinor':
                ((double.tryParse(cash.text) ?? totalMinor / 100) * 100)
                    .round(),
          }
        : {
            'method': 'CARD',
            'amountMinor': totalMinor,
            'reference':
                'LOCAL:$bank:${terminalReference.text.trim().isEmpty ? 'NO-REFERENCE' : terminalReference.text.trim()}',
          };
    var durablySaved = false;
    try {
      final connected = !(await Connectivity().checkConnectivity()).contains(
        ConnectivityResult.none,
      );
      if (connected) {
        final idempotencyKey = const Uuid().v4();
        final payload = {
          'branchId': branchId,
          'items': cart.values
              .map(
                (line) => {
                  'productId': line.product.productId,
                  'variantId': line.product.variantId,
                  'quantity': _quantity(line.quantity),
                },
              )
              .toList(),
          'payments': [payment],
        };
        // Cash/card has already been accepted at this point. Persist the exact
        // request before network I/O so an app kill or lost response can never
        // make a paid transaction disappear.
        await ref
            .read(offlineStoreProvider)
            .persistCheckout(idempotencyKey, organizationId, payload);
        durablySaved = true;
        await ref
            .read(apiProvider)
            .post<Map<String, dynamic>>(
              '/organizations/$organizationId/sales/checkout',
              data: payload,
              headers: {'Idempotency-Key': idempotencyKey},
            );
        await ref
            .read(offlineStoreProvider)
            .markCheckout(idempotencyKey, 'SYNCED');
        setState(() {
          cart.clear();
          message = 'Sale completed successfully.';
        });
        await search();
        AppLogger.info('pos', 'checkout_synced');
      } else {
        await _saveOffline(payment);
      }
    } catch (error, stackTrace) {
      AppLogger.error(
        'pos',
        'checkout_failed',
        error,
        stackTrace: stackTrace,
        fields: {'durablySaved': durablySaved},
      );
      if (durablySaved) cart.clear();
      message = durablySaved
          ? 'Payment is saved safely on this device. Reconnect and tap sync. ${error.toString()}'
          : 'Could not save this payment. Do not collect payment yet. ${error.toString()}';
    }
    if (cart.isEmpty) {
      cash.clear();
      terminalReference.clear();
      tender = 'CASH';
      bank = 'QNB';
    }
    if (mounted) setState(() => busy = false);
  }

  String _quantity(double value) => value == value.roundToDouble()
      ? value.toInt().toString()
      : value.toString();
  Future<void> _saveOffline(Map<String, dynamic> payment) async {
    if (deviceId == null || catalogueSnapshotAt == null) {
      throw Exception(
        'Offline POS is not enabled for this registered device. Reconnect first.',
      );
    }
    final now = DateTime.now().toUtc().toIso8601String();
    final transactionUuid = const Uuid().v4();
    await ref.read(offlineStoreProvider).persistPaidSale({
      'organizationId': organizationId,
      'payloadVersion': 1,
      'transactionUuid': transactionUuid,
      'deviceId': deviceId,
      'branchId': branchId,
      'localReference': 'MOBILE-$sequence',
      'sequenceNumber': sequence++,
      'clientCreatedAt': now,
      'catalogueSnapshotAt': catalogueSnapshotAt,
      'offlineSessionIssuedAt': catalogueSnapshotAt,
      'appVersion': '0.1.0',
      'items': cart.values
          .map(
            (line) => {
              'productId': line.product.productId,
              'variantId': line.product.variantId,
              'quantity': _quantity(line.quantity),
              'priceSnapshotMinor': line.product.priceMinor,
            },
          )
          .toList(),
      'payments': [payment],
    });
    setState(() {
      cart.clear();
      message =
          'Paid sale saved safely on this device. It will sync automatically.';
    });
  }

  Future<void> syncPending() async {
    await _syncCheckoutOutbox();
    if (deviceId == null) return;
    final rows = await ref
        .read(offlineStoreProvider)
        .pendingSales(deviceId: deviceId);
    AppLogger.info(
      'sync',
      'pending_sales_checked',
      fields: {'count': rows.length},
    );
    if (rows.isEmpty) return;
    try {
      final transactions = rows
          .map(
            (row) =>
                jsonDecode(row['payload'] as String) as Map<String, dynamic>,
          )
          .toList();
      final response = await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '/organizations/$organizationId/sync/sales',
            data: {'deviceId': deviceId, 'transactions': transactions},
          );
      for (final raw in response['results'] as List<dynamic>) {
        final result = raw as Map<String, dynamic>;
        await ref
            .read(offlineStoreProvider)
            .markResult(
              result['transactionUuid'] as String,
              result['status'] == 'SYNCED'
                  ? 'SYNCED'
                  : result['status'] == 'CONFLICT'
                  ? 'CONFLICT'
                  : 'FAILED_PERMANENT',
              errorCode: result['code'] as String?,
            );
      }
    } catch (error, stackTrace) {
      AppLogger.error(
        'sync',
        'pending_sales_failed',
        error,
        stackTrace: stackTrace,
        fields: {'count': rows.length},
      );
      for (final row in rows) {
        await ref
            .read(offlineStoreProvider)
            .markResult(row['transaction_uuid'] as String, 'FAILED_RETRYABLE');
      }
    }
  }

  Future<void> _syncCheckoutOutbox() async {
    final rows = await ref.read(offlineStoreProvider).pendingCheckouts();
    AppLogger.info(
      'sync',
      'checkout_outbox_checked',
      fields: {'count': rows.length},
    );
    for (final row in rows) {
      final key = row['idempotency_key'] as String;
      final organization = row['organization_id'] as String;
      try {
        await ref
            .read(apiProvider)
            .post<Map<String, dynamic>>(
              '/organizations/$organization/sales/checkout',
              data: jsonDecode(row['payload'] as String),
              headers: {'Idempotency-Key': key},
            );
        await ref.read(offlineStoreProvider).markCheckout(key, 'SYNCED');
      } catch (error) {
        await ref
            .read(offlineStoreProvider)
            .markCheckout(key, 'RETRYABLE', error: error.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 10),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  'Point of Sale',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1,
                  ),
                ),
              ),
              IconButton.filledTonal(
                onPressed: () async {
                  final value = await Navigator.push<String>(
                    context,
                    MaterialPageRoute(builder: (_) => const ScannerScreen()),
                  );
                  if (value != null) await scan(value);
                },
                icon: const Icon(Icons.qr_code_scanner_rounded),
              ),
              IconButton.filledTonal(
                onPressed: syncPending,
                icon: const Icon(Icons.sync_rounded),
              ),
            ],
          ),
        ),
        if (widget.membership.branchId == null)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
            child: Container(
              padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
              decoration: BoxDecoration(
                color: const Color(0xFFE7F6EF),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFC8E5D7)),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.storefront_rounded,
                    color: Color(0xFF16705A),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      key: ValueKey(selectedBranchId),
                      initialValue: selectedBranchId,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Selling branch',
                        border: InputBorder.none,
                        isDense: true,
                      ),
                      hint: const Text('Choose a branch'),
                      items: branches
                          .map(
                            (branch) => DropdownMenuItem(
                              value: branch.id,
                              child: Text(
                                branch.code.isEmpty
                                    ? branch.name
                                    : '${branch.name} · ${branch.code}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: loading ? null : _selectBranch,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Reload branches',
                    onPressed: loading
                        ? null
                        : () async {
                            setState(() {
                              loading = true;
                              message = null;
                              branches = const [];
                              selectedBranchId = null;
                            });
                            await initialize();
                          },
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: TextField(
            controller: query,
            decoration: const InputDecoration(
              hintText: 'Search or scan barcode',
              prefixIcon: Icon(Icons.search_rounded),
            ),
          ),
        ),
        if (message != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 0),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF0D0),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                message!,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: search,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final columns = constraints.maxWidth >= 900
                          ? 6
                          : constraints.maxWidth >= 600
                          ? 4
                          : constraints.maxWidth >= 360
                          ? 3
                          : 2;
                      const spacing = 10.0;
                      final tileWidth =
                          (constraints.maxWidth -
                              36 -
                              spacing * (columns - 1)) /
                          columns;
                      final tileHeight = (tileWidth * 1.18).clamp(142.0, 190.0);
                      return Scrollbar(
                        controller: productScroll,
                        child: GridView.builder(
                          controller: productScroll,
                          physics: const AlwaysScrollableScrollPhysics(
                            parent: BouncingScrollPhysics(),
                          ),
                          padding: const EdgeInsets.fromLTRB(18, 14, 18, 90),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: columns,
                                mainAxisExtent: tileHeight,
                                mainAxisSpacing: spacing,
                                crossAxisSpacing: spacing,
                              ),
                          itemCount:
                              products.length + (loadingMoreProducts ? 1 : 0),
                          itemBuilder: (_, i) {
                            if (i == products.length) {
                              return const Center(
                                child: CircularProgressIndicator(),
                              );
                            }
                            return _ProductTile(
                              product: products[i],
                              accentIndex: i,
                              onTap: () => add(products[i]),
                            );
                          },
                        ),
                      );
                    },
                  ),
                ),
        ),
        if (cart.isNotEmpty)
          _CartSheet(
            totalMinor: totalMinor,
            count: cart.length,
            onOpen: () => showModalBottomSheet(
              context: context,
              isScrollControlled: true,
              builder: (_) => _CheckoutSheet(
                cart: cart,
                tender: tender,
                bank: bank,
                cash: cash,
                reference: terminalReference,
                busy: busy,
                totalMinor: totalMinor,
                onTender: (v) => setState(() => tender = v),
                onBank: (v) => setState(() => bank = v),
                onRemove: (key) => setState(() => cart.remove(key)),
                onCheckout: checkout,
              ),
            ),
          ),
      ],
    ),
  );
}

class _CartSheet extends StatelessWidget {
  const _CartSheet({
    required this.totalMinor,
    required this.count,
    required this.onOpen,
  });
  final int totalMinor;
  final int count;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 18),
    decoration: const BoxDecoration(
      color: Color(0xFF172C2B),
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    child: Row(
      children: [
        CircleAvatar(
          backgroundColor: const Color(0xFFFFCF5C),
          foregroundColor: const Color(0xFF172C2B),
          child: Text(
            '$count',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Current order',
                style: TextStyle(color: Color(0xFFAEC5BD), fontSize: 11),
              ),
              Text(
                '${(totalMinor / 100).toStringAsFixed(2)} QAR',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
        ElevatedButton(onPressed: onOpen, child: const Text('Review & pay')),
      ],
    ),
  );
}

class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({
    required this.cart,
    required this.tender,
    required this.bank,
    required this.cash,
    required this.reference,
    required this.busy,
    required this.totalMinor,
    required this.onTender,
    required this.onBank,
    required this.onRemove,
    required this.onCheckout,
  });
  final Map<String, CartLine> cart;
  final String tender, bank;
  final TextEditingController cash, reference;
  final bool busy;
  final int totalMinor;
  final ValueChanged<String> onTender, onBank, onRemove;
  final Future<void> Function() onCheckout;

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  final paymentPanelKey = GlobalKey();
  late String tender;
  late String bank;
  bool processing = false;

  Map<String, CartLine> get cart => widget.cart;
  TextEditingController get cash => widget.cash;
  TextEditingController get reference => widget.reference;
  bool get busy => widget.busy || processing;
  int get totalMinor =>
      cart.values.fold(0, (sum, line) => sum + line.totalMinor);

  int? get cashReceivedMinor {
    if (cash.text.trim().isEmpty) return null;
    final value = double.tryParse(cash.text.trim());
    return value == null ? -1 : (value * 100).round();
  }

  int get changeMinor => cashReceivedMinor == null
      ? 0
      : (cashReceivedMinor! - totalMinor).clamp(0, 1 << 31);
  int get shortfallMinor => cashReceivedMinor == null
      ? 0
      : (totalMinor - cashReceivedMinor!).clamp(0, 1 << 31);

  @override
  void initState() {
    super.initState();
    tender = widget.tender;
    bank = widget.bank;
    cash.addListener(_amountChanged);
  }

  @override
  void dispose() {
    cash.removeListener(_amountChanged);
    super.dispose();
  }

  void _amountChanged() {
    if (mounted) setState(() {});
  }

  void onTender(String value) {
    setState(() => tender = value);
    widget.onTender(value);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = paymentPanelKey.currentContext;
      if (target != null) {
        Scrollable.ensureVisible(
          target,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          alignment: .72,
        );
      }
    });
  }

  void onBank(String value) {
    setState(() => bank = value);
    widget.onBank(value);
  }

  void onRemove(String key) {
    widget.onRemove(key);
    setState(() {});
    if (cart.isEmpty) Navigator.pop(context);
  }

  Future<void> onCheckout() async {
    if (busy || shortfallMinor > 0 || cashReceivedMinor == -1) return;
    setState(() => processing = true);
    await widget.onCheckout();
    if (!mounted) return;
    setState(() => processing = false);
    if (cart.isEmpty) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        18,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(
              child: SizedBox(width: 44, child: Divider(thickness: 4)),
            ),
            const Text(
              'Review order',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 12),
            ...cart.entries.map(
              (entry) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  entry.value.product.name,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text('Qty ${entry.value.quantity}'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      '${(entry.value.totalMinor / 100).toStringAsFixed(2)} QAR',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    IconButton(
                      onPressed: () => onRemove(entry.key),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(),
            Row(
              children: [
                const Text(
                  'Total',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                const Spacer(),
                Text(
                  '${(totalMinor / 100).toStringAsFixed(2)} QAR',
                  style: const TextStyle(
                    fontSize: 25,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'CASH',
                  icon: Icon(Icons.payments_outlined),
                  label: Text('Cash'),
                ),
                ButtonSegment(
                  value: 'LOCAL_CARD',
                  icon: Icon(Icons.credit_card_rounded),
                  label: Text('Local card'),
                ),
              ],
              selected: {tender},
              onSelectionChanged: (v) => onTender(v.first),
            ),
            const SizedBox(height: 14),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 180),
              child: Container(
                key: paymentPanelKey,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F7F4),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFD9E8E1)),
                ),
                child: tender == 'CASH'
                    ? Column(
                        key: const ValueKey('cash-panel'),
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: cash,
                            autofocus: true,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Cash received (QAR)',
                              prefixText: 'QAR ',
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 7,
                            runSpacing: 7,
                            children: _quickCashAmounts(totalMinor)
                                .map(
                                  (amount) => ActionChip(
                                    label: Text(
                                      amount == totalMinor
                                          ? 'Exact'
                                          : '${amount / 100} QAR',
                                    ),
                                    onPressed: () {
                                      cash.text = (amount / 100)
                                          .toStringAsFixed(
                                            amount % 100 == 0 ? 0 : 2,
                                          );
                                      cash.selection = TextSelection.collapsed(
                                        offset: cash.text.length,
                                      );
                                    },
                                  ),
                                )
                                .toList(),
                          ),
                          const SizedBox(height: 10),
                          _CashResult(
                            receivedMinor: cashReceivedMinor,
                            totalMinor: totalMinor,
                            changeMinor: changeMinor,
                            shortfallMinor: shortfallMinor,
                          ),
                        ],
                      )
                    : Column(
                        key: const ValueKey('card-panel'),
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          DropdownButtonFormField<String>(
                            initialValue: bank,
                            items:
                                const [
                                      'QNB',
                                      'Doha Bank',
                                      'Commercial Bank',
                                      'QIB',
                                      'Dukhan Bank',
                                      'Ahlibank',
                                      'Other local terminal',
                                    ]
                                    .map(
                                      (v) => DropdownMenuItem(
                                        value: v,
                                        child: Text(v),
                                      ),
                                    )
                                    .toList(),
                            onChanged: (v) => onBank(v!),
                            decoration: const InputDecoration(
                              labelText: 'Acquiring bank / terminal',
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: reference,
                            decoration: const InputDecoration(
                              labelText: 'Terminal reference (optional)',
                            ),
                          ),
                          const SizedBox(height: 9),
                          Text(
                            'Record exactly ${(totalMinor / 100).toStringAsFixed(2)} QAR after the terminal approves the card.',
                            style: const TextStyle(
                              color: Color(0xFF536C64),
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 18),
            ElevatedButton(
              onPressed:
                  busy ||
                      (tender == 'CASH' &&
                          (shortfallMinor > 0 || cashReceivedMinor == -1))
                  ? null
                  : onCheckout,
              child: Text(
                busy
                    ? 'Processing…'
                    : tender == 'CASH'
                    ? 'Complete cash sale'
                    : 'Record local card sale',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

List<int> _quickCashAmounts(int totalMinor) {
  int roundUp(int stepMinor) =>
      ((totalMinor + stepMinor - 1) ~/ stepMinor) * stepMinor;
  return <int>{
    totalMinor,
    roundUp(500),
    roundUp(1000),
    roundUp(5000),
    roundUp(10000),
  }.where((amount) => amount > 0).take(4).toList(growable: false);
}

class _CashResult extends StatelessWidget {
  const _CashResult({
    required this.receivedMinor,
    required this.totalMinor,
    required this.changeMinor,
    required this.shortfallMinor,
  });

  final int? receivedMinor;
  final int totalMinor;
  final int changeMinor;
  final int shortfallMinor;

  @override
  Widget build(BuildContext context) {
    final invalid = receivedMinor == -1;
    final ready = receivedMinor != null && !invalid && shortfallMinor == 0;
    final color = invalid || shortfallMinor > 0
        ? const Color(0xFFB44736)
        : const Color(0xFF16705A);
    final label = invalid
        ? 'Enter a valid amount'
        : receivedMinor == null
        ? 'Enter cash received to calculate change'
        : shortfallMinor > 0
        ? 'Short by ${(shortfallMinor / 100).toStringAsFixed(2)} QAR'
        : 'Change due ${(changeMinor / 100).toStringAsFixed(2)} QAR';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            ready ? Icons.check_circle_outline : Icons.calculate_outlined,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(color: color, fontWeight: FontWeight.w900),
            ),
          ),
          if (receivedMinor != null && !invalid)
            Text(
              'Total ${(totalMinor / 100).toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 10, color: Colors.blueGrey),
            ),
        ],
      ),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({
    required this.product,
    required this.accentIndex,
    required this.onTap,
  });

  final PosProduct product;
  final int accentIndex;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final outOfStock =
        product.trackInventory &&
        !product.allowNegativeStock &&
        (double.tryParse(product.availableQuantity ?? '0') ?? 0) <= 0;
    final identityParts = <String>{
      if (product.brandName?.trim().isNotEmpty == true)
        product.brandName!.trim(),
      if (product.variantName?.trim().isNotEmpty == true)
        product.variantName!.trim(),
      if (product.sku?.trim().isNotEmpty == true) product.sku!.trim(),
    }.take(2).toList(growable: false);
    final identity = identityParts.isEmpty
        ? 'Standard item'
        : identityParts.join(' · ');
    final fallbackColors = switch (accentIndex % 3) {
      1 => const [Color(0xFFFFE7A3), Color(0xFFFFC94C)],
      2 => const [Color(0xFFCDEEDF), Color(0xFF83D0AE)],
      _ => const [Color(0xFFFFDDD4), Color(0xFFFFAD96)],
    };
    final initial = product.name.trim().isEmpty
        ? '•'
        : product.name.trim().characters.first.toUpperCase();

    return Semantics(
      button: true,
      enabled: !outOfStock,
      label:
          '${product.name}, $identity, ${(product.priceMinor / 100).toStringAsFixed(2)} QAR',
      child: Opacity(
        opacity: outOfStock ? .48 : 1,
        child: Card(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: Color(0xFFE1EAE6)),
          ),
          child: InkWell(
            onTap: outOfStock ? null : onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (product.imageUrl != null &&
                          product.imageUrl!.trim().isNotEmpty)
                        Image.network(
                          product.imageUrl!,
                          fit: BoxFit.cover,
                          alignment: Alignment.center,
                          filterQuality: FilterQuality.medium,
                          errorBuilder: (_, _, _) => _ProductFallback(
                            initial: initial,
                            colors: fallbackColors,
                          ),
                        )
                      else
                        _ProductFallback(
                          initial: initial,
                          colors: fallbackColors,
                        ),
                      Positioned(
                        right: 6,
                        bottom: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 7,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xE617302A),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white30),
                          ),
                          child: Text(
                            '${(product.priceMinor / 100).toStringAsFixed(2)} QAR',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 6, 8, 7),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF173B34),
                          fontSize: 12,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        identity,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFF6B7E78),
                          fontSize: 9,
                          height: 1.05,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProductFallback extends StatelessWidget {
  const _ProductFallback({required this.initial, required this.colors});
  final String initial;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: colors,
      ),
    ),
    child: Center(
      child: Text(
        initial,
        style: const TextStyle(
          color: Color(0xFF7A392C),
          fontSize: 28,
          fontWeight: FontWeight.w900,
        ),
      ),
    ),
  );
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});
  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  bool handled = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      title: const Text('Scan barcode'),
    ),
    body: Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(
          onDetect: (capture) {
            if (handled || capture.barcodes.isEmpty) return;
            final value = capture.barcodes.first.rawValue;
            if (value != null) {
              handled = true;
              Navigator.pop(context, value);
            }
          },
        ),
        Center(
          child: Container(
            width: 260,
            height: 160,
            decoration: BoxDecoration(
              border: Border.all(color: const Color(0xFFFFCF5C), width: 3),
              borderRadius: BorderRadius.circular(20),
            ),
          ),
        ),
        const Positioned(
          left: 20,
          right: 20,
          bottom: 40,
          child: Text(
            'Place the product barcode inside the frame',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}
