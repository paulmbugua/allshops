import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

abstract final class AllShopsTheme {
  static const coral = Color(0xFFDC4C4C);
  static const ink = Color(0xFF173650);
  static const mint = Color(0xFF4C9DE3);
  static const sun = Color(0xFF94A3B8);
  static const kenyaGreen = Color(0xFF0F6FC6);
  static const kenyaGold = Color(0xFF64748B);
  // Compatibility aliases move every legacy branded control onto blue/grey.
  static const qatarMaroon = kenyaGreen;
  static const qatarSand = kenyaGold;
  static const canvas = Color(0xFFF1F4F7);
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: kenyaGreen,
      primary: kenyaGreen,
      secondary: mint,
      surface: Colors.white,
      onPrimary: Colors.white,
      onSecondary: const Color(0xFF071E33),
      onSurface: ink,
      error: const Color(0xFFB42318),
      onError: Colors.white,
    ),
    textTheme: ThemeData.light().textTheme.apply(
      bodyColor: ink,
      displayColor: ink,
    ),
    scaffoldBackgroundColor: canvas,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: <TargetPlatform, PageTransitionsBuilder>{
        TargetPlatform.android: FadeUpwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: canvas,
      elevation: 0,
      foregroundColor: ink,
    ),
    cardTheme: CardThemeData(
      elevation: 1,
      shadowColor: kenyaGreen.withValues(alpha: .12),
      color: Colors.white,
      margin: EdgeInsets.zero,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(22)),
        side: BorderSide(color: Color(0x243B5B75)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      labelStyle: const TextStyle(
        color: Color(0xFF405B72),
        fontWeight: FontWeight.w700,
      ),
      hintStyle: const TextStyle(color: Color(0xFF64748B)),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFC7D4DF)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFC7D4DF)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: kenyaGreen, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: kenyaGreen,
        foregroundColor: Colors.white,
        disabledBackgroundColor: const Color(0xFFD7E0E8),
        disabledForegroundColor: const Color(0xFF53697B),
        minimumSize: const Size(64, 52),
        textStyle: const TextStyle(fontWeight: FontWeight.w900),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kenyaGreen,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 54),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: kenyaGreen,
      foregroundColor: Colors.white,
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: const Color(0xFF0B4F91),
        side: const BorderSide(color: Color(0xFF7FAFD8)),
        minimumSize: const Size(64, 50),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: const Color(0xFF0B4F91),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Color(0xFF102F4D),
      contentTextStyle: TextStyle(color: Colors.white),
      actionTextColor: Color(0xFF9FD5FF),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: const Color(0xFFD8ECFD),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? kenyaGreen
              : const Color(0xFF52697E),
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected) ? kenyaGreen : ink,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: const Color(0xFFE5EBF0),
      selectedColor: kenyaGreen,
      labelStyle: const TextStyle(color: ink, fontWeight: FontWeight.w700),
      secondaryLabelStyle: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w800,
      ),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
  );
}
