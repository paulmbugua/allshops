import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/theme.dart';
import 'login_screen.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  bool _busy = false;
  bool _hidePassword = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(apiProvider)
          .register(
            name: _name.text,
            email: _email.text,
            password: _password.text,
          );
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ActivationPendingScreen(
            email: _email.text.trim(),
            emailSent: result['emailDelivery'] == 'SENT',
          ),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'sw';
    String copy(String en, String sw) => isArabic ? sw : en;
    return Scaffold(
      appBar: AppBar(title: Text(copy('Create account', 'Fungua akaunti'))),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 30),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _RegistrationMark(),
                    const SizedBox(height: 22),
                    Text(
                      copy(
                        'Build your POS + ERP workspace',
                        'Jenga mfumo wako wa POS + ERP',
                      ),
                      style: const TextStyle(
                        fontSize: 34,
                        height: 1.04,
                        letterSpacing: -1.2,
                        fontWeight: FontWeight.w900,
                        color: AllShopsTheme.ink,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      copy(
                        'One secure account for your branches, staff and daily operations.',
                        'Akaunti moja salama kwa matawi, wafanyakazi na shughuli zako zote.',
                      ),
                      style: TextStyle(
                        color: Colors.blueGrey.shade600,
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 26),
                    TextFormField(
                      controller: _name,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.name],
                      decoration: InputDecoration(
                        labelText: copy('Full name', 'Jina kamili'),
                        prefixIcon: const Icon(Icons.person_outline_rounded),
                      ),
                      validator: (value) => (value?.trim().length ?? 0) < 2
                          ? copy(
                              'Enter your full name.',
                              'Weka jina lako kamili.',
                            )
                          : null,
                    ),
                    const SizedBox(height: 13),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(
                        labelText: copy('Work email', 'Barua pepe ya biashara'),
                        prefixIcon: const Icon(Icons.alternate_email_rounded),
                      ),
                      validator: (value) {
                        final email = value?.trim() ?? '';
                        return !RegExp(
                              r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
                            ).hasMatch(email)
                            ? copy(
                                'Enter a valid email.',
                                'Weka barua pepe sahihi.',
                              )
                            : null;
                      },
                    ),
                    const SizedBox(height: 13),
                    TextFormField(
                      controller: _password,
                      obscureText: _hidePassword,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.newPassword],
                      decoration: InputDecoration(
                        labelText: copy('Password', 'Nenosiri'),
                        prefixIcon: const Icon(Icons.lock_outline_rounded),
                        suffixIcon: IconButton(
                          tooltip: copy(
                            'Show or hide password',
                            'Onyesha au ficha nenosiri',
                          ),
                          onPressed: () =>
                              setState(() => _hidePassword = !_hidePassword),
                          icon: Icon(
                            _hidePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (value) => (value?.length ?? 0) < 8
                          ? copy(
                              'Use at least 8 characters.',
                              'Tumia angalau herufi 8.',
                            )
                          : null,
                    ),
                    const SizedBox(height: 13),
                    TextFormField(
                      controller: _confirmation,
                      obscureText: _hidePassword,
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _busy ? null : _submit(),
                      decoration: InputDecoration(
                        labelText: copy(
                          'Confirm password',
                          'Thibitisha nenosiri',
                        ),
                        prefixIcon: const Icon(Icons.verified_user_outlined),
                      ),
                      validator: (value) => value != _password.text
                          ? copy(
                              'Passwords do not match.',
                              'Manenosiri hayalingani.',
                            )
                          : null,
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      _InlineError(message: _error!),
                    ],
                    const SizedBox(height: 22),
                    ElevatedButton.icon(
                      onPressed: _busy ? null : _submit,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.arrow_forward_rounded),
                      label: Text(
                        _busy
                            ? copy('Creating account…', 'Inafungua akaunti…')
                            : copy(
                                'Create secure account',
                                'Fungua akaunti salama',
                              ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      copy(
                        'We will email a secure activation link. Business setup stays locked until your email is verified.',
                        'Tutakutumia kiungo salama cha kuwezesha akaunti. Usanidi wa biashara utafunguliwa baada ya kuthibitisha barua pepe.',
                      ),
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.blueGrey.shade600,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextButton(
                      onPressed: () => Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => const LoginScreen()),
                      ),
                      child: Text(
                        copy(
                          'Already registered? Sign in',
                          'Tayari una akaunti? Ingia',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ActivationPendingScreen extends ConsumerStatefulWidget {
  const ActivationPendingScreen({
    super.key,
    required this.email,
    required this.emailSent,
  });

  final String email;
  final bool emailSent;

  @override
  ConsumerState<ActivationPendingScreen> createState() =>
      _ActivationPendingScreenState();
}

class _ActivationPendingScreenState
    extends ConsumerState<ActivationPendingScreen> {
  bool _sending = false;
  bool _sentAgain = false;
  String? _error;

  Future<void> _resend() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(apiProvider).resendActivation(widget.email);
      if (mounted) setState(() => _sentAgain = true);
    } catch (error) {
      if (mounted) setState(() => _error = apiErrorMessage(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'sw';
    String copy(String en, String arabic) => ar ? arabic : en;
    final delivered = widget.emailSent || _sentAgain;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 82,
                    height: 82,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: Color(0xFFE5F6EE),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.mark_email_read_outlined,
                      size: 40,
                      color: Color(0xFF087A4D),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    copy('Check your inbox', 'Angalia barua pepe yako'),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                      color: AllShopsTheme.ink,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    delivered
                        ? copy(
                            'We sent a secure activation link to\n${widget.email}',
                            'Tumetuma kiungo salama cha uanzishaji kwa\n${widget.email}',
                          )
                        : copy(
                            'Your account was created, but the activation email could not be delivered. Please resend it.',
                            'Akaunti imefunguliwa, lakini ujumbe wa uanzishaji haukutumwa. Tafadhali utume tena.',
                          ),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.blueGrey.shade600,
                      fontSize: 15,
                      height: 1.5,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    _InlineError(message: _error!),
                  ],
                  const SizedBox(height: 26),
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).pushReplacement(
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    ),
                    child: Text(
                      copy('I have activated — sign in', 'Imewashwa — ingia'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _sending ? null : _resend,
                    icon: _sending
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.refresh_rounded),
                    label: Text(
                      copy(
                        _sentAgain
                            ? 'Activation email resent'
                            : 'Resend activation email',
                        _sentAgain
                            ? 'Ujumbe wa uanzishaji umetumwa tena'
                            : 'Tuma ujumbe wa uanzishaji tena',
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    copy(
                      'For your security, shop creation becomes available only after email verification.',
                      'Kwa usalama wako, usanidi wa biashara unapatikana baada ya kuthibitisha barua pepe.',
                    ),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.blueGrey.shade500,
                      fontSize: 12,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RegistrationMark extends StatelessWidget {
  const _RegistrationMark();
  @override
  Widget build(BuildContext context) => Align(
    alignment: AlignmentDirectional.centerStart,
    child: Container(
      width: 62,
      height: 62,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AllShopsTheme.qatarMaroon,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Text(
        '✦',
        style: TextStyle(color: Colors.white, fontSize: 28),
      ),
    ),
  );
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Text(
      message,
      style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer),
    ),
  );
}
