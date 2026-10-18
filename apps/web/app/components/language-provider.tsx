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

type Language = "en" | "sw";
type LanguageContextValue = {
  language: Language;
  setLanguage: (value: Language) => void;
  t: (english: string) => string;
};

const translations: Record<string, string> = {
  Dashboard: "Dashibodi",
  Sales: "Mauzo",
  "Point of Sale": "Sehemu ya mauzo",
  "Offline sync": "Usawazishaji bila mtandao",
  "Sales history": "Historia ya mauzo",
  Reports: "Ripoti",
  "End-of-day cash-up": "Hesabu ya mwisho wa siku",
  Services: "Huduma",
  Appointments: "Miadi",
  Staff: "Wafanyakazi",
  Commissions: "Kamisheni",
  "Commission rules": "Kanuni za kamisheni",
  Catalogue: "Katalogi",
  Products: "Bidhaa",
  Categories: "Aina",
  Brands: "Chapa",
  Units: "Vipimo",
  Inventory: "Stoo",
  Movements: "Miamala ya stoo",
  Transfers: "Uhamisho",
  Purchasing: "Manunuzi",
  Purchases: "Manunuzi",
  Suppliers: "Wasambazaji",
  Customers: "Wateja",
  "Customers & credit": "Wateja na mikopo",
  Expenses: "Gharama",
  "Expense history": "Historia ya gharama",
  Settings: "Mipangilio",
  Business: "Biashara",
  Branches: "Matawi",
  Users: "Watumiaji",
  "POS devices": "Vifaa vya POS",
  Subscription: "Usajili",
  "Help & diagnostics": "Msaada na uchunguzi",
  "Sign out": "Ondoka",
  "Loading your access…": "Inapakia ruhusa zako…",
  "Restricted workspace": "Sehemu yenye vizuizi",
  "Access not assigned": "Ruhusa haijapangwa",
  "Users & roles": "Watumiaji na majukumu",
  "End-of-day reconciliation": "Upatanisho wa mwisho wa siku",
  Purchase: "Ununuzi",
  "Support diagnostics": "Msaada na uchunguzi",
  "Expense categories": "Aina za gharama",
  Customer: "Mteja",
  "New customer": "Mteja mpya",
  "New purchase": "Ununuzi mpya",
  Supplier: "Msambazaji",
  "Held sale": "Mauzo yaliyoshikiliwa",
  Product: "Bidhaa",
  "New product": "Bidhaa mpya",
  "Stock movements": "Miamala ya stoo",
  "Stock transfers": "Uhamisho wa stoo",
  "Welcome back": "Karibu tena",
  Email: "Barua pepe",
  "Email address": "Anwani ya barua pepe",
  Password: "Nenosiri",
  "Forgot password?": "Umesahau nenosiri?",
  "Forgot your password?": "Umesahau nenosiri?",
  "Resend activation": "Tuma uanzishaji tena",
  "Sign in": "Ingia",
  "Signing in…": "Inaingia…",
  "Create an account": "Fungua akaunti",
  "Create account": "Fungua akaunti",
  "Full name": "Jina kamili",
  "Confirm password": "Thibitisha nenosiri",
  "Check your inbox": "Angalia barua pepe yako",
  "Activate your account": "Washa akaunti yako",
  "Continue to sign in": "Endelea kuingia",
  "Account activation": "Uanzishaji wa akaunti",
  "Send reset link": "Tuma kiungo cha kubadili nenosiri",
  "Reset password": "Badili nenosiri",
  "New password": "Nenosiri jipya",
  "Business onboarding": "Usanidi wa biashara",
  "Set up your business": "Sanidi biashara yako",
  "Business name": "Jina la biashara",
  "Business type": "Aina ya biashara",
  "Business phone": "Simu ya biashara",
  "Business email": "Barua pepe ya biashara",
  Retail: "Rejareja",
  Grocery: "Duka la vyakula",
  "Restaurant / café": "Mkahawa",
  Salon: "Saluni",
  Barbershop: "Kinyozi",
  "General services": "Huduma za jumla",
  Other: "Nyingine",
  "First branch": "Tawi la kwanza",
  "Branch name": "Jina la tawi",
  Address: "Anwani",
  Phone: "Simu",
  "Complete setup": "Kamilisha usanidi",
  "Creating workspace…": "Inatengeneza mfumo…",
  "Currency: KES · Timezone: Africa/Nairobi":
    "Sarafu: KES · Saa: Africa/Nairobi",
  "Local / Kiswahili name": "Jina la Kiswahili",
  "Shop identity": "Utambulisho wa biashara",
  "Welcome screen": "Skrini ya kukaribisha",
  "Company logo": "Nembo ya kampuni",
  "Legal name": "Jina la kisheria",
  Tagline: "Kauli mbiu",
  "Save changes": "Hifadhi mabadiliko",
  "Saving…": "Inahifadhi…",
  "Business details saved.": "Maelezo ya biashara yamehifadhiwa.",
  "Loading…": "Inapakia…",
  Loading: "Inapakia",
  Search: "Tafuta",
  Apply: "Tumia",
  Select: "Chagua",
  Save: "Hifadhi",
  Cancel: "Ghairi",
  Confirm: "Thibitisha",
  Complete: "Kamilisha",
  Delete: "Futa",
  Edit: "Hariri",
  Add: "Ongeza",
  New: "Mpya",
  Name: "Jina",
  Status: "Hali",
  Date: "Tarehe",
  Description: "Maelezo",
  Reference: "Rejeleo",
  Amount: "Kiasi",
  Quantity: "Idadi",
  Price: "Bei",
  Cost: "Gharama",
  Total: "Jumla",
  Subtotal: "Jumla ndogo",
  Discount: "Punguzo",
  Tax: "Kodi",
  Payment: "Malipo",
  "Payment method": "Njia ya malipo",
  Cash: "Pesa taslimu",
  CASH: "PESA TASLIMU",
  CARD: "KADI",
  "Local bank card": "Kadi ya benki",
  "Walk-in customer": "Mteja wa dukani",
  Cart: "Kikapu",
  "Scan or select a product.": "Skani au chagua bidhaa.",
  "Scanner ready": "Skana iko tayari",
  "Live register": "Kaunta iko wazi",
  "Sale complete": "Mauzo yamekamilika",
  "Current stock": "Stoo ya sasa",
  "Low stock": "Stoo iko chini",
  "Healthy stock": "Stoo iko sawa",
  "Create draft purchase": "Tengeneza rasimu ya ununuzi",
  "Receive stock": "Pokea bidhaa",
  "Record payment": "Rekodi malipo",
  "Record expense": "Rekodi gharama",
  "Add user": "Ongeza mtumiaji",
  "Add branch": "Ongeza tawi",
  "Book appointment": "Weka miadi",
  "Daily branch cash-up": "Hesabu ya kila siku ya tawi",
  "Expected cash": "Pesa inayotarajiwa",
  Counted: "Iliyohesabiwa",
  Variance: "Tofauti",
  "Gross profit": "Faida ghafi",
  "Net sales": "Mauzo halisi",
  "Total sales": "Jumla ya mauzo",
  "Average sale": "Wastani wa mauzo",
  "Billing history": "Historia ya malipo",
  "AllShops plans": "Mipango ya AllShops",
  "Frequently asked questions": "Maswali yanayoulizwa mara kwa mara",
  "Try again": "Jaribu tena",
  "All branches": "Matawi yote",
  "Choose branch": "Chagua tawi",
  "Select branch": "Chagua tawi",
  "Select supplier": "Chagua msambazaji",
  "Select service": "Chagua huduma",
  "Select staff": "Chagua mfanyakazi",
  "Select category": "Chagua aina",
  "Product image": "Picha ya bidhaa",
  "Unit price": "Bei ya kipimo",
  "Unit cost": "Gharama ya kipimo",
  "Credit limit": "Kikomo cha mkopo",
  "Opening stock": "Stoo ya kuanzia",
  From: "Kutoka",
  To: "Kwenda",
  Role: "Wajibu",
  Branch: "Tawi",
  Active: "Inatumika",
  Inactive: "Haitumiki",
  Paid: "Imelipwa",
  Outstanding: "Bado kulipwa",
  "Plans built for Kenyan businesses": "Mipango kwa biashara za Kenya",
  "Choose the way your business grows": "Chagua njia ya kukuza biashara yako",
  Monthly: "Kila mwezi",
  Annual: "Kila mwaka",
  "2 months free": "Miezi 2 bila malipo",
  "Most popular": "Maarufu zaidi",
  "Current plan": "Mpango wa sasa",
  Unlimited: "Bila kikomo",
};

const dynamicTranslations: Array<[RegExp, (...parts: string[]) => string]> = [
  [/^Create (.+)$/i, (value) => `Tengeneza ${translations[value] ?? value}`],
  [/^New (.+)$/i, (value) => `${translations[value] ?? value} mpya`],
  [/^Select (.+)$/i, (value) => `Chagua ${translations[value] ?? value}`],
  [/^Add (.+)$/i, (value) => `Ongeza ${translations[value] ?? value}`],
  [/^Loading (.+)…$/i, (value) => `Inapakia ${translations[value] ?? value}…`],
  [
    /^Page (\d+) of (\d+)$/i,
    (page, total) => `Ukurasa ${page} kati ya ${total}`,
  ],
  [/^(\d+) items?$/i, (count) => `Bidhaa ${count}`],
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

const sourceText = new WeakMap<Text, string>();

function LocalizedDocument({ language }: { language: Language }) {
  useEffect(() => {
    const attributes = ["placeholder", "title", "aria-label"];
    let applying = false;
    const translateNode = (root: Node) => {
      applying = true;
      const nodes: Text[] = [];
      if (root.nodeType === Node.TEXT_NODE) nodes.push(root as Text);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const node of nodes) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(
            "script, style, [data-no-translate], [data-manual-locale]",
          )
        )
          continue;
        if (!sourceText.has(node)) sourceText.set(node, node.data);
        const original = sourceText.get(node) ?? node.data;
        node.data = language === "sw" ? translateText(original) : original;
      }
      const elements =
        root.nodeType === Node.ELEMENT_NODE
          ? [root as Element, ...(root as Element).querySelectorAll("*")]
          : [];
      for (const element of elements) {
        if (element.closest("[data-no-translate], [data-manual-locale]"))
          continue;
        for (const attribute of attributes) {
          const original =
            element.getAttribute(`data-i18n-${attribute}`) ??
            element.getAttribute(attribute);
          if (original === null) continue;
          element.setAttribute(`data-i18n-${attribute}`, original);
          element.setAttribute(
            attribute,
            language === "sw" ? translateText(original) : original,
          );
        }
      }
      applying = false;
    };
    translateNode(document.body);
    const observer = new MutationObserver((records) => {
      if (applying) return;
      for (const record of records) record.addedNodes.forEach(translateNode);
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
    if (saved === "sw" || saved === "en") setLanguageState(saved);
    const sync = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      if (next === "sw" || next === "en") setLanguageState(next);
    };
    window.addEventListener(DISPLAY_LANGUAGE_EVENT, sync);
    return () => window.removeEventListener(DISPLAY_LANGUAGE_EVENT, sync);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = "ltr";
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
      t: (english) => (language === "sw" ? translateText(english) : english),
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
        className={language === "sw" ? "active" : ""}
        onClick={() => setLanguage("sw")}
        type="button"
      >
        SW
      </button>
    </div>
  );
}
