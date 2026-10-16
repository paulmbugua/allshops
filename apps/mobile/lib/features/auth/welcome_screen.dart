import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme.dart';
import '../../app.dart';
import 'login_screen.dart';
import 'register_screen.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({
    super.key,
    this.shopName,
    this.startupUnavailable = false,
    this.startupTimedOut = false,
    this.onRetryStartup,
  });

  final String? shopName;
  final bool startupUnavailable;
  final bool startupTimedOut;
  final VoidCallback? onRetryStartup;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  static const _storage = FlutterSecureStorage();
  static const _languageKey = 'allshops_display_language';
  String language = 'en';

  bool get isArabic => language == 'ar';

  @override
  void initState() {
    super.initState();
    _restoreLanguage();
  }

  Future<void> _restoreLanguage() async {
    String? saved;
    try {
      saved = await _storage
          .read(key: _languageKey)
          .timeout(const Duration(seconds: 2));
    } on Object {
      // Language restoration is optional and must never block the welcome UI.
    }
    if (mounted && (saved == 'ar' || saved == 'en')) {
      setState(() => language = saved!);
    }
  }

  Future<void> _setLanguage(String value) async {
    if (value == language) return;
    setState(() => language = value);
    AppLanguageScope.of(context).setLanguage(value);
    try {
      await _storage
          .write(key: _languageKey, value: value)
          .timeout(const Duration(seconds: 2));
    } on Object {
      // Keep the in-memory selection when protected storage is unavailable.
    }
  }

  @override
  Widget build(BuildContext context) => Localizations.override(
    context: context,
    locale: Locale(language),
    child: Directionality(
      textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        backgroundColor: AllShopsTheme.qatarMaroon,
        body: Stack(
          fit: StackFit.expand,
          children: [
            Image.asset(
              'assets/culture/qatar-shop-welcome.webp',
              fit: BoxFit.cover,
              alignment: isArabic ? Alignment.topLeft : Alignment.topCenter,
              filterQuality: FilterQuality.high,
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0, .42, .72, 1],
                  colors: [
                    Color(0x19000000),
                    Color(0x26000000),
                    Color(0xD9150E11),
                    Color(0xFF150E11),
                  ],
                ),
              ),
            ),
            SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) => Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 700),
                    curve: Curves.easeOutCubic,
                    builder: (context, value, child) => Opacity(
                      opacity: value,
                      child: Transform.translate(
                        offset: Offset(0, 18 * (1 - value)),
                        child: child,
                      ),
                    ),
                    child: SingleChildScrollView(
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: constraints.maxHeight - 44,
                        ),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: _Brand(
                                      shopName: widget.shopName,
                                      isArabic: isArabic,
                                    ),
                                  ),
                                  _LanguageToggle(
                                    language: language,
                                    onChanged: _setLanguage,
                                  ),
                                ],
                              ),
                              SizedBox(
                                height: constraints.maxHeight > 700 ? 72 : 24,
                              ),
                              ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 520,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _QatarWelcomeBadge(isArabic: isArabic),
                                    const SizedBox(height: 18),
                                    Text(
                                      widget.shopName == null
                                          ? isArabic
                                                ? 'أعمال عصرية،\nبروح قطر.'
                                                : 'Modern business,\nrooted in Qatar.'
                                          : isArabic
                                          ? 'مرحباً بكم في\n${widget.shopName}.'
                                          : 'Welcome to\n${widget.shopName}.',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: constraints.maxWidth > 600
                                            ? 54
                                            : 42,
                                        height: isArabic ? 1.12 : .98,
                                        letterSpacing: isArabic ? -.5 : -1.8,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    Text(
                                      isArabic
                                          ? 'مساحة عمل جميلة وبسيطة لكل من يخدم ويبيع ويساهم في نمو قطر كل يوم.'
                                          : 'A beautifully simple workspace for the people who serve, sell and grow Qatar every day.',
                                      style: TextStyle(
                                        color: Colors.white.withValues(
                                          alpha: .76,
                                        ),
                                        fontSize: 15,
                                        height: 1.6,
                                      ),
                                    ),
                                    const SizedBox(height: 24),
                                    if (widget.startupUnavailable) ...[
                                      _StartupNotice(
                                        isArabic: isArabic,
                                        timedOut: widget.startupTimedOut,
                                        onRetry: widget.onRetryStartup,
                                      ),
                                      const SizedBox(height: 14),
                                    ],
                                    FilledButton(
                                      style: FilledButton.styleFrom(
                                        minimumSize: const Size.fromHeight(58),
                                        backgroundColor:
                                            AllShopsTheme.qatarSand,
                                        foregroundColor:
                                            AllShopsTheme.qatarMaroon,
                                      ),
                                      onPressed: () =>
                                          Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (_) =>
                                                  const LoginScreen(),
                                            ),
                                          ),
                                      child: Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          Text(
                                            isArabic
                                                ? 'دخول الموظفين'
                                                : 'Staff sign in',
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Icon(
                                            isArabic
                                                ? Icons.arrow_back_rounded
                                                : Icons.arrow_forward_rounded,
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    _OwnerWelcomeCard(
                                      isArabic: isArabic,
                                      onCreateAccount: () =>
                                          Navigator.of(context).push(
                                            MaterialPageRoute(
                                              builder: (_) =>
                                                  const RegisterScreen(),
                                            ),
                                          ),
                                    ),
                                    const SizedBox(height: 14),
                                    _TrustLine(isArabic: isArabic),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 22),
                              _QatarFooterMotif(isArabic: isArabic),
                            ],
                          ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _OwnerWelcomeCard extends StatelessWidget {
  const _OwnerWelcomeCard({
    required this.isArabic,
    required this.onCreateAccount,
  });

  final bool isArabic;
  final VoidCallback onCreateAccount;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(16, 15, 14, 14),
    decoration: BoxDecoration(
      color: const Color(0xD96D1738),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: const Color(0x66F3DFC1)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x42000000),
          blurRadius: 24,
          offset: Offset(0, 12),
        ),
      ],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: AllShopsTheme.qatarSand,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.storefront_rounded,
                color: AllShopsTheme.qatarMaroon,
                size: 20,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isArabic
                        ? 'هل أنت مالك نشاط جديد؟'
                        : 'Opening a new business?',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    isArabic
                        ? 'أنشئ حسابك وأطلق أول فرع بخطوات بسيطة.'
                        : 'Create your account and launch your first branch in a few guided steps.',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 13),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            backgroundColor: Colors.white,
            foregroundColor: AllShopsTheme.qatarMaroon,
            side: BorderSide.none,
          ),
          onPressed: onCreateAccount,
          icon: const Icon(Icons.add_business_rounded, size: 19),
          label: Text(
            isArabic ? 'إنشاء حساب أعمال' : 'Create business account',
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
      ],
    ),
  );
}

class _TrustLine extends StatelessWidget {
  const _TrustLine({required this.isArabic});
  final bool isArabic;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      const Icon(Icons.verified_user_outlined, color: Colors.white54, size: 16),
      const SizedBox(width: 7),
      Flexible(
        child: Text(
          isArabic
              ? 'آمن • بالريال القطري • لكل فروعك'
              : 'Secure • QAR-ready • Built for every branch',
          style: const TextStyle(
            color: Colors.white54,
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    ],
  );
}

class _QatarFooterMotif extends StatelessWidget {
  const _QatarFooterMotif({required this.isArabic});

  final bool isArabic;

  @override
  Widget build(BuildContext context) => Semantics(
    label: isArabic
        ? 'صُمم في قطر للأعمال الطموحة'
        : 'Designed in Qatar for ambitious businesses',
    child: SizedBox(
      height: 92,
      width: double.infinity,
      child: Stack(
        alignment: Alignment.bottomCenter,
        children: [
          const Positioned.fill(
            child: CustomPaint(painter: _DohaSkylinePainter()),
          ),
          Positioned(
            bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0x99150E11),
                border: Border.all(color: Colors.white12),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                isArabic
                    ? 'صُمم في قطر • لينمو معك'
                    : 'DESIGNED IN QATAR • BUILT TO GROW',
                style: TextStyle(
                  color: AllShopsTheme.qatarSand.withValues(alpha: .78),
                  fontSize: 8,
                  letterSpacing: isArabic ? .1 : 1.15,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _DohaSkylinePainter extends CustomPainter {
  const _DohaSkylinePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final glow = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          AllShopsTheme.qatarSand.withValues(alpha: .03),
          AllShopsTheme.qatarSand.withValues(alpha: .15),
        ],
      ).createShader(Offset.zero & size);
    final line = Paint()
      ..color = AllShopsTheme.qatarSand.withValues(alpha: .22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.1;
    final path = Path()
      ..moveTo(0, size.height)
      ..lineTo(0, size.height * .72)
      ..lineTo(size.width * .08, size.height * .72)
      ..lineTo(size.width * .08, size.height * .47)
      ..quadraticBezierTo(
        size.width * .12,
        size.height * .32,
        size.width * .16,
        size.height * .47,
      )
      ..lineTo(size.width * .16, size.height * .72)
      ..lineTo(size.width * .28, size.height * .72)
      ..lineTo(size.width * .31, size.height * .28)
      ..lineTo(size.width * .35, size.height * .18)
      ..lineTo(size.width * .39, size.height * .72)
      ..lineTo(size.width * .51, size.height * .72)
      ..lineTo(size.width * .53, size.height * .40)
      ..lineTo(size.width * .59, size.height * .34)
      ..lineTo(size.width * .62, size.height * .72)
      ..lineTo(size.width * .72, size.height * .72)
      ..lineTo(size.width * .74, size.height * .22)
      ..quadraticBezierTo(
        size.width * .78,
        size.height * .06,
        size.width * .81,
        size.height * .22,
      )
      ..lineTo(size.width * .83, size.height * .72)
      ..lineTo(size.width * .93, size.height * .72)
      ..lineTo(size.width * .93, size.height * .52)
      ..lineTo(size.width, size.height * .52)
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(path, glow);
    canvas.drawPath(path, line);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _StartupNotice extends StatelessWidget {
  const _StartupNotice({
    required this.isArabic,
    required this.timedOut,
    required this.onRetry,
  });

  final bool isArabic;
  final bool timedOut;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
    decoration: BoxDecoration(
      color: const Color(0xE6FFF8E7),
      border: Border.all(color: AllShopsTheme.qatarSand),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Row(
      children: [
        const Icon(
          Icons.cloud_off_rounded,
          color: AllShopsTheme.qatarMaroon,
          size: 22,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            isArabic
                ? timedOut
                      ? 'استغرقت استعادة الجلسة وقتاً طويلاً. يمكنك تسجيل الدخول أو المحاولة مرة أخرى.'
                      : 'تعذر الوصول إلى الخدمة. يمكنك المتابعة إلى تسجيل الدخول أو المحاولة مرة أخرى.'
                : timedOut
                ? 'Session recovery took too long. You can sign in or try again.'
                : 'The service is temporarily unreachable. You can sign in or try again.',
            style: const TextStyle(
              color: AllShopsTheme.qatarMaroon,
              fontSize: 12,
              height: 1.35,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        if (onRetry != null)
          TextButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: Text(isArabic ? 'إعادة' : 'Retry'),
          ),
      ],
    ),
  );
}

class _LanguageToggle extends StatelessWidget {
  const _LanguageToggle({required this.language, required this.onChanged});
  final String language;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Directionality(
    textDirection: TextDirection.ltr,
    child: Semantics(
      label: language == 'ar' ? 'اختيار اللغة' : 'Choose language',
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: .24),
          border: Border.all(color: Colors.white24),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _LanguageChoice(
              label: 'EN',
              selected: language == 'en',
              onTap: () => onChanged('en'),
            ),
            _LanguageChoice(
              label: 'عربي',
              selected: language == 'ar',
              onTap: () => onChanged('ar'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _LanguageChoice extends StatelessWidget {
  const _LanguageChoice({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AllShopsTheme.qatarSand : Colors.transparent,
          borderRadius: BorderRadius.circular(99),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AllShopsTheme.qatarMaroon : Colors.white70,
            fontSize: 11,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
    ),
  );
}

class _Brand extends StatelessWidget {
  const _Brand({this.shopName, required this.isArabic});
  final String? shopName;
  final bool isArabic;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 46,
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(15),
          boxShadow: const [
            BoxShadow(
              color: Colors.black26,
              blurRadius: 24,
              offset: Offset(0, 8),
            ),
          ],
        ),
        child: const Text(
          '✦',
          style: TextStyle(
            color: AllShopsTheme.qatarMaroon,
            fontSize: 23,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      const SizedBox(width: 12),
      Flexible(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              shopName ?? 'AllShops',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
            Text(
              isArabic ? 'نقطة بيع • قطر' : 'POINT OF SALE • QATAR',
              style: TextStyle(
                color: Colors.white60,
                fontSize: 8,
                letterSpacing: isArabic ? .2 : 1.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

class _QatarWelcomeBadge extends StatelessWidget {
  const _QatarWelcomeBadge({required this.isArabic});
  final bool isArabic;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .12),
      border: Border.all(color: Colors.white24),
      borderRadius: BorderRadius.circular(99),
    ),
    child: Text(
      isArabic ? 'أهلاً وسهلاً  •  مرحباً' : 'أهلاً وسهلاً  •  WELCOME',
      style: TextStyle(
        color: AllShopsTheme.qatarSand,
        fontSize: 11,
        letterSpacing: isArabic ? .2 : 1.1,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}
