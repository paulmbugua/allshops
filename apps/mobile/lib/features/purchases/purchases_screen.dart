import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class PurchasesScreen extends ConsumerStatefulWidget {
  const PurchasesScreen({super.key, required this.membership});
  final Membership membership;

  @override
  ConsumerState<PurchasesScreen> createState() => _PurchasesScreenState();
}

class _PurchasesScreenState extends ConsumerState<PurchasesScreen> {
  List<Map<String, dynamic>> rows = const [];
  String status = '';
  String paymentStatus = '';
  bool loading = true;
  String? error;

  String get base => '/organizations/${widget.membership.organizationId}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      final result = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/purchases',
            query: {
              'pageSize': 100,
              if (status.isNotEmpty) 'status': status,
              if (paymentStatus.isNotEmpty) 'paymentStatus': paymentStatus,
            },
          );
      if (mounted) {
        setState(() {
          rows = _page(result);
          error = null;
        });
      }
    } catch (caught) {
      if (mounted) setState(() => error = apiErrorMessage(caught));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) =>
          _PurchaseCreateSheet(base: base, membership: widget.membership),
    );
    if (created == true) await _load();
  }

  Future<void> _open(String id) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PurchaseDetailScreen(
          base: base,
          purchaseId: id,
          membership: widget.membership,
        ),
      ),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'Purchases',
        style: TextStyle(fontWeight: FontWeight.w900),
      ),
      actions: [
        IconButton(
          tooltip: 'Refresh purchases',
          onPressed: loading ? null : _load,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    floatingActionButton: widget.membership.hasPermission('purchase.create')
        ? FloatingActionButton.extended(
            onPressed: _create,
            icon: const Icon(Icons.add_rounded),
            label: const Text('New purchase'),
          )
        : null,
    body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
        children: [
          const _PurchasesHero(),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _filter(
                  'Status',
                  status,
                  const [
                    '',
                    'DRAFT',
                    'PARTIALLY_RECEIVED',
                    'RECEIVED',
                    'CANCELLED',
                  ],
                  (value) {
                    status = value ?? '';
                    _load();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _filter(
                  'Payment',
                  paymentStatus,
                  const ['', 'UNPAID', 'PARTIALLY_PAID', 'PAID'],
                  (value) {
                    paymentStatus = value ?? '';
                    _load();
                  },
                ),
              ),
            ],
          ),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(28),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (error != null) _Notice(error!, error: true),
          ...rows.map(
            (row) => Card(
              child: ListTile(
                onTap: () => _open(row['id'].toString()),
                leading: CircleAvatar(
                  backgroundColor: _statusColor(
                    row['status']?.toString() ?? '',
                  ).withValues(alpha: .12),
                  child: Icon(
                    Icons.inventory_2_outlined,
                    color: _statusColor(row['status']?.toString() ?? ''),
                  ),
                ),
                title: Text(
                  row['purchaseNumber']?.toString() ?? 'Purchase',
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                subtitle: Text(
                  '${_nested(row, 'supplier', 'name') ?? 'Supplier'} · ${_nested(row, 'branch', 'name') ?? ''}\n${_date(row['purchaseDate'])}',
                ),
                isThreeLine: true,
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _money(row['totalMinor']),
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 4),
                    _StatusPill(row['status']?.toString() ?? ''),
                  ],
                ),
              ),
            ),
          ),
          if (!loading && rows.isEmpty)
            const _EmptyState(
              icon: Icons.local_shipping_outlined,
              text: 'No purchases match these filters.',
            ),
        ],
      ),
    ),
  );

  Widget _filter(
    String label,
    String value,
    List<String> values,
    ValueChanged<String?> changed,
  ) => DropdownButtonFormField<String>(
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: values
        .map(
          (item) => DropdownMenuItem(
            value: item,
            child: Text(
              item.isEmpty ? 'All' : item.replaceAll('_', ' '),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        )
        .toList(),
    onChanged: changed,
  );
}

class _PurchaseCreateSheet extends ConsumerStatefulWidget {
  const _PurchaseCreateSheet({required this.base, required this.membership});
  final String base;
  final Membership membership;

  @override
  ConsumerState<_PurchaseCreateSheet> createState() =>
      _PurchaseCreateSheetState();
}

class _PurchaseCreateSheetState extends ConsumerState<_PurchaseCreateSheet> {
  List<Map<String, dynamic>> suppliers = const [];
  List<Map<String, dynamic>> branches = const [];
  List<Map<String, dynamic>> products = const [];
  final invoice = TextEditingController();
  final headerDiscount = TextEditingController(text: '0');
  final notes = TextEditingController();
  final lines = <_DraftLine>[_DraftLine()];
  String? supplierId;
  String? branchId;
  DateTime purchaseDate = DateTime.now();
  DateTime? expectedDate;
  bool loading = true;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    branchId = widget.membership.branchId;
    _bootstrap();
  }

  @override
  void dispose() {
    invoice.dispose();
    headerDiscount.dispose();
    notes.dispose();
    for (final line in lines) {
      line.dispose();
    }
    super.dispose();
  }

  Future<void> _bootstrap() async {
    try {
      final api = ref.read(apiProvider);
      final values = await Future.wait<Object>([
        api.get<Map<String, dynamic>>(
          '${widget.base}/suppliers',
          query: {'pageSize': 100, 'isActive': true},
        ),
        api.get<List<dynamic>>('${widget.base}/branches'),
        api.get<Map<String, dynamic>>(
          '${widget.base}/products',
          query: {'pageSize': 100, 'isActive': true},
        ),
      ]);
      if (!mounted) return;
      setState(() {
        suppliers = _page(values[0]);
        branches = _list(values[1]);
        products = _page(values[2]);
        branchId ??= branches.length == 1
            ? branches.first['id']?.toString()
            : null;
        loading = false;
      });
    } catch (caught) {
      if (mounted) {
        setState(() {
          loading = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }

  int get estimatedMinor {
    final linesTotal = lines.fold<int>(0, (sum, line) {
      final quantity = double.tryParse(line.quantity.text) ?? 0;
      final cost = _minor(line.cost.text);
      return sum +
          (quantity * cost).round() -
          _minor(line.discount.text) +
          _minor(line.tax.text);
    });
    return (linesTotal - _minor(headerDiscount.text)).clamp(0, 1 << 31);
  }

  Future<void> _chooseDate({required bool expected}) async {
    final selected = await showDatePicker(
      context: context,
      initialDate: expected ? expectedDate ?? purchaseDate : purchaseDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (selected != null) {
      setState(() {
        if (expected) {
          expectedDate = selected;
        } else {
          purchaseDate = selected;
        }
      });
    }
  }

  Future<void> _save() async {
    final invalidLine = lines.any(
      (line) =>
          line.productId == null ||
          (double.tryParse(line.quantity.text) ?? 0) <= 0 ||
          _minor(line.cost.text) < 0 ||
          _minor(line.discount.text) < 0 ||
          _minor(line.tax.text) < 0,
    );
    if (supplierId == null ||
        branchId == null ||
        invalidLine ||
        _minor(headerDiscount.text) < 0) {
      setState(() {
        error =
            'Choose a supplier and branch. Every line needs a product, positive quantity, and non-negative cost, discount and tax.';
      });
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .post<Map<String, dynamic>>(
            '${widget.base}/purchases',
            data: {
              'branchId': branchId,
              'supplierId': supplierId,
              'supplierInvoiceNumber': _nullable(invoice.text),
              'purchaseDate': purchaseDate.toUtc().toIso8601String(),
              'expectedDate': expectedDate?.toUtc().toIso8601String(),
              'discountMinor': _minor(headerDiscount.text),
              'notes': _nullable(notes.text),
              'items': lines
                  .map(
                    (line) => {
                      'productId': line.productId,
                      'variantId': line.variantId,
                      'quantity': line.quantity.text.trim(),
                      'unitCostMinor': _minor(line.cost.text),
                      'discountMinor': _minor(line.discount.text),
                      'taxMinor': _minor(line.tax.text),
                    },
                  )
                  .toList(),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (caught) {
      if (mounted) {
        setState(() {
          saving = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => DraggableScrollableSheet(
    expand: false,
    initialChildSize: .92,
    maxChildSize: .98,
    builder: (_, controller) => Column(
      children: [
        Expanded(
          child: ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
            children: [
              const Text(
                'New purchase order',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
              ),
              const Text(
                'Build a supplier order, review its live estimate, then save it as a draft.',
                style: TextStyle(color: Colors.blueGrey),
              ),
              const SizedBox(height: 16),
              if (loading)
                const Padding(
                  padding: EdgeInsets.all(30),
                  child: Center(child: CircularProgressIndicator()),
                )
              else ...[
                _drop(
                  'Supplier',
                  supplierId,
                  suppliers,
                  (value) => setState(() => supplierId = value),
                ),
                _drop(
                  'Receiving branch',
                  branchId,
                  branches,
                  widget.membership.branchId == null
                      ? (value) => setState(() => branchId = value)
                      : null,
                ),
                Row(
                  children: [
                    Expanded(
                      child: _DateButton(
                        label: 'Purchase date',
                        value: _date(purchaseDate),
                        onTap: () => _chooseDate(expected: false),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _DateButton(
                        label: 'Expected date',
                        value: expectedDate == null
                            ? 'Optional'
                            : _date(expectedDate),
                        onTap: () => _chooseDate(expected: true),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: invoice,
                  decoration: const InputDecoration(
                    labelText: 'Supplier invoice number',
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Purchase items',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () => setState(() => lines.add(_DraftLine())),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Add item'),
                    ),
                  ],
                ),
                ...lines.asMap().entries.map(
                  (entry) => _PurchaseLineCard(
                    line: entry.value,
                    products: products,
                    canRemove: lines.length > 1,
                    onChanged: () => setState(() {}),
                    onRemove: () => setState(() {
                      final removed = lines.removeAt(entry.key);
                      removed.dispose();
                    }),
                  ),
                ),
                TextField(
                  controller: headerDiscount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: 'Order discount (QAR)',
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: notes,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Notes (optional)',
                  ),
                ),
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 14),
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F6F0),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Estimated total'),
                      Text(
                        _money(estimatedMinor),
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
                  ),
                ),
                if (error != null) _Notice(error!, error: true),
              ],
            ],
          ),
        ),
        AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SafeArea(
            top: false,
            minimum: const EdgeInsets.fromLTRB(20, 10, 20, 12),
            child: SizedBox(
              width: double.infinity,
              height: 54,
              child: FilledButton.icon(
                onPressed: saving ? null : _save,
                icon: saving
                    ? const SizedBox.square(
                        dimension: 17,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.save_outlined),
                label: Text(saving ? 'Creating…' : 'Create draft purchase'),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _DraftLine {
  String? productId;
  String? variantId;
  final quantity = TextEditingController(text: '1');
  final cost = TextEditingController(text: '0');
  final discount = TextEditingController(text: '0');
  final tax = TextEditingController(text: '0');

  void dispose() {
    quantity.dispose();
    cost.dispose();
    discount.dispose();
    tax.dispose();
  }
}

class _PurchaseLineCard extends StatelessWidget {
  const _PurchaseLineCard({
    required this.line,
    required this.products,
    required this.canRemove,
    required this.onChanged,
    required this.onRemove,
  });
  final _DraftLine line;
  final List<Map<String, dynamic>> products;
  final bool canRemove;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  List<_ProductChoice> get choices => products
      .expand((product) {
        final base = _ProductChoice(
          value: '${product['id']}|',
          label: product['name']?.toString() ?? 'Product',
          productId: product['id'].toString(),
          variantId: null,
          costMinor: (product['costMinor'] as num?)?.toInt() ?? 0,
        );
        final variants = _list(product['variants']).map(
          (variant) => _ProductChoice(
            value: '${product['id']}|${variant['id']}',
            label: '${product['name']} · ${variant['name']}',
            productId: product['id'].toString(),
            variantId: variant['id'].toString(),
            costMinor:
                (variant['costMinor'] as num?)?.toInt() ?? base.costMinor,
          ),
        );
        return [base, ...variants];
      })
      .toList(growable: false);

  @override
  Widget build(BuildContext context) {
    final selection = line.productId == null
        ? null
        : '${line.productId}|${line.variantId ?? ''}';
    return Card(
      color: const Color(0xFFFAFCFB),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: selection,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Product / variant',
                    ),
                    items: choices
                        .map(
                          (choice) => DropdownMenuItem(
                            value: choice.value,
                            child: Text(
                              choice.label,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (value) {
                      final choice = choices.firstWhere(
                        (item) => item.value == value,
                      );
                      line.productId = choice.productId;
                      line.variantId = choice.variantId;
                      line.cost.text = (choice.costMinor / 100).toStringAsFixed(
                        2,
                      );
                      onChanged();
                    },
                  ),
                ),
                if (canRemove)
                  IconButton(
                    tooltip: 'Remove line',
                    onPressed: onRemove,
                    icon: const Icon(Icons.delete_outline, color: Colors.red),
                  ),
              ],
            ),
            const SizedBox(height: 9),
            Row(
              children: [
                Expanded(child: _number('Quantity', line.quantity)),
                const SizedBox(width: 7),
                Expanded(child: _number('Unit cost', line.cost)),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: _number('Discount', line.discount)),
                const SizedBox(width: 7),
                Expanded(child: _number('Tax', line.tax)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _number(String label, TextEditingController controller) => TextField(
    controller: controller,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    onChanged: (_) => onChanged(),
    decoration: InputDecoration(
      labelText: label,
      suffixText: label == 'Quantity' ? null : 'QAR',
    ),
  );
}

class _ProductChoice {
  const _ProductChoice({
    required this.value,
    required this.label,
    required this.productId,
    required this.variantId,
    required this.costMinor,
  });
  final String value;
  final String label;
  final String productId;
  final String? variantId;
  final int costMinor;
}

class PurchaseDetailScreen extends ConsumerStatefulWidget {
  const PurchaseDetailScreen({
    super.key,
    required this.base,
    required this.purchaseId,
    required this.membership,
  });
  final String base;
  final String purchaseId;
  final Membership membership;

  @override
  ConsumerState<PurchaseDetailScreen> createState() =>
      _PurchaseDetailScreenState();
}

class _PurchaseDetailScreenState extends ConsumerState<PurchaseDetailScreen> {
  Map<String, dynamic>? purchase;
  bool loading = true;
  String? message;

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      final value = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '${widget.base}/purchases/${widget.purchaseId}',
          );
      if (mounted) {
        setState(() {
          purchase = value;
          message = null;
        });
      }
    } catch (caught) {
      if (mounted) setState(() => message = apiErrorMessage(caught));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _receive() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) =>
          _ReceivePurchaseSheet(base: widget.base, purchase: purchase!),
    );
    if (changed == true) await _load();
  }

  Future<void> _pay() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) =>
          _SupplierPaymentSheet(base: widget.base, purchase: purchase!),
    );
    if (changed == true) await _load();
  }

  Future<void> _cancel() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancel draft purchase?'),
        content: const Text(
          'Only an unpaid draft can be cancelled. This action is audited.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep draft'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel purchase'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/purchases/${widget.purchaseId}/cancel',
          );
      await _load();
    } catch (caught) {
      if (mounted) setState(() => message = apiErrorMessage(caught));
    }
  }

  @override
  Widget build(BuildContext context) {
    final row = purchase;
    final status = row?['status']?.toString() ?? '';
    final items = _list(row?['items']);
    final payments = _list(row?['payments']);
    final balance = (row?['balanceMinor'] as num?)?.toInt() ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          row?['purchaseNumber']?.toString() ?? 'Purchase',
          style: const TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
          children: [
            if (loading && row == null)
              const Padding(
                padding: EdgeInsets.all(40),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (row == null && message != null)
              _Notice(message!, error: true)
            else if (row != null) ...[
              Card(
                color: const Color(0xFF173B34),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              _nested(row, 'supplier', 'name') ?? 'Supplier',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 21,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          _StatusPill(status),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        '${_nested(row, 'branch', 'name') ?? ''} · ${_date(row['purchaseDate'])}${row['supplierInvoiceNumber'] == null ? '' : ' · Invoice ${row['supplierInvoiceNumber']}'}',
                        style: const TextStyle(color: Color(0xFFBCD3CB)),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(child: _Metric('Total', row['totalMinor'])),
                          Expanded(child: _Metric('Paid', row['paidMinor'])),
                          Expanded(
                            child: _Metric('Balance', row['balanceMinor']),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'Items',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
              ),
              ...items.map((item) {
                final ordered = _quantity(
                  item['orderedQuantity'] ?? item['quantity'],
                );
                final received = _quantity(item['receivedQuantity']);
                final remaining = ordered - received;
                return Card(
                  child: ListTile(
                    title: Text(
                      '${item['productNameSnapshot'] ?? 'Product'}${item['variantNameSnapshot'] == null ? '' : ' · ${item['variantNameSnapshot']}'}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      'Ordered ${_compact(ordered)} · Received ${_compact(received)} · Remaining ${_compact(remaining)}',
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(item['totalMinor']),
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                        Text(
                          '${_money(item['unitCostMinor'])}/unit',
                          style: const TextStyle(
                            fontSize: 10,
                            color: Colors.blueGrey,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              if (payments.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'Payment history',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                ),
                ...payments.reversed.map(
                  (payment) => ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                    leading: const CircleAvatar(
                      child: Icon(Icons.receipt_long_outlined, size: 19),
                    ),
                    title: Text(
                      _money(payment['amountMinor']),
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    subtitle: Text(
                      '${payment['method']?.toString().replaceAll('_', ' ') ?? 'Payment'} · ${_date(payment['paidAt'])}${payment['reference'] == null ? '' : '\nRef ${payment['reference']}'}',
                    ),
                    isThreeLine: payment['reference'] != null,
                  ),
                ),
              ],
              if (row['notes'] != null)
                ListTile(
                  leading: const Icon(Icons.notes_rounded),
                  title: const Text('Notes'),
                  subtitle: Text(row['notes'].toString()),
                ),
              if (message != null) _Notice(message!, error: false),
            ],
          ],
        ),
      ),
      bottomNavigationBar: row == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.end,
                  children: [
                    if (['DRAFT', 'PARTIALLY_RECEIVED'].contains(status) &&
                        widget.membership.hasPermission('purchase.receive'))
                      FilledButton.icon(
                        onPressed: _receive,
                        icon: const Icon(Icons.move_to_inbox_outlined),
                        label: const Text('Receive stock'),
                      ),
                    if (balance > 0 &&
                        status != 'CANCELLED' &&
                        widget.membership.hasPermission(
                          'supplier_payment.create',
                        ))
                      FilledButton.tonalIcon(
                        onPressed: _pay,
                        icon: const Icon(Icons.payments_outlined),
                        label: const Text('Record payment'),
                      ),
                    if (status == 'DRAFT' &&
                        widget.membership.hasPermission(
                          'purchase.cancel_draft',
                        ))
                      OutlinedButton.icon(
                        onPressed: _cancel,
                        icon: const Icon(Icons.cancel_outlined),
                        label: const Text('Cancel draft'),
                      ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _ReceivePurchaseSheet extends ConsumerStatefulWidget {
  const _ReceivePurchaseSheet({required this.base, required this.purchase});
  final String base;
  final Map<String, dynamic> purchase;

  @override
  ConsumerState<_ReceivePurchaseSheet> createState() =>
      _ReceivePurchaseSheetState();
}

class _ReceivePurchaseSheetState extends ConsumerState<_ReceivePurchaseSheet> {
  List<Map<String, dynamic>> locations = const [];
  final quantities = <String, TextEditingController>{};
  String? locationId;
  String? error;
  bool loading = true;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    for (final item in _list(widget.purchase['items'])) {
      quantities[item['id'].toString()] = TextEditingController(text: '0');
    }
    _loadLocations();
  }

  @override
  void dispose() {
    for (final controller in quantities.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadLocations() async {
    try {
      final result = await ref
          .read(apiProvider)
          .get<List<dynamic>>(
            '${widget.base}/stock-locations',
            query: {'branchId': _nested(widget.purchase, 'branch', 'id')},
          );
      if (mounted) {
        setState(() {
          locations = _list(result);
          locationId = locations.length == 1
              ? locations.first['id']?.toString()
              : null;
          loading = false;
        });
      }
    } catch (caught) {
      if (mounted) {
        setState(() {
          loading = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }

  Future<void> _save() async {
    final items = _list(widget.purchase['items'])
        .map((item) {
          final id = item['id'].toString();
          return {
            'purchaseItemId': id,
            'quantity': quantities[id]!.text.trim(),
          };
        })
        .where((item) => (_quantity(item['quantity'])) > 0)
        .toList();
    if (locationId == null || items.isEmpty) {
      setState(
        () => error = 'Choose a destination and enter at least one quantity.',
      );
      return;
    }
    for (final item in _list(widget.purchase['items'])) {
      final requested = _quantity(quantities[item['id'].toString()]!.text);
      final remaining =
          _quantity(item['orderedQuantity'] ?? item['quantity']) -
          _quantity(item['receivedQuantity']);
      if (requested > remaining) {
        setState(
          () => error = 'A received quantity exceeds the remaining order.',
        );
        return;
      }
    }
    setState(() => saving = true);
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/purchases/${widget.purchase['id']}/receive',
            headers: {'Idempotency-Key': const Uuid().v4()},
            data: {'locationId': locationId, 'items': items},
          );
      if (mounted) Navigator.pop(context, true);
    } catch (caught) {
      if (mounted) {
        setState(() {
          saving = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Receive stock',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          const Text(
            'Only quantities entered below will be added to inventory.',
            style: TextStyle(color: Colors.blueGrey),
          ),
          const SizedBox(height: 14),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else ...[
            _drop(
              'Destination location',
              locationId,
              locations,
              (value) => setState(() => locationId = value),
            ),
            ..._list(widget.purchase['items']).map((item) {
              final ordered = _quantity(
                item['orderedQuantity'] ?? item['quantity'],
              );
              final received = _quantity(item['receivedQuantity']);
              final remaining = ordered - received;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: TextField(
                  controller: quantities[item['id'].toString()],
                  enabled: remaining > 0,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText:
                        item['productNameSnapshot']?.toString() ?? 'Product',
                    helperText: '${_compact(remaining)} remaining',
                  ),
                ),
              );
            }),
            if (error != null) _Notice(error!, error: true),
            FilledButton.icon(
              onPressed: saving ? null : _save,
              icon: const Icon(Icons.inventory_rounded),
              label: Text(
                saving ? 'Receiving…' : 'Receive selected quantities',
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

class _SupplierPaymentSheet extends ConsumerStatefulWidget {
  const _SupplierPaymentSheet({required this.base, required this.purchase});
  final String base;
  final Map<String, dynamic> purchase;

  @override
  ConsumerState<_SupplierPaymentSheet> createState() =>
      _SupplierPaymentSheetState();
}

class _SupplierPaymentSheetState extends ConsumerState<_SupplierPaymentSheet> {
  final amount = TextEditingController();
  final reference = TextEditingController();
  final notes = TextEditingController();
  String method = 'BANK_TRANSFER';
  DateTime paidAt = DateTime.now();
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    amount.text = (((widget.purchase['balanceMinor'] as num?) ?? 0) / 100)
        .toStringAsFixed(2);
  }

  @override
  void dispose() {
    amount.dispose();
    reference.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final amountMinor = _minor(amount.text);
    final balance = (widget.purchase['balanceMinor'] as num?)?.toInt() ?? 0;
    if (amountMinor <= 0 || amountMinor > balance) {
      setState(
        () =>
            error = 'Payment must be above zero and cannot exceed the balance.',
      );
      return;
    }
    setState(() => saving = true);
    try {
      await ref
          .read(apiProvider)
          .post<Object?>(
            '${widget.base}/suppliers/${_nested(widget.purchase, 'supplier', 'id')}/payments',
            headers: {'Idempotency-Key': const Uuid().v4()},
            data: {
              'purchaseId': widget.purchase['id'],
              'amountMinor': amountMinor,
              'method': method,
              'reference': _nullable(reference.text),
              'paidAt': paidAt.toUtc().toIso8601String(),
              'notes': _nullable(notes.text),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (caught) {
      if (mounted) {
        setState(() {
          saving = false;
          error = apiErrorMessage(caught);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      0,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Record supplier payment',
            style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
          ),
          Text(
            'Outstanding ${_money(widget.purchase['balanceMinor'])}',
            style: const TextStyle(color: Colors.blueGrey),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: amount,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount',
              prefixText: 'QAR ',
            ),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: method,
            decoration: const InputDecoration(labelText: 'Payment method'),
            items: const ['CASH', 'CARD', 'BANK_TRANSFER', 'QR', 'OTHER']
                .map(
                  (value) => DropdownMenuItem(
                    value: value,
                    child: Text(value.replaceAll('_', ' ')),
                  ),
                )
                .toList(),
            onChanged: (value) => setState(() => method = value!),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: reference,
            decoration: const InputDecoration(
              labelText: 'Reference (optional)',
            ),
          ),
          const SizedBox(height: 10),
          _DateButton(
            label: 'Payment date',
            value: _date(paidAt),
            onTap: () async {
              final selected = await showDatePicker(
                context: context,
                initialDate: paidAt,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
              );
              if (selected != null) setState(() => paidAt = selected);
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: notes,
            decoration: const InputDecoration(labelText: 'Notes (optional)'),
          ),
          if (error != null) _Notice(error!, error: true),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: saving ? null : _save,
            icon: const Icon(Icons.payments_outlined),
            label: Text(saving ? 'Recording…' : 'Record payment'),
          ),
        ],
      ),
    ),
  );
}

class _PurchasesHero extends StatelessWidget {
  const _PurchasesHero();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xFF173B34), Color(0xFF337A66)],
      ),
      borderRadius: BorderRadius.circular(22),
    ),
    child: const Row(
      children: [
        CircleAvatar(
          backgroundColor: Color(0xFFFFCF5C),
          child: Icon(Icons.local_shipping_outlined, color: Color(0xFF173B34)),
        ),
        SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Purchasing workspace',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                'Order, receive and settle supplier stock.',
                style: TextStyle(color: Color(0xFFBDD4CD)),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);
  final String label;
  final dynamic value;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(color: Color(0xFFBDD4CD), fontSize: 10),
      ),
      Text(
        _money(value),
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
        ),
      ),
    ],
  );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.value);
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color: _statusColor(value).withValues(alpha: .14),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      value.replaceAll('_', ' '),
      style: TextStyle(
        color: _statusColor(value),
        fontSize: 9,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _DateButton extends StatelessWidget {
  const _DateButton({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(13),
    child: InputDecorator(
      decoration: InputDecoration(labelText: label),
      child: Row(
        children: [
          Expanded(child: Text(value, overflow: TextOverflow.ellipsis)),
          const Icon(Icons.calendar_month_outlined, size: 18),
        ],
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {required this.error});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(vertical: 9),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error ? const Color(0xFFFFE5E1) : const Color(0xFFE4F7ED),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(38),
    child: Column(
      children: [
        Icon(icon, size: 46, color: Colors.blueGrey.shade200),
        const SizedBox(height: 9),
        Text(text, style: const TextStyle(color: Colors.blueGrey)),
      ],
    ),
  );
}

Widget _drop(
  String label,
  String? value,
  List<Map<String, dynamic>> rows,
  ValueChanged<String?>? changed,
) => Padding(
  padding: const EdgeInsets.only(bottom: 10),
  child: DropdownButtonFormField<String>(
    key: ValueKey('$label:$value:${rows.length}'),
    initialValue: rows.any((row) => row['id']?.toString() == value)
        ? value
        : null,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: rows
        .map(
          (row) => DropdownMenuItem(
            value: row['id']?.toString(),
            child: Text(
              row['name']?.toString() ?? '',
              overflow: TextOverflow.ellipsis,
            ),
          ),
        )
        .toList(),
    onChanged: changed,
  ),
);

List<Map<String, dynamic>> _list(dynamic value) =>
    (value as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((row) => Map<String, dynamic>.from(row))
        .toList();

List<Map<String, dynamic>> _page(dynamic value) =>
    value is Map<String, dynamic> ? _list(value['items']) : const [];

String? _nested(Map<String, dynamic>? row, String parent, String key) =>
    row?[parent] is Map ? row![parent][key]?.toString() : null;

String? _nullable(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

int _minor(String value) {
  final number = double.tryParse(value.trim());
  return number == null || !number.isFinite ? -1 : (number * 100).round();
}

double _quantity(dynamic value) =>
    double.tryParse(value?.toString() ?? '') ?? 0;

String _compact(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value
          .toStringAsFixed(2)
          .replaceFirst(RegExp(r'0+$'), '')
          .replaceFirst(RegExp(r'\.$'), '');

String _money(dynamic value) {
  final minor = value is num ? value.toInt() : int.tryParse('$value') ?? 0;
  return 'QAR ${(minor / 100).toStringAsFixed(2)}';
}

String _date(dynamic value) {
  final date = value is DateTime
      ? value
      : DateTime.tryParse(value?.toString() ?? '');
  return date == null ? '' : DateFormat('d MMM y').format(date.toLocal());
}

Color _statusColor(String status) => switch (status) {
  'RECEIVED' => const Color(0xFF16705A),
  'PARTIALLY_RECEIVED' => const Color(0xFFB16D12),
  'CANCELLED' => const Color(0xFFB44736),
  _ => const Color(0xFF476D9D),
};
