import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/theme.dart';
import 'login_screen.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, this.shopName});

  final String? shopName;

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
    final saved = await _storage.read(key: _languageKey);
    if (mounted && (saved == 'ar' || saved == 'en')) {
      setState(() => language = saved!);
    }
  }

  Future<void> _setLanguage(String value) async {
    if (value == language) return;
    setState(() => language = value);
    await _storage.write(key: _languageKey, value: value);
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
                      const Spacer(),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
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
                                fontSize: constraints.maxWidth > 600 ? 54 : 42,
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
                                color: Colors.white.withValues(alpha: .76),
                                fontSize: 15,
                                height: 1.6,
                              ),
                            ),
                            const SizedBox(height: 24),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                minimumSize: const Size.fromHeight(58),
                                backgroundColor: AllShopsTheme.qatarSand,
                                foregroundColor: AllShopsTheme.qatarMaroon,
                              ),
                              onPressed: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const LoginScreen(),
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
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
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                const Icon(
                                  Icons.verified_user_outlined,
                                  color: Colors.white54,
                                  size: 16,
                                ),
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
                            ),
                          ],
                        ),
                      ),
                    ],
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
