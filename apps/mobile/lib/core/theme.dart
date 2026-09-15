import 'package:flutter/material.dart';

abstract final class AllShopsTheme {
  static const coral = Color(0xFFF35F45);
  static const ink = Color(0xFF172C2B);
  static const mint = Color(0xFF35B77D);
  static const sun = Color(0xFFFFCF5C);
  static const qatarMaroon = Color(0xFF6D1738);
  static const qatarSand = Color(0xFFF3DFC1);
  static const canvas = Color(0xFFF7F9F6);
  static ThemeData get light => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: qatarMaroon,
      primary: qatarMaroon,
      secondary: mint,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: const Color(0xFFF8F5F1),
    appBarTheme: const AppBarTheme(
      backgroundColor: Color(0xFFF8F5F1),
      elevation: 0,
      foregroundColor: ink,
    ),
    cardTheme: CardThemeData(
      elevation: 1,
      shadowColor: qatarMaroon.withValues(alpha: .08),
      color: Colors.white,
      margin: EdgeInsets.zero,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(22)),
        side: BorderSide(color: Color(0x14_6D1738)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: qatarMaroon,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 54),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: qatarMaroon,
      foregroundColor: Colors.white,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: qatarSand,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(
          color: states.contains(WidgetState.selected) ? qatarMaroon : ink,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: qatarSand.withValues(alpha: .48),
      selectedColor: qatarMaroon,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
    ),
  );
}
