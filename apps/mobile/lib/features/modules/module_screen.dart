import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';
import 'module_config.dart';

class ModuleScreen extends ConsumerStatefulWidget {
  const ModuleScreen({
    super.key,
    required this.membership,
    required this.title,
    required this.path,
  });
  final Membership membership;
  final String title;
  final String path;
  @override
  ConsumerState<ModuleScreen> createState() => _ModuleScreenState();
}

class _ModuleScreenState extends ConsumerState<ModuleScreen> {
  late final ModuleConfig config;
  Future<dynamic>? data;
  String query = '';

  String get base =>
      '/organizations/${widget.membership.organizationId}/${config.path}';
  bool get canCreate {
    final permission = moduleCreatePermission(config.path);
    return config.createFields.isNotEmpty &&
        (permission == null || widget.membership.hasPermission(permission));
  }

  @override
  void initState() {
    super.initState();
    config = configFor(widget.path, widget.title);
    _reload();
  }

  void _reload() => data = ref.read(apiProvider).get<dynamic>(base);
  Future<void> _refresh() async {
    setState(_reload);
    await data;
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        config.title,
        style: const TextStyle(fontWeight: FontWeight.w900),
      ),
      actions: [
        IconButton(
          onPressed: _refresh,
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    floatingActionButton: !canCreate
        ? null
        : FloatingActionButton.extended(
            backgroundColor: config.color,
            foregroundColor: Colors.white,
            onPressed: _create,
            icon: const Icon(Icons.add_rounded),
            label: const Text('New'),
          ),
    body: FutureBuilder<dynamic>(
      future: data,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _Message(
            icon: Icons.cloud_off_rounded,
            title: 'Could not load ${config.title}',
            copy: apiErrorMessage(snapshot.error!),
            onRetry: () => setState(_reload),
          );
        }
        final rows = _rows(snapshot.data);
        final filtered = query.isEmpty
            ? rows
            : rows
                  .where(
                    (row) => row.values.any(
                      (value) => value.toString().toLowerCase().contains(query),
                    ),
                  )
                  .toList();
        return Column(
          children: [
            if (config.searchable && rows.length > 4)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: SearchBar(
                  hintText: 'Search ${config.title.toLowerCase()}',
                  leading: const Icon(Icons.search),
                  onChanged: (value) =>
                      setState(() => query = value.trim().toLowerCase()),
                ),
              ),
            Expanded(
              child: filtered.isEmpty
                  ? _Message(
                      icon: Icons.inbox_outlined,
                      title: query.isEmpty ? 'Nothing here yet' : 'No matches',
                      copy: query.isEmpty
                          ? (config.createFields.isEmpty
                                ? 'No records are available.'
                                : 'Tap New to create the first record.')
                          : 'Try another search.',
                      onRetry: null,
                    )
                  : RefreshIndicator(
                      onRefresh: _refresh,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 14, 20, 96),
                        itemCount: filtered.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (_, index) => _RecordCard(
                          config: config,
                          row: filtered[index],
                          onTap: () => _open(filtered[index]),
                        ),
                      ),
                    ),
            ),
          ],
        );
      },
    ),
  );

  List<Map<String, dynamic>> _rows(dynamic value) {
    dynamic source = value;
    if (value is Map && value['items'] is List) source = value['items'];
    if (source is List) {
      return source
          .map(
            (row) =>
                row is Map ? Map<String, dynamic>.from(row) : {'value': row},
          )
          .toList();
    }
    if (source is Map) return [Map<String, dynamic>.from(source)];
    return source == null
        ? []
        : [
            {'value': source},
          ];
  }

  String? _id(Map<String, dynamic> row) {
    for (final key in config.idKeys) {
      if (row[key] != null) return row[key].toString();
    }
    return null;
  }

  Future<void> _open(Map<String, dynamic> row) async {
    var record = row;
    final id = _id(row);
    if (config.detail && id != null) {
      try {
        final detail = await ref.read(apiProvider).get<dynamic>('$base/$id');
        if (detail is Map) record = Map<String, dynamic>.from(detail);
      } catch (_) {
        /* list data is still useful */
      }
    }
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RecordSheet(
        membership: widget.membership,
        config: config,
        record: record,
        recordId: id,
        base: base,
      ),
    );
    if (mounted) setState(_reload);
  }

  Future<void> _create() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CreateSheet(config: config, base: base),
    );
    if (created == true && mounted) setState(_reload);
  }
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({
    required this.config,
    required this.row,
    required this.onTap,
  });
  final ModuleConfig config;
  final Map<String, dynamic> row;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final heading =
        row['name'] ??
        row['displayName'] ??
        row['saleNumber'] ??
        row['purchaseNumber'] ??
        row['customerName'] ??
        row['title'] ??
        row['code'] ??
        row['productName'] ??
        config.title;
    final subtitles = config.subtitleKeys
        .where((key) => row[key] != null && row[key].toString().isNotEmpty)
        .map((key) => prettyValue(row[key]))
        .take(2)
        .join('  •  ');
    final amount =
        row['totalMinor'] ?? row['amountMinor'] ?? row['balanceMinor'];
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: config.color.withValues(alpha: .13),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(config.icon, color: config.color),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      heading.toString(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 15,
                      ),
                    ),
                    if (subtitles.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          subtitles,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.blueGrey,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (amount is num)
                Text(
                  'QAR ${(amount / 100).toStringAsFixed(2)}',
                  style: TextStyle(
                    color: config.color,
                    fontWeight: FontWeight.w900,
                  ),
                )
              else
                const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecordSheet extends ConsumerStatefulWidget {
  const _RecordSheet({
    required this.config,
    required this.record,
    required this.recordId,
    required this.base,
    required this.membership,
  });
  final ModuleConfig config;
  final Map<String, dynamic> record;
  final String? recordId;
  final String base;
  final Membership membership;
  @override
  ConsumerState<_RecordSheet> createState() => _RecordSheetState();
}

class _RecordSheetState extends ConsumerState<_RecordSheet> {
  bool busy = false;
  String? error;
  @override
  Widget build(BuildContext context) {
    final status = widget.record['status']?.toString();
    final actions = widget.recordId == null
        ? const <RecordAction>[]
        : widget.config.actions
              .where(
                (a) =>
                    (a.permission == null ||
                        widget.membership.hasPermission(a.permission!)) &&
                    (a.allowedStatuses.isEmpty ||
                        a.allowedStatuses.contains(status)) &&
                    a.visibleWhen.entries.every(
                      (condition) =>
                          widget.record[condition.key] == condition.value,
                    ),
              )
              .toList();
    return SafeArea(
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: .72,
        maxChildSize: .94,
        minChildSize: .45,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(22, 4, 22, 28),
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: widget.config.color.withValues(alpha: .13),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Icon(widget.config.icon, color: widget.config.color),
                ),
                const SizedBox(width: 13),
                Expanded(
                  child: Text(
                    recordTitle(widget.record, widget.config.title),
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ...widget.record.entries
                .where((e) => !hiddenValue(e.value))
                .map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 13),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 115,
                          child: Text(
                            prettyLabel(entry.key),
                            style: const TextStyle(
                              color: Colors.blueGrey,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Text(
                            prettyValue(entry.value),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  error!,
                  style: const TextStyle(
                    color: Colors.red,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            if (actions.isNotEmpty) ...[
              const Divider(height: 32),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: actions
                    .map(
                      (action) => FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: action.destructive
                              ? Colors.red.shade50
                              : widget.config.color,
                          foregroundColor: action.destructive
                              ? Colors.red.shade800
                              : Colors.white,
                        ),
                        onPressed: busy ? null : () => _act(action),
                        icon: Icon(action.icon),
                        label: Text(action.label),
                      ),
                    )
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _act(RecordAction action) async {
    if (action.destructive) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(action.label),
          content: const Text('This changes the record immediately. Continue?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep it'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref
          .read(apiProvider)
          .post<dynamic>(
            '${widget.base}/${widget.recordId}/${action.suffix}',
            data: action.body,
          );
      if (mounted) Navigator.pop(context);
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

class _CreateSheet extends ConsumerStatefulWidget {
  const _CreateSheet({required this.config, required this.base});
  final ModuleConfig config;
  final String base;
  @override
  ConsumerState<_CreateSheet> createState() => _CreateSheetState();
}

class _CreateSheetState extends ConsumerState<_CreateSheet> {
  final formKey = GlobalKey<FormState>();
  final values = <String, dynamic>{};
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    for (final f in widget.config.createFields) {
      if (f.initial != null) values[f.key] = f.initial;
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        MediaQuery.viewInsetsOf(context).bottom + 22,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                "New ${widget.config.title.replaceAll(RegExp(r's$'), '')}",
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 18),
              ...widget.config.createFields.map(_field),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    error!,
                    style: const TextStyle(
                      color: Colors.red,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: widget.config.color,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.all(16),
                ),
                onPressed: busy ? null : _submit,
                icon: busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check_rounded),
                label: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  Widget _field(FormFieldSpec field) {
    if (field.kind == FieldKind.toggle) {
      return SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(
          field.label,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        value: values[field.key] as bool? ?? false,
        onChanged: (v) => setState(() => values[field.key] = v),
      );
    }
    if (field.kind == FieldKind.choice) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: DropdownButtonFormField<String>(
          decoration: InputDecoration(labelText: field.label),
          items: field.options
              .map(
                (v) => DropdownMenuItem(value: v, child: Text(v.toUpperCase())),
              )
              .toList(),
          onChanged: (v) => values[field.key] = v,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        decoration: InputDecoration(labelText: field.label),
        keyboardType: field.kind == FieldKind.email
            ? TextInputType.emailAddress
            : field.kind == FieldKind.phone
            ? TextInputType.phone
            : field.kind == FieldKind.money
            ? const TextInputType.numberWithOptions(decimal: true)
            : TextInputType.text,
        validator: (v) => field.required && (v == null || v.trim().isEmpty)
            ? '${field.label} is required'
            : null,
        onSaved: (v) {
          final text = v?.trim() ?? '';
          if (text.isNotEmpty) {
            values[field.key] = field.kind == FieldKind.money
                ? (double.parse(text) * 100).round()
                : text;
          }
        },
      ),
    );
  }

  Future<void> _submit() async {
    if (!formKey.currentState!.validate()) return;
    formKey.currentState!.save();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref.read(apiProvider).post<dynamic>(widget.base, data: values);
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

String recordTitle(Map<String, dynamic> row, String fallback) =>
    (row['name'] ??
            row['displayName'] ??
            row['saleNumber'] ??
            row['purchaseNumber'] ??
            row['customerName'] ??
            row['code'] ??
            fallback)
        .toString();
bool hiddenValue(dynamic value) =>
    value == null || value is Map || value is List;
String prettyLabel(String value) => value
    .replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(1)}')
    .replaceAll('_', ' ')
    .trim()
    .split(' ')
    .map((v) => v.isEmpty ? v : '${v[0].toUpperCase()}${v.substring(1)}')
    .join(' ');
String prettyValue(dynamic value) {
  if (value is bool) return value ? 'Yes' : 'No';
  if (value is String && value.contains('T')) {
    final parsed = DateTime.tryParse(value);
    if (parsed != null) return '${parsed.toLocal()}'.split('.').first;
  }
  return value.toString().replaceAll('_', ' ');
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    required this.copy,
    required this.onRetry,
  });
  final IconData icon;
  final String title;
  final String copy;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52, color: Colors.blueGrey.shade300),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              copy,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.blueGrey),
            ),
            if (onRetry != null)
              Padding(
                padding: const EdgeInsets.only(top: 18),
                child: ElevatedButton(
                  onPressed: onRetry,
                  child: const Text('Try again'),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
