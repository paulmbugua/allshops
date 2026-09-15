import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key, required this.membership});
  final Membership membership;

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  Map<String, dynamic>? _data;
  String _query = '';
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final value = await ref.read(apiProvider).get<Map<String, dynamic>>(
        '/organizations/${widget.membership.organizationId}/support/diagnostics',
      );
      if (mounted) setState(() => _data = value);
    } catch (error) {
      if (mounted) setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = _data?['supportProfile'] is Map
        ? Map<String, dynamic>.from(_data!['supportProfile'] as Map)
        : const <String, dynamic>{};
    final allFaqs = (profile['faqs'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final term = _query.trim().toLowerCase();
    final faqs = allFaqs.where((faq) => term.isEmpty || '${faq['category']} ${faq['question']} ${faq['answer']}'.toLowerCase().contains(term)).toList();
    final categories = <String, List<Map<String, dynamic>>>{};
    for (final faq in faqs) {
      categories.putIfAbsent(faq['category']?.toString() ?? 'Help', () => []).add(faq);
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Help & diagnostics'),
        actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: _loading && _data == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(18),
                children: [
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF173B34), Color(0xFF2A6658)]),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('ALLSHOPS SUPPORT CENTRE', style: TextStyle(color: Color(0xFFFFCF5C), fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                      const SizedBox(height: 8),
                      const Text('Answers for your workspace', style: TextStyle(color: Colors.white, fontSize: 25, fontWeight: FontWeight.w900)),
                      const SizedBox(height: 6),
                      Text('Guidance for ${_pretty(profile['roleCode']?.toString() ?? widget.membership.role)} on web and mobile.', style: const TextStyle(color: Color(0xFFBDD4CD), height: 1.4)),
                    ]),
                  ),
                  if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: _Notice(_error!)),
                  const SizedBox(height: 14),
                  _DiagnosticCards(data: _data),
                  const SizedBox(height: 18),
                  TextField(
                    onChanged: (value) => setState(() => _query = value),
                    decoration: InputDecoration(
                      hintText: 'Search POS, stock, offline, billing…',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _query.isEmpty ? null : IconButton(onPressed: () => setState(() => _query = ''), icon: const Icon(Icons.close_rounded)),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ...categories.entries.expand((entry) => [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 10, 4, 6),
                      child: Text(entry.key.toUpperCase(), style: const TextStyle(color: Color(0xFF2B7F63), fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.1)),
                    ),
                    ...entry.value.map((faq) => Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: ExpansionTile(
                        title: Text(faq['question']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        expandedCrossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(faq['answer']?.toString() ?? '', style: const TextStyle(color: Colors.blueGrey, height: 1.55)),
                          const SizedBox(height: 8),
                          Text((faq['platforms'] as List<dynamic>? ?? const []).join(' · '), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.blueGrey)),
                        ],
                      ),
                    )),
                  ]),
                  if (faqs.isEmpty) const _Notice('No answers match that search.'),
                  const SizedBox(height: 18),
                  const Card(child: ListTile(
                    leading: CircleAvatar(backgroundColor: Color(0xFFFFE4DA), child: Icon(Icons.shield_outlined, color: Color(0xFFF35F45))),
                    title: Text('Contact support safely', style: TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: Text('Share the time, screen, branch, device and request or local reference. Never share passwords or card details.'),
                  )),
                ],
              ),
            ),
    );
  }
}

class _DiagnosticCards extends StatelessWidget {
  const _DiagnosticCards({required this.data});
  final Map<String, dynamic>? data;
  @override
  Widget build(BuildContext context) {
    final devices = (data?['devices'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().toList();
    final conflicts = data?['pendingSyncConflicts'] ?? 0;
    final organization = data?['organization'] is Map ? Map<String, dynamic>.from(data!['organization'] as Map) : const <String, dynamic>{};
    final subscription = organization['subscription'] is Map ? Map<String, dynamic>.from(organization['subscription'] as Map) : const <String, dynamic>{};
    return Row(children: [
      Expanded(child: _DiagnosticCard(icon: Icons.verified_outlined, label: 'Subscription', value: subscription['status']?.toString() ?? 'Not configured', color: const Color(0xFF2B9A6D))),
      const SizedBox(width: 9),
      Expanded(child: _DiagnosticCard(icon: Icons.devices_other_rounded, label: 'Active devices', value: '${devices.where((item) => item['status'] == 'ACTIVE').length}', color: const Color(0xFF4979C7))),
      const SizedBox(width: 9),
      Expanded(child: _DiagnosticCard(icon: conflicts == 0 ? Icons.sync_rounded : Icons.warning_amber_rounded, label: 'Conflicts', value: '$conflicts', color: conflicts == 0 ? const Color(0xFF2B9A6D) : const Color(0xFFE59D24))),
    ]);
  }
}

class _DiagnosticCard extends StatelessWidget {
  const _DiagnosticCard({required this.icon, required this.label, required this.value, required this.color});
  final IconData icon; final String label; final String value; final Color color;
  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(minHeight: 112),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: color.withValues(alpha: .1), borderRadius: BorderRadius.circular(18)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, color: color), const Spacer(), Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)), Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 9, color: Colors.blueGrey))]),
  );
}

class _Notice extends StatelessWidget {
  const _Notice(this.message); final String message;
  @override
  Widget build(BuildContext context) => Container(padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: const Color(0xFFFFF0D8), borderRadius: BorderRadius.circular(14)), child: Text(message));
}

String _pretty(String value) => value.toLowerCase().replaceAll('_', ' ');
