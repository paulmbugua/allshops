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
      fillColor: Color(0xFFF8FAFC),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
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
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: kenyaGold.withValues(alpha: .55),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected) ? kenyaGreen : ink,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: kenyaGold.withValues(alpha: .28),
      selectedColor: kenyaGreen,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
  );
}
