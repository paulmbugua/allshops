import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';

class BusinessDetailsScreen extends ConsumerStatefulWidget {
  const BusinessDetailsScreen({super.key, required this.membership});

  final Membership membership;

  @override
  ConsumerState<BusinessDetailsScreen> createState() =>
      _BusinessDetailsScreenState();
}

class _BusinessDetailsScreenState extends ConsumerState<BusinessDetailsScreen> {
  final formKey = GlobalKey<FormState>();
  final name = TextEditingController();
  final arabicName = TextEditingController();
  final phone = TextEditingController();
  final email = TextEditingController();
  final tagline = TextEditingController();
  Map<String, dynamic>? business;
  bool loading = true;
  bool saving = false;
  String? message;

  bool get canUpdate => widget.membership.hasPermission('organization.update');

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    name.dispose();
    arabicName.dispose();
    phone.dispose();
    email.dispose();
    tagline.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await ref
          .read(apiProvider)
          .get<Map<String, dynamic>>(
            '/organizations/${widget.membership.organizationId}',
          );
      if (!mounted) return;
      business = result;
      name.text = result['name']?.toString() ?? '';
      arabicName.text = result['arabicName']?.toString() ?? '';
      phone.text = result['phone']?.toString() ?? '';
      email.text = result['email']?.toString() ?? '';
      tagline.text = result['tagline']?.toString() ?? '';
    } catch (error) {
      message = apiErrorMessage(error);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _save() async {
    if (!canUpdate || !formKey.currentState!.validate()) return;
    setState(() {
      saving = true;
      message = null;
    });
    try {
      business = await ref
          .read(apiProvider)
          .patch<Map<String, dynamic>>(
            '/organizations/${widget.membership.organizationId}',
            data: {
              'name': name.text.trim(),
              'arabicName': arabicName.text.trim().isEmpty
                  ? null
                  : arabicName.text.trim(),
              'phone': phone.text.trim().isEmpty ? null : phone.text.trim(),
              'email': email.text.trim().isEmpty ? null : email.text.trim(),
              'tagline': tagline.text.trim().isEmpty
                  ? null
                  : tagline.text.trim(),
            },
          );
      if (!mounted) return;
      message = tr(
        context,
        'Business details saved.',
        'Maelezo ya biashara yamehifadhiwa.',
      );
    } catch (error) {
      message = apiErrorMessage(error);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final language = AppLanguageScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(tr(context, 'Business details', 'Maelezo ya biashara')),
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
                children: [
                  Container(
                    padding: const EdgeInsets.all(22),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF6D1738), Color(0xFF172C2B)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(26),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.storefront_rounded,
                          color: Color(0xFFFFCF5C),
                          size: 34,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          widget.membership.organizationName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 25,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          tr(
                            context,
                            'Identity, contact details and display language.',
                            'Utambulisho, mawasiliano na lugha ya mfumo.',
                          ),
                          style: const TextStyle(color: Color(0xFFE8D8C4)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tr(
                              context,
                              'Display language',
                              'Lugha ya kuonyesha',
                            ),
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            tr(
                              context,
                              'This choice applies instantly across the app and is kept after sign out.',
                              'Chaguo hili linatumika mara moja kote na kuhifadhiwa baada ya kuondoka.',
                            ),
                            style: const TextStyle(color: Colors.blueGrey),
                          ),
                          const SizedBox(height: 14),
                          SegmentedButton<String>(
                            segments: const [
                              ButtonSegment(
                                value: 'en',
                                icon: Icon(Icons.language_rounded),
                                label: Text('English'),
                              ),
                              ButtonSegment(
                                value: 'sw',
                                icon: Icon(Icons.translate_rounded),
                                label: Text('Kiswahili'),
                              ),
                            ],
                            selected: {language.language},
                            onSelectionChanged: (selection) =>
                                language.setLanguage(selection.first),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Form(
                        key: formKey,
                        child: Column(
                          children: [
                            _field(
                              name,
                              tr(context, 'Business name', 'Jina la biashara'),
                              required: true,
                            ),
                            _field(
                              arabicName,
                              tr(
                                context,
                                'Local / Kiswahili name',
                                'Jina la Kiswahili',
                              ),
                            ),
                            _field(
                              phone,
                              tr(context, 'Phone', 'Simu'),
                              keyboardType: TextInputType.phone,
                            ),
                            _field(
                              email,
                              tr(context, 'Email', 'Barua pepe'),
                              keyboardType: TextInputType.emailAddress,
                            ),
                            _field(
                              tagline,
                              tr(context, 'Tagline', 'Kauli mbiu'),
                            ),
                            if (message != null) ...[
                              const SizedBox(height: 4),
                              Text(message!),
                            ],
                            if (canUpdate) ...[
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: saving ? null : _save,
                                  icon: saving
                                      ? const SizedBox.square(
                                          dimension: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Icon(Icons.check_rounded),
                                  label: Text(
                                    tr(
                                      context,
                                      saving ? 'Saving…' : 'Save changes',
                                      saving
                                          ? 'Inahifadhi…'
                                          : 'Hifadhi mabadiliko',
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    bool required = false,
    TextInputType? keyboardType,
    TextDirection? textDirection,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextFormField(
      controller: controller,
      enabled: canUpdate,
      keyboardType: keyboardType,
      textDirection: textDirection,
      decoration: InputDecoration(labelText: label),
      validator: required
          ? (value) => value == null || value.trim().isEmpty
                ? tr(context, 'Required', 'Inahitajika')
                : null
          : null,
    ),
  );
}
