import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:uuid/uuid.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class InventoryScreen extends StatelessWidget {
  const InventoryScreen({
    super.key,
    required this.membership,
    this.initialTab = 0,
  });
  final Membership membership;
  final int initialTab;
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    initialIndex: initialTab,
    child: Scaffold(
      appBar: AppBar(
        title: const Text(
          'Inventory control',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        bottom: const TabBar(
          tabs: [
            Tab(icon: Icon(Icons.inventory_2_outlined), text: 'Current'),
            Tab(icon: Icon(Icons.swap_vert_rounded), text: 'Movements'),
            Tab(icon: Icon(Icons.compare_arrows_rounded), text: 'Transfers'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          _CurrentStock(membership),
          _Movements(membership),
          _Transfers(membership),
        ],
      ),
    ),
  );
}

class _CurrentStock extends ConsumerStatefulWidget {
  const _CurrentStock(this.membership);
  final Membership membership;
  @override
  ConsumerState<_CurrentStock> createState() => _CurrentStockState();
}

class _CurrentStockState extends ConsumerState<_CurrentStock> {
  List<Map<String, dynamic>> rows = const [],
      branches = const [],
      locations = const [],
      products = const [];
  String branch = '', location = '', stock = '';
  bool loading = true;
  String? error;
  String get base => '/organizations/${widget.membership.organizationId}';
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() => loading = true);
    try {
      final api = ref.read(apiProvider);
      final values = await Future.wait([
        api.get<List<dynamic>>('$base/branches'),
        api.get<List<dynamic>>('$base/stock-locations'),
        api.get<Map<String, dynamic>>(
          '$base/products',
          query: {'pageSize': 100, 'trackInventory': true, 'isActive': true},
        ),
      ]);
      branches = _list(values[0]);
      locations = _list(values[1]);
      products = _page(values[2]);
      if (widget.membership.branchId != null) {
        branch = widget.membership.branchId!;
      }
      await _load();
    } catch (e) {
      error = apiErrorMessage(e);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _load() async {
    try {
      final response = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/inventory',
            query: {
              'pageSize': 100,
              if (branch.isNotEmpty) 'branchId': branch,
              if (location.isNotEmpty) 'locationId': location,
              if (stock.isNotEmpty) 'lowStock': stock,
            },
          );
      if (mounted) {
        setState(() {
          rows = _page(response);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = apiErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 90),
      children: [
        _InventoryHero(
          count: rows.length,
          low: rows.where((r) => r['lowStock'] == true).length,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _select(
                'Branch',
                branch,
                [
                  {'id': '', 'name': 'All branches'},
                  ...branches,
                ],
                (v) {
                  setState(() {
                    branch = v ?? '';
                    location = '';
                  });
                  _load();
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _select(
                'Location',
                location,
                [
                  {'id': '', 'name': 'All locations'},
                  ...locations.where(
                    (l) => branch.isEmpty || l['branchId'] == branch,
                  ),
                ],
                (v) {
                  setState(() => location = v ?? '');
                  _load();
                },
              ),
            ),
          ],
        ),
        _select(
          'Stock status',
          stock,
          const [
            {'id': '', 'name': 'All stock'},
            {'id': 'true', 'name': 'Low stock'},
            {'id': 'false', 'name': 'Healthy stock'},
          ],
          (v) {
            setState(() => stock = v ?? '');
            _load();
          },
        ),
        if (widget.membership.hasPermission('inventory.adjust') ||
            widget.membership.hasPermission('inventory.opening'))
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: () => _adjust(),
              icon: const Icon(Icons.add_box_outlined),
              label: const Text('Post stock'),
            ),
          ),
        if (loading)
          const Padding(
            padding: EdgeInsets.all(25),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (error != null) _Message(error!, true),
        ...rows.map(
          (row) => Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: (row['lowStock'] == true
                    ? const Color(0xFFFFE8D1)
                    : const Color(0xFFE1F5EA)),
                child: Icon(
                  row['lowStock'] == true
                      ? Icons.warning_amber_rounded
                      : Icons.inventory_2_outlined,
                  color: row['lowStock'] == true
                      ? const Color(0xFFB16D12)
                      : const Color(0xFF27815F),
                ),
              ),
              title: Text(
                _nested(row, 'product', 'name') ?? 'Product',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                '${_nested(row, 'branch', 'name') ?? ''} · ${_nested(row, 'location', 'name') ?? ''}\n${_nested(row, 'variant', 'name') ?? _nested(row, 'product', 'sku') ?? 'Base product'}',
              ),
              isThreeLine: true,
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${row['quantity'] ?? 0}',
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    row['lowStock'] == true ? 'LOW' : 'IN STOCK',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      color: row['lowStock'] == true
                          ? Colors.orange.shade800
                          : Colors.green.shade700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (!loading && rows.isEmpty)
          const _Empty('No stock balances match these filters.'),
      ],
    ),
  );
  Widget _select(
    String label,
    String value,
    List<Map<String, dynamic>> options,
    ValueChanged<String?> changed,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 9),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label:$value:${options.length}'),
      initialValue: options.any((o) => o['id'].toString() == value)
          ? value
          : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: options
          .map(
            (o) => DropdownMenuItem(
              value: o['id'].toString(),
              child: Text(
                '${o['branch'] is Map ? '${o['branch']['name']} · ' : ''}${o['name']}',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: changed,
    ),
  );
  Future<void> _adjust() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _AdjustmentSheet(
        base: base,
        membership: widget.membership,
        branches: branches,
        locations: locations,
        products: products,
        balances: rows,
      ),
    );
    if (saved == true) await _load();
  }
}

class _AdjustmentSheet extends ConsumerStatefulWidget {
  const _AdjustmentSheet({
    required this.base,
    required this.membership,
    required this.branches,
    required this.locations,
    required this.products,
    required this.balances,
  });
  final String base;
  final Membership membership;
  final List<Map<String, dynamic>> branches, locations, products, balances;
  @override
  ConsumerState<_AdjustmentSheet> createState() => _AdjustmentSheetState();
}

class _AdjustmentSheetState extends ConsumerState<_AdjustmentSheet> {
  String? branch, location, product, variant;
  String operation = 'IN';
  final quantity = TextEditingController(), reason = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    branch =
        widget.membership.branchId ??
        (widget.branches.length == 1
            ? widget.branches.first['id']?.toString()
            : null);
    _syncLocation();
  }

  @override
  void dispose() {
    quantity.dispose();
    reason.dispose();
    super.dispose();
  }

  void _syncLocation() {
    final choices = widget.locations
        .where((l) => l['branchId'] == branch)
        .toList();
    location = choices.any((l) => l['id'] == location)
        ? location
        : (choices.isNotEmpty ? choices.first['id']?.toString() : null);
  }

  Map<String, dynamic>? get chosen => widget.products
      .cast<Map<String, dynamic>?>()
      .firstWhere((p) => p?['id'] == product, orElse: () => null);
  num get current {
    for (final row in widget.balances) {
      if (_nested(row, 'location', 'id') == location &&
          _nested(row, 'product', 'id') == product &&
          (_nested(row, 'variant', 'id') ?? '') == (variant ?? '')) {
        return num.tryParse(row['quantity'].toString()) ?? 0;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final variants = (chosen?['variants'] as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final amount = num.tryParse(quantity.text) ?? 0;
    final result = current + (operation == 'OUT' ? -amount : amount);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          0,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Post stock movement',
                style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 14),
              _drop(
                'Branch',
                branch,
                widget.branches,
                (v) => setState(() {
                  branch = v;
                  _syncLocation();
                }),
              ),
              _drop(
                'Location',
                location,
                widget.locations.where((l) => l['branchId'] == branch).toList(),
                (v) => setState(() => location = v),
              ),
              _drop(
                'Product',
                product,
                widget.products,
                (v) => setState(() {
                  product = v;
                  variant = null;
                }),
              ),
              if (variants.isNotEmpty)
                _drop(
                  'Variant',
                  variant,
                  [
                    {'id': '', 'name': 'Base product'},
                    ...variants,
                  ],
                  (v) => setState(() => variant = (v ?? '').isEmpty ? null : v),
                ),
              DropdownButtonFormField<String>(
                initialValue: operation,
                decoration: const InputDecoration(labelText: 'Movement'),
                items: [
                  if (widget.membership.hasPermission('inventory.opening'))
                    const DropdownMenuItem(
                      value: 'OPENING',
                      child: Text('Opening stock'),
                    ),
                  if (widget.membership.hasPermission(
                    'inventory.adjust',
                  )) ...const [
                    DropdownMenuItem(value: 'IN', child: Text('Adjustment in')),
                    DropdownMenuItem(
                      value: 'OUT',
                      child: Text('Adjustment out'),
                    ),
                  ],
                ],
                onChanged: (v) => setState(() => operation = v ?? 'IN'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: quantity,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(labelText: 'Quantity'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: reason,
                decoration: const InputDecoration(labelText: 'Reason'),
              ),
              Container(
                margin: const EdgeInsets.symmetric(vertical: 14),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFE9F6F1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Current $current'),
                    Text(
                      'Result $result',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ],
                ),
              ),
              if (error != null) _Message(error!, true),
              FilledButton(
                onPressed: busy ? null : _save,
                child: const Text('Confirm movement'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _drop(
    String label,
    String? value,
    List<Map<String, dynamic>> rows,
    ValueChanged<String?> changed,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label:$value:${rows.length}'),
      initialValue: rows.any((r) => r['id']?.toString() == value)
          ? value
          : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: rows
          .map(
            (r) => DropdownMenuItem(
              value: r['id']?.toString(),
              child: Text(
                r['name']?.toString() ?? '',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: changed,
    ),
  );
  Future<void> _save() async {
    final amount = num.tryParse(quantity.text);
    if (branch == null ||
        location == null ||
        product == null ||
        amount == null ||
        amount <= 0) {
      setState(
        () => error =
            'Choose a route and product, then enter a positive quantity.',
      );
      return;
    }
    if (operation != 'OPENING' && reason.text.trim().isEmpty) {
      setState(() => error = 'A reason is required for adjustments.');
      return;
    }
    setState(() => busy = true);
    try {
      final opening = operation == 'OPENING';
      await ref
          .read(apiProvider)
          .post<dynamic>(
            '${widget.base}/inventory/${opening ? 'opening-stock' : 'adjustments'}',
            headers: {'Idempotency-Key': const Uuid().v4()},
            data: {
              'branchId': branch,
              'locationId': location,
              'productId': product,
              'variantId': variant,
              'quantity': amount.toString(),
              if (!opening) 'direction': operation,
              'reason': reason.text.trim().isEmpty ? null : reason.text.trim(),
              if (opening) 'unitCostMinor': null,
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = apiErrorMessage(e);
        });
      }
    }
  }
}

class _Movements extends ConsumerStatefulWidget {
  const _Movements(this.membership);
  final Membership membership;
  @override
  ConsumerState<_Movements> createState() => _MovementsState();
}

class _MovementsState extends ConsumerState<_Movements> {
  List<Map<String, dynamic>> rows = const [];
  String type = '';
  bool loading = true;
  String? error;
  String get base => '/organizations/${widget.membership.organizationId}';
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final response = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/inventory/movements',
            query: {'pageSize': 100, if (type.isNotEmpty) 'movementType': type},
          );
      if (mounted) {
        setState(() {
          rows = _page(response);
          error = null;
        });
      }
    } catch (e) {
      error = apiErrorMessage(e);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.all(14),
      children: [
        DropdownButtonFormField<String>(
          initialValue: type,
          decoration: const InputDecoration(
            labelText: 'Movement type',
            prefixIcon: Icon(Icons.filter_list_rounded),
          ),
          items:
              [
                    '',
                    'OPENING',
                    'ADJUSTMENT_IN',
                    'ADJUSTMENT_OUT',
                    'TRANSFER_IN',
                    'TRANSFER_OUT',
                    'SALE',
                    'PURCHASE',
                  ]
                  .map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(
                        v.isEmpty ? 'All movements' : v.replaceAll('_', ' '),
                      ),
                    ),
                  )
                  .toList(),
          onChanged: (v) {
            type = v ?? '';
            _load();
          },
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (error != null) _Message(error!, true),
        ...rows.map((row) {
          final q = row['quantity']?.toString() ?? '0';
          final negative = q.startsWith('-');
          return Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: (negative ? Colors.red : Colors.green)
                    .withValues(alpha: .1),
                child: Icon(
                  negative
                      ? Icons.south_east_rounded
                      : Icons.north_east_rounded,
                  color: negative ? Colors.red : Colors.green,
                ),
              ),
              title: Text(
                _nested(row, 'product', 'name') ?? 'Product',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                '${_nested(row, 'branch', 'name') ?? ''} · ${_nested(row, 'location', 'name') ?? ''}\n${_date(row['occurredAt'])} · ${(row['movementType'] ?? '').toString().replaceAll('_', ' ')}${row['reason'] != null ? ' · ${row['reason']}' : ''}',
              ),
              isThreeLine: true,
              trailing: Text(
                q,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: negative ? Colors.red : Colors.green,
                ),
              ),
            ),
          );
        }),
        if (!loading && rows.isEmpty)
          const _Empty('No stock movements match this filter.'),
      ],
    ),
  );
}

class _Transfers extends ConsumerStatefulWidget {
  const _Transfers(this.membership);
  final Membership membership;
  @override
  ConsumerState<_Transfers> createState() => _TransfersState();
}

class _TransfersState extends ConsumerState<_Transfers> {
  List<Map<String, dynamic>> rows = const [],
      branches = const [],
      locations = const [],
      products = const [];
  String status = '';
  bool loading = true;
  String? error;
  String get base => '/organizations/${widget.membership.organizationId}';
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() => loading = true);
    try {
      final api = ref.read(apiProvider);
      final values = await Future.wait([
        api.get<List<dynamic>>('$base/branches'),
        api.get<List<dynamic>>('$base/stock-locations'),
        api.get<Map<String, dynamic>>(
          '$base/products',
          query: {'pageSize': 100, 'trackInventory': true, 'isActive': true},
        ),
      ]);
      branches = _list(values[0]);
      locations = _list(values[1]);
      products = _page(values[2]);
      await _load();
    } catch (e) {
      error = apiErrorMessage(e);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _load() async {
    try {
      final response = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '$base/inventory/transfers',
            query: {'pageSize': 100, if (status.isNotEmpty) 'status': status},
          );
      if (mounted) {
        setState(() {
          rows = _page(response);
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = apiErrorMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 90),
      children: [
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: status,
                decoration: const InputDecoration(labelText: 'Transfer status'),
                items: ['', 'DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']
                    .map(
                      (v) => DropdownMenuItem(
                        value: v,
                        child: Text(v.isEmpty ? 'All transfers' : v),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  status = v ?? '';
                  _load();
                },
              ),
            ),
            if (widget.membership.hasPermission('inventory.transfer'))
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: FilledButton.icon(
                  onPressed: _create,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('New'),
                ),
              ),
          ],
        ),
        if (loading)
          const Padding(
            padding: EdgeInsets.all(28),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (error != null) _Message(error!, true),
        ...rows.map(
          (row) => Card(
            child: ListTile(
              onTap: () => _open(row['id'].toString()),
              leading: const CircleAvatar(
                child: Icon(Icons.local_shipping_outlined),
              ),
              title: Text(
                row['transferNumber']?.toString() ?? 'Transfer',
                style: const TextStyle(fontWeight: FontWeight.w900),
              ),
              subtitle: Text(
                '${_nested(row, 'fromBranch', 'name') ?? ''} → ${_nested(row, 'toBranch', 'name') ?? ''}\n${row['_count'] is Map ? row['_count']['items'] : 0} items · ${_date(row['createdAt'])}',
              ),
              isThreeLine: true,
              trailing: _TransferStatus(row['status']?.toString() ?? ''),
            ),
          ),
        ),
        if (!loading && rows.isEmpty)
          const _Empty('No stock transfers match this filter.'),
      ],
    ),
  );
  Future<void> _create() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _TransferCreate(
        base: base,
        branches: branches,
        locations: locations,
        products: products,
        membership: widget.membership,
      ),
    );
    if (saved == true) await _load();
  }

  Future<void> _open(String id) async {
    try {
      final row = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>('$base/inventory/transfers/$id');
      if (!mounted) return;
      final changed = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (_) => _TransferDetail(
          base: base,
          row: row,
          membership: widget.membership,
        ),
      );
      if (changed == true) await _load();
    } catch (e) {
      if (mounted) setState(() => error = apiErrorMessage(e));
    }
  }
}

class _TransferCreate extends ConsumerStatefulWidget {
  const _TransferCreate({
    required this.base,
    required this.branches,
    required this.locations,
    required this.products,
    required this.membership,
  });
  final String base;
  final List<Map<String, dynamic>> branches, locations, products;
  final Membership membership;
  @override
  ConsumerState<_TransferCreate> createState() => _TransferCreateState();
}

class _TransferCreateState extends ConsumerState<_TransferCreate> {
  String? fromBranch, fromLocation, toBranch, toLocation;
  final notes = TextEditingController();
  final items = <Map<String, String?>>[
    {'productId': null, 'quantity': '1'},
  ];
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    fromBranch = widget.membership.branchId;
  }

  @override
  void dispose() {
    notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'New stock transfer',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 14),
            _drop(
              'From branch',
              fromBranch,
              widget.branches,
              (v) => setState(() {
                fromBranch = v;
                fromLocation = null;
              }),
            ),
            _drop(
              'From location',
              fromLocation,
              widget.locations
                  .where((l) => l['branchId'] == fromBranch)
                  .toList(),
              (v) => setState(() => fromLocation = v),
            ),
            _drop(
              'To branch',
              toBranch,
              widget.branches.where((b) => b['id'] != fromBranch).toList(),
              (v) => setState(() {
                toBranch = v;
                toLocation = null;
              }),
            ),
            _drop(
              'To location',
              toLocation,
              widget.locations.where((l) => l['branchId'] == toBranch).toList(),
              (v) => setState(() => toLocation = v),
            ),
            const Text(
              'Items',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900),
            ),
            ...items.asMap().entries.map(
              (entry) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Row(
                    children: [
                      Expanded(
                        flex: 3,
                        child: _drop(
                          'Product',
                          entry.value['productId'],
                          widget.products,
                          (v) => setState(() => entry.value['productId'] = v),
                          compact: true,
                        ),
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: TextFormField(
                          initialValue: entry.value['quantity'],
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          decoration: const InputDecoration(labelText: 'Qty'),
                          onChanged: (v) => entry.value['quantity'] = v,
                        ),
                      ),
                      if (items.length > 1)
                        IconButton(
                          onPressed: () =>
                              setState(() => items.removeAt(entry.key)),
                          icon: const Icon(
                            Icons.delete_outline,
                            color: Colors.red,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            OutlinedButton.icon(
              onPressed: () => setState(
                () => items.add({'productId': null, 'quantity': '1'}),
              ),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add another product'),
            ),
            TextField(
              controller: notes,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Notes (optional)'),
            ),
            if (error != null) _Message(error!, true),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: busy ? null : _save,
              child: const Text('Save draft transfer'),
            ),
          ],
        ),
      ),
    ),
  );
  Widget _drop(
    String label,
    String? value,
    List<Map<String, dynamic>> rows,
    ValueChanged<String?> changed, {
    bool compact = false,
  }) => Padding(
    padding: EdgeInsets.only(bottom: compact ? 0 : 10),
    child: DropdownButtonFormField<String>(
      key: ValueKey('$label:$value:${rows.length}'),
      initialValue: rows.any((r) => r['id']?.toString() == value)
          ? value
          : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: rows
          .map(
            (r) => DropdownMenuItem(
              value: r['id']?.toString(),
              child: Text(
                '${r['name'] ?? 'Product'}${r['sku'] != null ? ' · ${r['sku']}' : ''}',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          )
          .toList(),
      onChanged: changed,
    ),
  );
  Future<void> _save() async {
    if (fromBranch == null ||
        fromLocation == null ||
        toBranch == null ||
        toLocation == null ||
        fromBranch == toBranch ||
        items.any(
          (i) =>
              i['productId'] == null ||
              (num.tryParse(i['quantity'] ?? '') ?? 0) <= 0,
        )) {
      setState(
        () => error =
            'Choose different source and destination branches, their locations, and valid items.',
      );
      return;
    }
    setState(() => busy = true);
    try {
      await ref
          .read(apiProvider)
          .post<dynamic>(
            '${widget.base}/inventory/transfers',
            headers: {'Idempotency-Key': const Uuid().v4()},
            data: {
              'fromBranchId': fromBranch,
              'fromLocationId': fromLocation,
              'toBranchId': toBranch,
              'toLocationId': toLocation,
              'notes': notes.text.trim().isEmpty ? null : notes.text.trim(),
              'items': items
                  .map(
                    (i) => {
                      'productId': i['productId'],
                      'quantity': i['quantity'],
                    },
                  )
                  .toList(),
            },
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          error = apiErrorMessage(e);
        });
      }
    }
  }
}

class _TransferDetail extends ConsumerStatefulWidget {
  const _TransferDetail({
    required this.base,
    required this.row,
    required this.membership,
  });
  final String base;
  final Map<String, dynamic> row;
  final Membership membership;
  @override
  ConsumerState<_TransferDetail> createState() => _TransferDetailState();
}

class _TransferDetailState extends ConsumerState<_TransferDetail> {
  bool busy = false;
  String? message;
  @override
  Widget build(BuildContext context) {
    final status = widget.row['status']?.toString() ?? '';
    final items = (widget.row['items'] as List<dynamic>? ?? const [])
        .whereType<Map>();
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .75,
        maxChildSize: .94,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 25),
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.row['transferNumber']?.toString() ?? 'Transfer',
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                _TransferStatus(status),
              ],
            ),
            const SizedBox(height: 10),
            _route(
              'From',
              _nested(widget.row, 'fromBranch', 'name'),
              _nested(widget.row, 'fromLocation', 'name'),
            ),
            _route(
              'To',
              _nested(widget.row, 'toBranch', 'name'),
              _nested(widget.row, 'toLocation', 'name'),
            ),
            const Divider(height: 26),
            ...items.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  _nested(Map<String, dynamic>.from(item), 'product', 'name') ??
                      'Product',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(
                  _nested(Map<String, dynamic>.from(item), 'variant', 'name') ??
                      _nested(
                        Map<String, dynamic>.from(item),
                        'product',
                        'sku',
                      ) ??
                      'Base product',
                ),
                trailing: Text(
                  '${item['quantity']}',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
            if (message != null) _Message(message!, false),
            Wrap(
              spacing: 8,
              children: [
                if (status == 'DRAFT' &&
                    widget.membership.hasPermission('inventory.transfer'))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _act('send'),
                    icon: const Icon(Icons.outbound_outlined),
                    label: const Text('Send'),
                  ),
                if (status == 'SENT' &&
                    widget.membership.hasPermission(
                      'inventory.transfer.receive',
                    ))
                  FilledButton.icon(
                    onPressed: busy ? null : () => _act('receive'),
                    icon: const Icon(Icons.move_to_inbox_outlined),
                    label: const Text('Confirm receipt'),
                  ),
                if (['DRAFT', 'SENT'].contains(status) &&
                    widget.membership.hasPermission('inventory.transfer'))
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => _act('cancel'),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Cancel'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _route(String label, String? branch, String? location) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: const Icon(Icons.location_on_outlined),
    title: Text(label),
    subtitle: Text('${branch ?? ''} · ${location ?? ''}'),
  );
  Future<void> _act(String action) async {
    setState(() => busy = true);
    try {
      await ref
          .read(apiProvider)
          .post<dynamic>(
            '${widget.base}/inventory/transfers/${widget.row['id']}/$action',
            headers: action == 'cancel'
                ? null
                : {'Idempotency-Key': const Uuid().v4()},
          );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          busy = false;
          message = apiErrorMessage(e);
        });
      }
    }
  }
}

class _InventoryHero extends StatelessWidget {
  const _InventoryHero({required this.count, required this.low});
  final int count, low;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        colors: [Color(0xFF173B34), Color(0xFF2C6E5D)],
      ),
      borderRadius: BorderRadius.circular(22),
    ),
    child: Row(
      children: [
        const CircleAvatar(
          backgroundColor: Color(0xFFFFCF5C),
          child: Icon(Icons.warehouse_outlined, color: Color(0xFF173B34)),
        ),
        const SizedBox(width: 13),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Live stock control',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              Text(
                '$count balances · $low need attention',
                style: const TextStyle(color: Color(0xFFBDD4CD)),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _TransferStatus extends StatelessWidget {
  const _TransferStatus(this.value);
  final String value;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
    decoration: BoxDecoration(
      color:
          (value == 'RECEIVED'
                  ? Colors.green
                  : value == 'CANCELLED'
                  ? Colors.red
                  : Colors.orange)
              .withValues(alpha: .12),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      value,
      style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900),
    ),
  );
}

class _Message extends StatelessWidget {
  const _Message(this.text, this.error);
  final String text;
  final bool error;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(vertical: 8),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: error ? const Color(0xFFFFE5E1) : const Color(0xFFE4F7ED),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text),
  );
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(35),
    child: Column(
      children: [
        Icon(
          Icons.inventory_2_outlined,
          size: 44,
          color: Colors.blueGrey.shade200,
        ),
        const SizedBox(height: 8),
        Text(text, style: const TextStyle(color: Colors.blueGrey)),
      ],
    ),
  );
}

List<Map<String, dynamic>> _list(dynamic value) =>
    (value as List<dynamic>? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
List<Map<String, dynamic>> _page(dynamic value) =>
    value is Map<String, dynamic> ? _list(value['items']) : const [];
String? _nested(Map<String, dynamic> row, String parent, String key) =>
    row[parent] is Map ? row[parent][key]?.toString() : null;
String _date(dynamic value) {
  final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  return date == null ? '' : DateFormat('d MMM y, h:mm a').format(date);
}
