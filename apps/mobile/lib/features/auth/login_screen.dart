import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app.dart';
import '../../core/api_client.dart';
import '../../core/models.dart';
import '../home/home_screen.dart';
import 'forgot_password_screen.dart';
import 'register_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  bool resending = false;
  bool activationRequired = false;
  bool activationSent = false;
  String? error;
  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
      activationRequired = false;
      activationSent = false;
    });
    try {
      final body = await ref.read(apiProvider).login(email.text, password.text);
      final user = CurrentUser.fromJson(body['user'] as Map<String, dynamic>);
      if (!mounted) return;
      if (user.memberships.isEmpty) {
        throw Exception('No active business membership is available.');
      }
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) =>
              HomeScreen(user: user, membership: user.memberships.first),
        ),
      );
    } catch (value) {
      if (!mounted) return;
      final needsActivation = apiErrorCode(value) == 'EMAIL_NOT_VERIFIED';
      setState(() {
        activationRequired = needsActivation;
        error = needsActivation ? null : apiErrorMessage(value);
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resendActivation() async {
    final address = email.text.trim();
    if (address.isEmpty) {
      setState(() {
        activationRequired = false;
        error = tr(
          context,
          'Enter your email address first.',
          'أدخل بريدك الإلكتروني أولاً.',
        );
      });
      return;
    }
    setState(() {
      resending = true;
      activationSent = false;
      error = null;
    });
    try {
      await ref.read(apiProvider).resendActivation(address);
      if (mounted) setState(() => activationSent = true);
    } catch (value) {
      if (mounted) setState(() => error = apiErrorMessage(value));
    } finally {
      if (mounted) setState(() => resending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    '✦',
                    style: TextStyle(color: Colors.white, fontSize: 30),
                  ),
                ),
                const SizedBox(height: 28),
                Text(
                  tr(context, 'Welcome back', 'مرحباً بعودتك'),
                  style: const TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1.8,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  tr(
                    context,
                    'Sign in to open your AllShops workspace.',
                    'سجّل الدخول لفتح مساحة عمل AllShops.',
                  ),
                  style: TextStyle(
                    color: Colors.blueGrey.shade500,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(
                    labelText: tr(
                      context,
                      'Email address',
                      'البريد الإلكتروني',
                    ),
                    prefixIcon: const Icon(Icons.alternate_email_rounded),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  onSubmitted: (_) => submit(),
                  decoration: InputDecoration(
                    labelText: tr(context, 'Password', 'كلمة المرور'),
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ForgotPasswordScreen(),
                      ),
                    ),
                    child: Text(
                      tr(context, 'Forgot password?', 'هل نسيت كلمة المرور؟'),
                    ),
                  ),
                ),
                if (activationRequired)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: _SignInNotice(
                      icon: activationSent
                          ? Icons.mark_email_read_outlined
                          : Icons.mail_lock_outlined,
                      title: activationSent
                          ? tr(
                              context,
                              'Activation email sent',
                              'تم إرسال رسالة التفعيل',
                            )
                          : tr(context, 'Activate your account', 'فعّل حسابك'),
                      message: activationSent
                          ? tr(
                              context,
                              'Check your inbox and spam folder, open the secure activation link, then return here to sign in.',
                              'تحقق من بريدك الوارد ومجلد الرسائل غير المرغوب فيها، وافتح رابط التفعيل الآمن، ثم عد لتسجيل الدخول.',
                            )
                          : tr(
                              context,
                              'Before signing in, open the secure activation link we sent to your email.',
                              'قبل تسجيل الدخول، افتح رابط التفعيل الآمن الذي أرسلناه إلى بريدك الإلكتروني.',
                            ),
                      actionLabel: resending
                          ? tr(context, 'Sending…', 'جارٍ الإرسال…')
                          : tr(
                              context,
                              'Resend activation email',
                              'إعادة إرسال رسالة التفعيل',
                            ),
                      onAction: resending ? null : resendActivation,
                    ),
                  ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: _SignInNotice(
                      icon: Icons.error_outline_rounded,
                      title: tr(
                        context,
                        'Unable to sign in',
                        'تعذر تسجيل الدخول',
                      ),
                      message: error!,
                    ),
                  ),
                const SizedBox(height: 22),
                ElevatedButton(
                  onPressed: busy ? null : submit,
                  child: Text(
                    busy
                        ? tr(context, 'Signing in…', 'جارٍ تسجيل الدخول…')
                        : tr(context, 'Sign in securely', 'تسجيل دخول آمن'),
                  ),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: busy
                      ? null
                      : () => Navigator.of(context).pushReplacement(
                          MaterialPageRoute(
                            builder: (_) => const RegisterScreen(),
                          ),
                        ),
                  child: Text(
                    tr(
                      context,
                      'New business? Create account',
                      'نشاط جديد؟ أنشئ حساباً',
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  tr(
                    context,
                    'Your access follows the same roles, branch restrictions and subscription controls as AllShops Web.',
                    'تتبع صلاحياتك الأدوار وقيود الفروع وضوابط الاشتراك نفسها في الويب.',
                  ),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.blueGrey, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _SignInNotice extends StatelessWidget {
  const _SignInNotice({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF2E2),
      border: Border.all(color: const Color(0xFFE8C98F)),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: Color(0xFFFFE1AA),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: const Color(0xFF7A3E00), size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Color(0xFF4B2800),
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                message,
                style: const TextStyle(
                  color: Color(0xFF654418),
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
              if (actionLabel != null) ...[
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: onAction,
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    foregroundColor: const Color(0xFF7C123D),
                  ),
                  icon: const Icon(Icons.outgoing_mail, size: 18),
                  label: Text(actionLabel!),
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}
