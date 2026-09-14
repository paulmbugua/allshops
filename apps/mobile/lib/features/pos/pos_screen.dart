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
  List<PosProduct> products = [];
  final Map<String, CartLine> cart = {};
  bool loading = true;
  bool busy = false;
  String tender = 'CASH';
  String bank = 'QNB';
  String? message;
  String? deviceId;
  String? catalogueSnapshotAt;
  int sequence = 1;
  String get organizationId => widget.membership.organizationId;
  String? get branchId => widget.membership.branchId;
  int get totalMinor =>
      cart.values.fold(0, (sum, line) => sum + line.totalMinor);
  @override
  void initState() {
    super.initState();
    query.addListener(search);
    Future.microtask(initialize);
  }

  @override
  void dispose() {
    query.dispose();
    cash.dispose();
    terminalReference.dispose();
    super.dispose();
  }

  Future<void> initialize() async {
    AppLogger.info(
      'pos',
      'initializing',
      fields: {'hasBranch': branchId != null},
    );
    if (branchId == null) {
      setState(() {
        loading = false;
        message = 'Select a branch in your membership before opening POS.';
      });
      return;
    }
    await _ensureDevice();
    await search();
    await _bootstrapOffline();
    await _syncCheckoutOutbox();
    await syncPending();
    AppLogger.info('pos', 'initialized');
  }

  Future<void> _ensureDevice() async {
    const storage = FlutterSecureStorage();
    final storedKey = 'device_id_$organizationId';
    final identifierKey = 'device_identifier_$organizationId';
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
          'variantName': null,
          'sku': product['sku'],
          'barcode': product['barcode'],
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
            'variantName': variant['name'],
            'sku': variant['sku'],
            'barcode': variant['barcode'],
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

  Future<void> search() async {
    if (branchId == null) return;
    setState(() => loading = true);
    try {
      final data = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '/organizations/$organizationId/pos/products',
            query: {'branchId': branchId, 'pageSize': 80, 'search': query.text},
          );
      products = (data['items'] as List<dynamic>)
          .map((row) => PosProduct.fromJson(row as Map<String, dynamic>))
          .toList();
    } catch (_) {
      products =
          (await ref.read(offlineStoreProvider).products(branchId!, query.text))
              .map(PosProduct.fromJson)
              .toList();
      message = products.isEmpty
          ? 'No offline catalogue is available.'
          : 'Offline catalogue · prices and stock are cached.';
    }
    if (mounted) setState(() => loading = false);
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

  void scan(String barcode) {
    query.text = barcode;
    final product = products.where((row) => row.barcode == barcode).firstOrNull;
    if (product != null) {
      add(product);
      query.clear();
    }
  }

  Future<void> checkout() async {
    if (cart.isEmpty || branchId == null) return;
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
    final rows = await ref.read(offlineStoreProvider).pendingSales();
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
                  if (value != null) scan(value);
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
              : GridView.builder(
                  padding: const EdgeInsets.all(18),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 1.05,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                  ),
                  itemCount: products.length,
                  itemBuilder: (_, i) {
                    final p = products[i];
                    return InkWell(
                      onTap: () => add(p),
                      borderRadius: BorderRadius.circular(22),
                      child: Card(
                        color: i % 3 == 1
                            ? const Color(0xFFFFF4D6)
                            : i % 3 == 2
                            ? const Color(0xFFE7F6EF)
                            : Colors.white,
                        child: Padding(
                          padding: const EdgeInsets.all(15),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                backgroundColor: Colors.white70,
                                child: Text(
                                  p.name.characters.first.toUpperCase(),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w900,
                                  ),
                                ),
                              ),
                              const Spacer(),
                              Text(
                                p.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              Text(
                                '${(p.priceMinor / 100).toStringAsFixed(2)} QAR',
                                style: const TextStyle(
                                  color: Color(0xFFF35F45),
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                              if (p.trackInventory)
                                Text(
                                  '${p.availableQuantity ?? '0'} available',
                                  style: const TextStyle(
                                    color: Colors.blueGrey,
                                    fontSize: 10,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
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

class _CheckoutSheet extends StatelessWidget {
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
  final VoidCallback onCheckout;
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
            if (tender == 'CASH')
              TextField(
                controller: cash,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Cash received (QAR)',
                ),
              )
            else ...[
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
                        .map((v) => DropdownMenuItem(value: v, child: Text(v)))
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
            ],
            const SizedBox(height: 18),
            ElevatedButton(
              onPressed: busy ? null : onCheckout,
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
