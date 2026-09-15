"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DISPLAY_LANGUAGE_EVENT,
  DISPLAY_LANGUAGE_KEY,
} from "../lib/public-locale";

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
  "Post stock movement": "تسجيل حركة مخزون",
  "Merchant access": "دخول التاجر",
  "Welcome back": "مرحباً بعودتك",
  Email: "البريد الإلكتروني",
  "Email address": "عنوان البريد الإلكتروني",
  Password: "كلمة المرور",
  "Forgot password?": "هل نسيت كلمة المرور؟",
  "Forgot your password?": "هل نسيت كلمة المرور؟",
  "Resend activation": "إعادة إرسال التفعيل",
  "Sign in": "تسجيل الدخول",
  "Signing in…": "جارٍ تسجيل الدخول…",
  "New to AllShops?": "جديد في AllShops؟",
  "Create an account": "إنشاء حساب",
  "Create account": "إنشاء الحساب",
  "Full name": "الاسم الكامل",
  "Confirm password": "تأكيد كلمة المرور",
  "Already registered?": "لديك حساب بالفعل؟",
  "Check your inbox": "تحقق من بريدك الوارد",
  "Activate your account": "فعّل حسابك",
  "Continue to sign in": "المتابعة إلى تسجيل الدخول",
  "Account activation": "تفعيل الحساب",
  "Activate account": "تفعيل الحساب",
  "Resend activation email": "إعادة إرسال رسالة التفعيل",
  "Secure account recovery": "استعادة آمنة للحساب",
  "Send reset link": "إرسال رابط إعادة التعيين",
  "Sending…": "جارٍ الإرسال…",
  "Return to sign in": "العودة إلى تسجيل الدخول",
  "Protected password reset": "إعادة تعيين محمية لكلمة المرور",
  "Reset password": "إعادة تعيين كلمة المرور",
  "New password": "كلمة المرور الجديدة",
  "Business onboarding": "إعداد المنشأة",
  "Set up your business": "إعداد منشأتك",
  "Business name": "اسم المنشأة",
  "Business type": "نوع النشاط",
  "Business phone": "هاتف المنشأة",
  "Business email": "بريد المنشأة",
  Retail: "تجزئة",
  Grocery: "بقالة",
  "Restaurant / café": "مطعم / مقهى",
  Salon: "صالون",
  Barbershop: "حلاقة",
  "General services": "خدمات عامة",
  Other: "أخرى",
  "First branch": "الفرع الأول",
  "Branch name": "اسم الفرع",
  Address: "العنوان",
  Phone: "الهاتف",
  "Complete setup": "إكمال الإعداد",
  "Creating workspace…": "جارٍ إنشاء مساحة العمل…",
  "Currency: QAR · Timezone: Asia/Qatar":
    "العملة: ر.ق · المنطقة الزمنية: قطر",
  "The branch ID is generated automatically from its name.":
    "يتم إنشاء رمز الفرع تلقائياً من اسمه.",
  "Shop identity": "هوية المتجر",
  "Welcome screen": "شاشة الترحيب",
  "Preview welcome screen": "معاينة شاشة الترحيب",
  "Company logo": "شعار المنشأة",
  "Legal name": "الاسم القانوني",
  "Arabic name": "الاسم العربي",
  "Welcome headline": "عنوان الترحيب",
  Tagline: "العبارة التعريفية",
  Motto: "الشعار النصي",
  "Welcome message": "رسالة الترحيب",
  "Idle timeout (minutes)": "مهلة الخمول (بالدقائق)",
  "Primary colour": "اللون الأساسي",
  "Accent colour": "اللون المميز",
  "Save changes": "حفظ التغييرات",
  "Saving…": "جارٍ الحفظ…",
  "Business details saved.": "تم حفظ بيانات المنشأة.",
  "Loading…": "جارٍ التحميل…",
  Loading: "جارٍ التحميل",
  Search: "بحث",
  Apply: "تطبيق",
  Select: "اختيار",
  Save: "حفظ",
  Cancel: "إلغاء",
  Confirm: "تأكيد",
  Complete: "إكمال",
  Delete: "حذف",
  Edit: "تعديل",
  Add: "إضافة",
  New: "جديد",
  Name: "الاسم",
  Status: "الحالة",
  Date: "التاريخ",
  Description: "الوصف",
  Reference: "المرجع",
  Amount: "المبلغ",
  Quantity: "الكمية",
  Price: "السعر",
  Cost: "التكلفة",
  Total: "الإجمالي",
  Subtotal: "الإجمالي الفرعي",
  Discount: "الخصم",
  Tax: "الضريبة",
  Payment: "الدفع",
  "Payment method": "طريقة الدفع",
  Cash: "نقداً",
  CASH: "نقداً",
  CARD: "بطاقة",
  "Local bank card": "بطاقة بنكية محلية",
  "Walk-in customer": "عميل مباشر",
  Cart: "السلة",
  "Scan or select a product.": "امسح أو اختر منتجاً.",
  "Scanner ready": "الماسح جاهز",
  "Live register": "صندوق نشط",
  "Sale complete": "اكتملت عملية البيع",
  "Current stock": "المخزون الحالي",
  "Stock item": "صنف مخزون",
  "Non-stock item": "صنف غير مخزني",
  "Low stock": "مخزون منخفض",
  "Healthy stock": "مخزون جيد",
  "Create draft purchase": "إنشاء مسودة شراء",
  "Receive stock": "استلام المخزون",
  "Record payment": "تسجيل دفعة",
  "Record expense": "تسجيل مصروف",
  "Add user": "إضافة مستخدم",
  "Add branch": "إضافة فرع",
  "Add service": "إضافة خدمة",
  "Book appointment": "حجز موعد",
  "Daily branch cash-up": "تسوية الفرع اليومية",
  "Submit end-of-day cash-up": "إرسال تسوية نهاية اليوم",
  "Expected cash": "النقد المتوقع",
  "Counted": "المبلغ المعدود",
  "Variance": "الفرق",
  "Gross profit": "إجمالي الربح",
  "Net sales": "صافي المبيعات",
  "Total sales": "إجمالي المبيعات",
  "Average sale": "متوسط البيع",
  "Billing history": "سجل الفواتير",
  "AllShops plans": "باقات AllShops",
  "Frequently asked questions": "الأسئلة الشائعة",
  "Answers for your workspace": "إجابات لمساحة عملك",
  "No answers match that search.": "لا توجد إجابات مطابقة للبحث.",
  "Try again": "حاول مرة أخرى",
  "All branches": "كل الفروع",
  "All statuses": "كل الحالات",
  "All types": "كل الأنواع",
  "All stock": "كل المخزون",
  "Choose branch": "اختر الفرع",
  "Select branch": "اختر الفرع",
  "Select supplier": "اختر المورد",
  "Select service": "اختر الخدمة",
  "Select staff": "اختر الموظف",
  "Select category": "اختر الفئة",
  "Product image": "صورة المنتج",
  "Unit price": "سعر الوحدة",
  "Unit cost": "تكلفة الوحدة",
  "Credit limit": "حد الائتمان",
  "Customer outstanding": "مديونية العميل",
  "Supplier outstanding": "المستحق للمورد",
  "Opening stock": "المخزون الافتتاحي",
  "Adjustment in": "تسوية إضافة",
  "Adjustment out": "تسوية خصم",
  "Confirm movement": "تأكيد الحركة",
  "New stock transfer": "تحويل مخزون جديد",
  From: "من",
  To: "إلى",
  Role: "الدور",
  Branch: "الفرع",
  Active: "نشط",
  Inactive: "غير نشط",
  Paid: "مدفوع",
  Outstanding: "مستحق",
};

const dynamicTranslations: Array<[RegExp, (...parts: string[]) => string]> = [
  [/^Create (.+)$/i, (value) => `إنشاء ${translations[value] ?? value}`],
  [/^New (.+)$/i, (value) => `${translations[value] ?? value} جديد`],
  [/^Select (.+)$/i, (value) => `اختر ${translations[value] ?? value}`],
  [/^Add (.+)$/i, (value) => `إضافة ${translations[value] ?? value}`],
  [/^Loading (.+)…$/i, (value) => `جارٍ تحميل ${translations[value] ?? value}…`],
  [/^Page (\d+) of (\d+)$/i, (page, total) => `الصفحة ${page} من ${total}`],
  [/^(\d+) items?$/i, (count) => `${count} عنصر`],
];

export function translateText(english: string) {
  const normalized = english.trim();
  if (!normalized) return english;
  const exact = translations[normalized];
  if (exact) return english.replace(normalized, exact);
  for (const [pattern, render] of dynamicTranslations) {
    const match = normalized.match(pattern);
    if (match) return english.replace(normalized, render(...match.slice(1)));
  }
  return english;
}

function LocalizedDocument({ language }: { language: Language }) {
  useEffect(() => {
    const originals = new WeakMap<Text, string>();
    const attributeOriginals = new WeakMap<Element, Map<string, string>>();
    const localizedMutations = new WeakSet<Text>();
    const attributes = ["placeholder", "title", "aria-label"];
    let applying = false;
    const translateNode = (root: Node) => {
      applying = true;
      const textNodes: Text[] = [];
      if (root.nodeType === Node.TEXT_NODE) textNodes.push(root as Text);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
      for (const node of textNodes) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, [data-no-translate]")) continue;
        if (!originals.has(node)) originals.set(node, node.data);
        const original = originals.get(node) ?? node.data;
        const localized = language === "ar" ? translateText(original) : original;
        if (node.data !== localized) {
          localizedMutations.add(node);
          node.data = localized;
        }
      }
      const elements = root.nodeType === Node.ELEMENT_NODE
        ? [root as Element, ...(root as Element).querySelectorAll("*")]
        : [];
      for (const element of elements) {
        if (element.closest("[data-no-translate]")) continue;
        let saved = attributeOriginals.get(element);
        if (!saved) {
          saved = new Map();
          attributeOriginals.set(element, saved);
        }
        for (const attribute of attributes) {
          const current = element.getAttribute(attribute);
          if (current === null) continue;
          if (!saved.has(attribute)) saved.set(attribute, current);
          const original = saved.get(attribute) ?? current;
          element.setAttribute(
            attribute,
            language === "ar" ? translateText(original) : original,
          );
        }
      }
      applying = false;
    };
    translateNode(document.body);
    const observer = new MutationObserver((records) => {
      if (applying) return;
      for (const record of records) {
        if (record.type === "characterData") {
          if (localizedMutations.has(record.target as Text)) {
            localizedMutations.delete(record.target as Text);
            continue;
          }
          originals.delete(record.target as Text);
          translateNode(record.target);
        }
        record.addedNodes.forEach(translateNode);
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [language]);
  return null;
}
const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (value) => value,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem(DISPLAY_LANGUAGE_KEY);
    if (saved === "ar" || saved === "en") setLanguageState(saved);
    const syncLanguage = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next === "ar" || next === "en") setLanguageState(next);
    };
    window.addEventListener(DISPLAY_LANGUAGE_EVENT, syncLanguage);
    return () => window.removeEventListener(DISPLAY_LANGUAGE_EVENT, syncLanguage);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    window.localStorage.setItem(DISPLAY_LANGUAGE_KEY, language);
  }, [language]);
  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (next) => {
        setLanguageState(next);
        window.dispatchEvent(
          new CustomEvent(DISPLAY_LANGUAGE_EVENT, { detail: next }),
        );
      },
      t: (english) =>
        language === "ar" ? translateText(english) : english,
    }),
    [language],
  );
  return (
    <LanguageContext.Provider value={value}>
      <LocalizedDocument language={language} />
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
