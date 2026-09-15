"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Language = "en" | "ar";
type LanguageContextValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  t: (english: string) => string;
};
const translations: Record<string, string> = {
  Dashboard: "لوحة المعلومات",
  Sales: "المبيعات",
  "Point of Sale": "نقطة البيع",
  "Offline sync": "المزامنة دون اتصال",
  "Sales history": "سجل المبيعات",
  Reports: "التقارير",
  "End-of-day cash-up": "تسوية نهاية اليوم",
  Services: "الخدمات",
  Appointments: "المواعيد",
  Staff: "الموظفون",
  Commissions: "العمولات",
  "Commission rules": "قواعد العمولة",
  Catalogue: "الكتالوج",
  Products: "المنتجات",
  Categories: "الفئات",
  Brands: "العلامات التجارية",
  Units: "الوحدات",
  Inventory: "المخزون",
  "Current stock": "المخزون الحالي",
  Movements: "الحركات",
  Transfers: "التحويلات",
  Purchasing: "المشتريات",
  Purchases: "أوامر الشراء",
  Suppliers: "الموردون",
  Customers: "العملاء",
  "Customers & credit": "العملاء والائتمان",
  Expenses: "المصروفات",
  "Expense history": "سجل المصروفات",
  Settings: "الإعدادات",
  Business: "المنشأة",
  Branches: "الفروع",
  Users: "المستخدمون",
  "POS devices": "أجهزة نقاط البيع",
  Subscription: "الاشتراك",
  "Help & diagnostics": "المساعدة والتشخيص",
  "Sign out": "تسجيل الخروج",
  "Loading your access…": "جارٍ تحميل صلاحياتك…",
  "Restricted workspace": "مساحة عمل مقيّدة",
  "Access not assigned": "لم يتم تعيين الصلاحية",
  "Your role does not include the permission required for this area. Ask an owner or administrator to update your role.":
    "لا يتضمن دورك الصلاحية المطلوبة لهذه المنطقة. اطلب من المالك أو المسؤول تحديث دورك.",
  English: "English",
  Arabic: "العربية",
  "Users & roles": "المستخدمون والأدوار",
  "End-of-day reconciliation": "تسوية نهاية اليوم",
  Purchase: "أمر شراء",
  "Support diagnostics": "الدعم والتشخيص",
  "Expense categories": "فئات المصروفات",
  "Appointment details": "تفاصيل الموعد",
  Customer: "العميل",
  "Record expense": "تسجيل مصروف",
  "New customer": "عميل جديد",
  "New purchase": "أمر شراء جديد",
  Supplier: "المورد",
  "Held sale": "عملية بيع معلّقة",
  "Staff profile": "ملف الموظف",
  "New supplier": "مورد جديد",
  "Business settings": "إعدادات المنشأة",
  "New staff member": "موظف جديد",
  Product: "المنتج",
  "New product": "منتج جديد",
  "Stock movements": "حركات المخزون",
  "Subscription payment": "دفع الاشتراك",
  "Stock transfers": "تحويلات المخزون",
  "Offline synchronization": "المزامنة دون اتصال",
  Transfer: "التحويل",
  "New stock transfer": "تحويل مخزون جديد",
  "Post stock movement": "تسجيل حركة مخزون",
};
const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (value) => value,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem("allshops_display_language");
    if (saved === "ar" || saved === "en") setLanguageState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem("allshops_display_language", language);
  }, [language]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next) => setLanguageState(next),
      t: (english) =>
        language === "ar" ? (translations[english] ?? english) : english,
    }),
    [language],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="app-language-toggle" role="group" aria-label="Language">
      <button
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
        type="button"
      >
        EN
      </button>
      <button
        className={language === "ar" ? "active" : ""}
        onClick={() => setLanguage("ar")}
        type="button"
      >
        ع
      </button>
    </div>
  );
}
